import type { RouteDefinition, BridgeConfig, HookContext, WebSocketHandler } from '../shared/types';
import { HookExecutor } from '../shared/executor';
import { validateInput, validateOutput } from '../shared/validation';
import {
  formatSuccessResponse,
  formatErrorResponse,
  formatValidationErrorResponse,
} from '../shared/response';
import { HttpStatus, ErrorCode } from '../shared/error';
import { normalizeBunRequest } from './normalize';
import { WebSocketConnectionImpl, generateConnectionId } from '../shared/websocket';

// Bun WebSocket types
type ServerWebSocket = any;
type Server = any;

// ============================================================================
// BUN ADAPTER
// ============================================================================

/**
 * Creates a Bun fetch handler and WebSocket configuration from bridge configuration.
 * 
 * This adapter integrates the shared hook execution engine with Bun's native
 * HTTP server and WebSocket support, handling request normalization, validation,
 * hook execution, and response formatting using Web API standards.
 * 
 * @param routes - Map of route definitions
 * @param config - Bridge configuration
 * @returns Object with fetch handler and optional websocket configuration
 * 
 * @example
 * ```typescript
 * const routes = new Map([
 *   ['getUser', {
 *     method: 'GET',
 *     input: z.object({ id: z.string() }),
 *     handler: async ({ id }) => ({ id, name: 'John' })
 *   }]
 * ]);
 * 
 * const { fetch, websocket } = createBunMiddleware(routes, {
 *   prefix: '/api',
 *   hooks: [rateLimitHook, loggerHook]
 * });
 * 
 * Bun.serve({
 *   port: 3000,
 *   fetch,
 *   websocket
 * });
 * ```
 */
export function createBunMiddleware(
  routes: Map<string, RouteDefinition>,
  config: BridgeConfig
): {
  fetch: (req: Request, server: Server) => Promise<Response>;
  websocket?: any;
} {
  const executor = new HookExecutor();
  const globalHooks = config.hooks || [];
  
  // Check if any routes are WebSocket routes
  const hasWebSocketRoutes = Array.from(routes.values()).some(route => route.kind === 'ws');

  const fetch = async (req: Request, server: Server): Promise<Response> => {
    try {
      // Extract route name from URL
      const url = new URL(req.url);
      const routeName = extractRouteFromUrl(url.pathname, config.prefix);

      if (!routeName) {
        return sendBunError(HttpStatus.NOT_FOUND, ErrorCode.ROUTE_NOT_FOUND, 'Route not found');
      }

      const routeDef = routes.get(routeName);
      if (!routeDef) {
        return sendBunError(
          HttpStatus.NOT_FOUND,
          ErrorCode.ROUTE_NOT_FOUND,
          `Route ${routeName} not found`
        );
      }

      // Handle WebSocket upgrade
      if (routeDef.kind === 'ws') {
        return await handleBunWebSocketUpgrade(
          req,
          server,
          url,
          routeName,
          routeDef,
          config,
          executor,
          globalHooks
        );
      }

      // Validate HTTP method
      const expectedMethod = routeDef.method || 'POST';
      if (req.method !== expectedMethod) {
        return sendBunError(
          HttpStatus.METHOD_NOT_ALLOWED,
          ErrorCode.METHOD_NOT_ALLOWED,
          `Expected ${expectedMethod}, got ${req.method}`
        );
      }

      // Extract input based on method
      let input: unknown;
      if (expectedMethod === 'GET') {
        // Parse query parameters
        const query: Record<string, string | string[]> = {};
        url.searchParams.forEach((value, key) => {
          const existing = query[key];
          if (existing) {
            if (Array.isArray(existing)) {
              existing.push(value);
            } else {
              query[key] = [existing, value];
            }
          } else {
            query[key] = value;
          }
        });
        input = query;
      } else {
        // Parse JSON body
        try {
          input = await req.json();
        } catch {
          input = {};
        }
      }

      // Log request if enabled
      if (config.logRequests) {
        console.log(`[${expectedMethod}] ${routeName}`, input || {});
      }

      // Validate input
      if (routeDef.input) {
        const validation = validateInput(routeDef.input, input);
        if (!validation.success) {
          const errorResponse = formatValidationErrorResponse(validation.errors!);
          return Response.json(errorResponse, { status: HttpStatus.BAD_REQUEST });
        }
        input = validation.data;
      }

      // Normalize request
      const normalizedReq = await normalizeBunRequest(req, url, input);

      // Create platform context (native Bun Request)
      const platform = { type: 'bun' as const, req };
      const hookContext: HookContext = {
        req: normalizedReq,
        platform,
        method: expectedMethod,
        route: routeName,
        input,
        context: { platform },
      };

      // Combine global and route hooks
      const allHooks = executor.combineHooks(globalHooks, routeDef.hooks);

      const result = await executor.execute(allHooks, routeDef.handler as any, hookContext);

      // Handle execution result
      if (!result.success) {
        // Map status code to appropriate error code
        let errorCode: string = ErrorCode.INTERNAL_ERROR;
        if (result.status === HttpStatus.UNAUTHORIZED) {
          errorCode = ErrorCode.UNAUTHORIZED;
        } else if (result.status === HttpStatus.FORBIDDEN) {
          errorCode = ErrorCode.FORBIDDEN;
        } else if (result.status === HttpStatus.NOT_FOUND) {
          errorCode = ErrorCode.NOT_FOUND;
        } else if (result.status === HttpStatus.TOO_MANY_REQUESTS) {
          errorCode = ErrorCode.TOO_MANY_REQUESTS;
        }
        
        const errorResponse = formatErrorResponse(
          errorCode,
          result.error,
          { status: result.status }
        );
        return Response.json(errorResponse, { status: result.status });
      }

      if (routeDef.kind === 'sse') {
        const data = result.data as any;
        const isAsyncIterable = data && typeof data === 'object' && Symbol.asyncIterator in data;
        if (!isAsyncIterable) {
          const errorResponse = formatErrorResponse(
            ErrorCode.INTERNAL_ERROR,
            'SSE handler must return AsyncIterable',
            {}
          );
          return Response.json(errorResponse, { status: HttpStatus.INTERNAL_SERVER_ERROR });
        }
        const stream = new ReadableStream({
          start(controller) {
            (async () => {
              try {
                for await (const ev of data as AsyncIterable<any>) {
                  const s = typeof ev === 'string' ? ev : JSON.stringify(ev);
                  controller.enqueue(new TextEncoder().encode(`data: ${s}\n\n`));
                }
              } catch (e) {
                controller.enqueue(
                  new TextEncoder().encode(
                    `event: error\n` +
                      `data: ${JSON.stringify({ message: (e as any)?.message || 'stream error' })}\n\n`
                  )
                );
              } finally {
                controller.close();
              }
            })();
          },
        });
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        });
      }

      if (routeDef.output && config.validateResponses) {
        const validation = validateOutput(routeDef.output, result.data);
        if (!validation.success) {
          const errorResponse = formatErrorResponse(
            ErrorCode.INTERNAL_ERROR,
            'Output validation failed (server bug)',
            { issues: validation.errors }
          );
          return Response.json(errorResponse, { status: HttpStatus.INTERNAL_SERVER_ERROR });
        }
      }
      return sendBunSuccess(result.data);
    } catch (error) {
      console.error('Bun adapter error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return sendBunError(HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_ERROR, message);
    }
  };

  // Create WebSocket handler if there are WebSocket routes
  const websocket = hasWebSocketRoutes ? createBunWebSocketHandler(routes, config, executor, globalHooks) : undefined;

  return { fetch, websocket };
}

/**
 * Sends success response in Bun format (native Response).
 * 
 * @param data - Response data
 * @returns Native Response object
 * 
 * @example
 * ```typescript
 * return sendBunSuccess({ id: '123', name: 'John' });
 * ```
 */
function sendBunSuccess(data: any): Response {
  const response = formatSuccessResponse(data);
  return Response.json(response, { status: HttpStatus.OK });
}

/**
 * Sends error response in Bun format (native Response).
 * 
 * @param status - HTTP status code
 * @param code - Error code
 * @param message - Error message
 * @param details - Optional error details
 * @returns Native Response object
 * 
 * @example
 * ```typescript
 * return sendBunError(401, 'unauthorized', 'Invalid token');
 * ```
 */
function sendBunError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
): Response {
  const response = formatErrorResponse(code, message, details);
  return Response.json(response, { status });
}

/**
 * Extracts route name from URL path.
 * 
 * @param pathname - URL pathname
 * @param prefix - API prefix
 * @returns Route name or null
 * 
 * @internal
 * 
 * @example
 * ```typescript
 * extractRouteFromUrl('/api/getUser', '/api'); // 'getUser'
 * extractRouteFromUrl('/api/users/123', '/api'); // 'users'
 * ```
 */
function extractRouteFromUrl(pathname: string, prefix?: string): string | null {
  const cleanPrefix = prefix || '/api';
  const prefixPattern = cleanPrefix.replace(/\//g, '\\/');
  const match = pathname.match(new RegExp(`${prefixPattern}/([^/]+)`));
  return match ? match[1] : null;
}

// ============================================================================
// WEBSOCKET SUPPORT
// ============================================================================

/**
 * WebSocket connection data stored in ws.data
 */
interface BunWebSocketData {
  routeName: string;
  routeDef: RouteDefinition;
  userHandlers: WebSocketHandler;
  context: any;
  connectionId: string;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  cleanup: any[];
  success: boolean;
}

/**
 * Handles WebSocket upgrade for Bun.
 * 
 * @param req - Request object
 * @param server - Bun server instance
 * @param url - Parsed URL
 * @param routeName - Route name
 * @param routeDef - Route definition
 * @param config - Bridge configuration
 * @param executor - Hook executor
 * @param globalHooks - Global hooks
 * @returns Response (undefined if upgrade succeeds)
 * 
 * @internal
 */
async function handleBunWebSocketUpgrade(
  req: Request,
  server: Server,
  url: URL,
  routeName: string,
  routeDef: RouteDefinition,
  config: BridgeConfig,
  executor: HookExecutor,
  globalHooks: any[]
): Promise<Response> {
  // Validate that handler is a WebSocket handler
  const wsHandler = routeDef.handler as WebSocketHandler;
  if (typeof wsHandler !== 'object' || !wsHandler.onMessage) {
    return sendBunError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      ErrorCode.INTERNAL_ERROR,
      'Invalid WebSocket handler'
    );
  }

  // Extract and validate query parameters (handshake input)
  const query: Record<string, string | string[]> = {};
  url.searchParams.forEach((value, key) => {
    const existing = query[key];
    if (existing) {
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        query[key] = [existing, value];
      }
    } else {
      query[key] = value;
    }
  });

  let input: unknown = query;

  // Validate query parameters if input schema is defined
  if (routeDef.input) {
    const validation = validateInput(routeDef.input, input);
    if (!validation.success) {
      return sendBunError(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'Validation error',
        { issues: validation.errors }
      );
    }
    input = validation.data;
  }

  // Log request if enabled
  if (config.logRequests) {
    console.log(`[WS] ${routeName} - Connection request`);
  }

  // Normalize request
  const normalizedReq = await normalizeBunRequest(req, url, input);

  // Create platform context and hook context
  const platform = { type: 'bun' as const, req };
  const hookContext: HookContext = {
    req: normalizedReq,
    platform,
    method: 'GET',
    route: routeName,
    input,
    context: { platform },
  };

  // Execute before hooks
  const allHooks = executor.combineHooks(globalHooks, routeDef.hooks);
  const { before, cleanup } = extractLifecycleMethods(allHooks);

  // Run before hooks
  for (const hook of before) {
    try {
      const result = await hook(hookContext);
      if (!result.next) {
        return sendBunError(
          HttpStatus.UNAUTHORIZED,
          ErrorCode.UNAUTHORIZED,
          result.error
        );
      }
    } catch (error) {
      console.error('WebSocket before hook error:', error);
      return sendBunError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ErrorCode.INTERNAL_ERROR,
        'Hook execution failed'
      );
    }
  }

  // Upgrade to WebSocket
  const connectionId = generateConnectionId();
  const success = server.upgrade(req, {
    data: {
      routeName,
      routeDef,
      userHandlers: wsHandler,
      context: hookContext.context,
      connectionId,
      headers: normalizedReq.headers,
      ip: normalizedReq.ip,
      cleanup,
      success: true,
    } as BunWebSocketData,
  });

  if (!success) {
    return sendBunError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      ErrorCode.INTERNAL_ERROR,
      'WebSocket upgrade failed'
    );
  }

  // Return undefined to indicate successful upgrade
  return new Response(null, { status: 101 });
}

/**
 * Creates Bun WebSocket handler configuration.
 * 
 * This creates a single shared handler object that dispatches to user handlers
 * based on the connection data stored in ws.data.
 * 
 * @param routes - Map of route definitions
 * @param config - Bridge configuration
 * @param executor - Hook executor
 * @param globalHooks - Global hooks
 * @returns Bun WebSocket handler configuration
 * 
 * @internal
 */
function createBunWebSocketHandler(
  routes: Map<string, RouteDefinition>,
  config: BridgeConfig,
  executor: HookExecutor,
  globalHooks: any[]
): any {
  return {
    open: async (ws: ServerWebSocket) => {
      try {
        const data = ws.data as BunWebSocketData;
        const { userHandlers, context, connectionId, headers, ip, routeName } = data;

        if (config.logRequests) {
          console.log(`[WS] ${routeName} - Connection opened`);
        }

        // Create connection wrapper
        const connection = new WebSocketConnectionImpl({
          id: connectionId,
          ip,
          headers,
          context,
          raw: ws,
          sendFn: (message: any, compress?: boolean) => {
            return ws.send(message, compress);
          },
          closeFn: (code?: number, reason?: string) => {
            ws.close(code || 1000, reason);
          },
        });

        // Call user's onOpen handler
        if (userHandlers.onOpen) {
          await userHandlers.onOpen(connection);
        }
      } catch (error) {
        console.error('WebSocket onOpen error:', error);
        const errorMessage = error instanceof Error ? error.message : 'onOpen handler failed';
        ws.send(JSON.stringify({
          type: 'error',
          code: 'HANDLER_ERROR',
          message: errorMessage,
        }));
      }
    },

    message: async (ws: ServerWebSocket, message: string | Buffer) => {
      try {
        const data = ws.data as BunWebSocketData;
        const { userHandlers, context, connectionId, headers, ip, routeDef } = data;

        // Parse message
        let parsedMessage: any;
        try {
          const messageStr = typeof message === 'string' ? message : message.toString();
          parsedMessage = JSON.parse(messageStr);
        } catch {
          parsedMessage = typeof message === 'string' ? message : message.toString();
        }

        // Validate message if input schema is defined
        if (routeDef.input) {
          const validation = validateInput(routeDef.input, parsedMessage);
          if (!validation.success) {
            ws.send(JSON.stringify({
              type: 'error',
              code: 'VALIDATION_ERROR',
              message: 'Invalid message format',
              details: validation.errors,
            }));
            return;
          }
          parsedMessage = validation.data;
        }

        // Create connection wrapper
        const connection = new WebSocketConnectionImpl({
          id: connectionId,
          ip,
          headers,
          context,
          raw: ws,
          sendFn: (msg: any, compress?: boolean) => {
            return ws.send(msg, compress);
          },
          closeFn: (code?: number, reason?: string) => {
            ws.close(code || 1000, reason);
          },
        });

        // Call user's onMessage handler
        await userHandlers.onMessage(parsedMessage, connection);
      } catch (error) {
        console.error('WebSocket message handler error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Message handler failed';
        const data = ws.data as BunWebSocketData;
        data.success = false;

        ws.send(JSON.stringify({
          type: 'error',
          code: 'HANDLER_ERROR',
          message: errorMessage,
        }));

        if (data.userHandlers.onError) {
          try {
            const connection = new WebSocketConnectionImpl({
              id: data.connectionId,
              ip: data.ip,
              headers: data.headers,
              context: data.context,
              raw: ws,
              sendFn: (msg: any, compress?: boolean) => ws.send(msg, compress),
              closeFn: (code?: number, reason?: string) => ws.close(code || 1000, reason),
            });
            await data.userHandlers.onError(connection, error as Error);
          } catch (onErrorError) {
            console.error('WebSocket onError handler error:', onErrorError);
          }
        }
      }
    },

    close: async (ws: ServerWebSocket, code: number, reason: string) => {
      try {
        const data = ws.data as BunWebSocketData;
        const { userHandlers, context, connectionId, headers, ip, cleanup, success, routeName } = data;

        if (config.logRequests) {
          console.log(`[WS] ${routeName} - Connection closed: ${code} ${reason}`);
        }

        // Create connection wrapper
        const connection = new WebSocketConnectionImpl({
          id: connectionId,
          ip,
          headers,
          context,
          raw: ws,
          sendFn: (msg: any, compress?: boolean) => ws.send(msg, compress),
          closeFn: (c?: number, r?: string) => ws.close(c || 1000, r),
        });

        // Call user's onClose handler
        if (userHandlers.onClose) {
          await userHandlers.onClose(connection, code, reason);
        }

        // Execute cleanup hooks
        for (const hook of cleanup) {
          try {
            await hook({
              req: { method: 'GET', headers, body: {}, query: {}, params: {}, ip, url: '' },
              platform: { type: 'bun' as const, req: null as any },
              method: 'GET',
              route: routeName,
              input: {},
              context,
              success,
              error: success ? undefined : { status: 500, message: 'Handler error' },
            });
          } catch (error) {
            console.error('WebSocket cleanup hook error (non-fatal):', error);
          }
        }
      } catch (error) {
        console.error('WebSocket onClose error:', error);
      }
    },

    error: async (ws: ServerWebSocket, error: Error) => {
      try {
        console.error('WebSocket error:', error);
        const data = ws.data as BunWebSocketData;
        data.success = false;

        if (data.userHandlers.onError) {
          const connection = new WebSocketConnectionImpl({
            id: data.connectionId,
            ip: data.ip,
            headers: data.headers,
            context: data.context,
            raw: ws,
            sendFn: (msg: any, compress?: boolean) => ws.send(msg, compress),
            closeFn: (code?: number, reason?: string) => ws.close(code || 1000, reason),
          });
          await data.userHandlers.onError(connection, error);
        }
      } catch (onErrorError) {
        console.error('WebSocket onError handler error:', onErrorError);
      }
    },
  };
}

/**
 * Extracts lifecycle methods from hooks (simplified version for WebSocket).
 * 
 * @param hooks - Array of hooks
 * @returns Object with before and cleanup hook arrays
 * 
 * @internal
 */
function extractLifecycleMethods(hooks: any[]): {
  before: any[];
  cleanup: any[];
} {
  const before: any[] = [];
  const cleanup: any[] = [];

  for (const hook of hooks) {
    if (typeof hook === 'object' && '__isLifecycleHook' in hook) {
      if (hook.before) before.push(hook.before);
      if (hook.cleanup) cleanup.push(hook.cleanup);
    } else if (typeof hook === 'function') {
      before.push(hook);
    }
  }

  return { before, cleanup };
}
