import type { Context, MiddlewareHandler } from 'hono';
import type { StatusCode } from 'hono/utils/http-status';
import type { RouteDefinition, BridgeConfig, HookContext, WebSocketHandler } from '../shared/types';
import { HookExecutor } from '../shared/executor';
import { validateInput, validateOutput } from '../shared/validation';
import {
  formatSuccessResponse,
  formatErrorResponse,
  formatValidationErrorResponse,
} from '../shared/response';
import { HttpStatus, ErrorCode } from '../shared/error';
import { normalizeHonoContext } from './normalize';
import { WebSocketConnectionImpl, generateConnectionId } from '../shared/websocket';

// ============================================================================
// HONO ADAPTER
// ============================================================================

/**
 * Creates Hono middleware from bridge configuration.
 * 
 * This adapter integrates the shared hook execution engine with Hono,
 * handling request normalization, validation, hook execution, and response formatting.
 * 
 * @param routes - Map of route definitions
 * @param config - Bridge configuration
 * @returns Hono middleware handler
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
 * const middleware = createHonoMiddleware(routes, {
 *   prefix: '/api',
 *   hooks: [rateLimitHook, loggerHook]
 * });
 * 
 * app.use('/api/:route', middleware);
 * ```
 */
export function createHonoMiddleware(
  routes: Map<string, RouteDefinition>,
  config: BridgeConfig
): MiddlewareHandler {
  const executor = new HookExecutor();
  const globalHooks = config.hooks || [];

  return async (c: Context) => {
    try {
      // Extract route name from params or URL
      const routeName = c.req.param('route') || extractRouteFromUrl(c.req.url, config.prefix);

      if (!routeName) {
        return sendHonoError(c, HttpStatus.NOT_FOUND, ErrorCode.ROUTE_NOT_FOUND, 'Route not found');
      }

      const routeDef = routes.get(routeName);
      if (!routeDef) {
        return sendHonoError(
          c,
          HttpStatus.NOT_FOUND,
          ErrorCode.ROUTE_NOT_FOUND,
          `Route ${routeName} not found`
        );
      }

      // Handle WebSocket routes
      if (routeDef.kind === 'ws') {
        return handleHonoWebSocket(c, routeName, routeDef, config, executor, globalHooks);
      }

      // Validate HTTP method
      const expectedMethod = routeDef.method || 'POST';
      if (c.req.method !== expectedMethod) {
        return sendHonoError(
          c,
          HttpStatus.METHOD_NOT_ALLOWED,
          ErrorCode.METHOD_NOT_ALLOWED,
          `Expected ${expectedMethod}, got ${c.req.method}`
        );
      }

      // Extract input based on method
      let input: unknown;
      if (expectedMethod === 'GET') {
        const query: Record<string, string | string[]> = {};
        const url = new URL(c.req.url);
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
        try {
          input = await c.req.json();
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
          c.status(toStatusCode(HttpStatus.BAD_REQUEST));
          return c.json(errorResponse);
        }
        input = validation.data;
      }

      // Normalize request
      const normalizedReq = normalizeHonoContext(c);
      // Update body with parsed input
      normalizedReq.body = input;

      // Create platform context (native Hono Context) and hook context
      const platform = { type: 'hono' as const, c };
      const hookContext: HookContext = {
        req: normalizedReq,
        platform,
        method: expectedMethod,
        route: routeName,
        input,
        // Inject env via context and expose platform to handlers
        // env will be typed according to EnvBindings interface
        context: { env: (c as any)?.env, platform },
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
        c.status(toStatusCode(result.status));
        return c.json(errorResponse);
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
          c.status(toStatusCode(HttpStatus.INTERNAL_SERVER_ERROR));
          return c.json(errorResponse);
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
        const headers = new Headers({
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        return new Response(stream, { headers });
      }

      if (routeDef.output && config.validateResponses) {
        const validation = validateOutput(routeDef.output, result.data);
        if (!validation.success) {
          const errorResponse = formatErrorResponse(
            ErrorCode.INTERNAL_ERROR,
            'Output validation failed (server bug)',
            { issues: validation.errors }
          );
          c.status(toStatusCode(HttpStatus.INTERNAL_SERVER_ERROR));
          return c.json(errorResponse);
        }
      }
      return sendHonoSuccess(c, result.data);
    } catch (error) {
      console.error('Hono adapter error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return sendHonoError(c, HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_ERROR, message);
    }
  };
}

/**
 * Sends success response in Hono format.
 * 
 * @param c - Hono context object
 * @param data - Response data
 * @returns Hono response
 * 
 * @example
 * ```typescript
 * return sendHonoSuccess(c, { id: '123', name: 'John' });
 * ```
 */
export function sendHonoSuccess(c: Context, data: any): Response {
  const response = formatSuccessResponse(data);
  c.status(toStatusCode(HttpStatus.OK));
  return c.json(response);
}

/**
 * Sends error response in Hono format.
 * 
 * @param c - Hono context object
 * @param status - HTTP status code
 * @param code - Error code
 * @param message - Error message
 * @param details - Optional error details
 * @returns Hono response
 * 
 * @example
 * ```typescript
 * return sendHonoError(c, 401, 'unauthorized', 'Invalid token');
 * ```
 */
export function sendHonoError(
  c: Context,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
): Response {
  const response = formatErrorResponse(code, message, details);
  c.status(toStatusCode(status));
  return c.json(response);
}

function toStatusCode(status: number): StatusCode {
  switch (status) {
    case 200:
    case 201:
    case 400:
    case 401:
    case 403:
    case 404:
    case 405:
    case 409:
    case 429:
    case 500:
      return status as StatusCode;
    default:
      // Fallback to 500 if unknown code provided
      return 500 as StatusCode;
  }
}

/**
 * Extracts route name from URL path.
 * 
 * @param url - Request URL
 * @param prefix - API prefix
 * @returns Route name or null
 * 
 * @internal
 */
function extractRouteFromUrl(url: string, prefix?: string): string | null {
  const cleanPrefix = prefix || '/api';
  const urlObj = new URL(url);
  const path = urlObj.pathname;
  const prefixPattern = cleanPrefix.replace(/\//g, '\\/');
  const match = path.match(new RegExp(`${prefixPattern}/([^/]+)`));
  return match ? match[1] : null;
}

// ============================================================================
// WEBSOCKET SUPPORT
// ============================================================================

/**
 * Handles WebSocket routes in Hono.
 * 
 * Uses Hono's upgradeWebSocket() helper to create a WebSocket handler.
 * 
 * @param c - Hono context
 * @param routeName - Route name
 * @param routeDef - Route definition
 * @param config - Bridge configuration
 * @param executor - Hook executor
 * @param globalHooks - Global hooks
 * @returns WebSocket upgrade response
 * 
 * @internal
 */
async function handleHonoWebSocket(
  c: Context,
  routeName: string,
  routeDef: RouteDefinition,
  config: BridgeConfig,
  executor: HookExecutor,
  globalHooks: any[]
): Promise<Response> {
  // Import upgradeWebSocket dynamically
  let upgradeWebSocket: any;
  try {
    upgradeWebSocket = require('hono/websocket').upgradeWebSocket;
  } catch (error) {
    return sendHonoError(
      c,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ErrorCode.INTERNAL_ERROR,
      'WebSocket support requires hono/websocket. Install it with: npm install hono'
    );
  }

  // Validate that handler is a WebSocket handler
  const wsHandler = routeDef.handler as WebSocketHandler;
  if (typeof wsHandler !== 'object' || !wsHandler.onMessage) {
    return sendHonoError(
      c,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ErrorCode.INTERNAL_ERROR,
      'Invalid WebSocket handler'
    );
  }

  // Extract and validate query parameters (handshake input)
  const url = new URL(c.req.url);
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
      return sendHonoError(
        c,
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
  const normalizedReq = normalizeHonoContext(c);
  normalizedReq.body = input;

  // Create platform context and hook context
  const platform = { type: 'hono' as const, c };
  const hookContext: HookContext = {
    req: normalizedReq,
    platform,
    method: 'GET',
    route: routeName,
    input,
    context: { env: (c as any)?.env, platform },
  };

  // Execute before hooks
  const allHooks = executor.combineHooks(globalHooks, routeDef.hooks);
  const { before, cleanup } = extractLifecycleMethods(allHooks);

  // Run before hooks
  for (const hook of before) {
    try {
      const result = await hook(hookContext);
      if (!result.next) {
        return sendHonoError(
          c,
          HttpStatus.UNAUTHORIZED,
          ErrorCode.UNAUTHORIZED,
          result.error
        );
      }
    } catch (error) {
      console.error('WebSocket before hook error:', error);
      return sendHonoError(
        c,
        HttpStatus.INTERNAL_SERVER_ERROR,
        ErrorCode.INTERNAL_ERROR,
        'Hook execution failed'
      );
    }
  }

  // Create WebSocket handler using Hono's upgradeWebSocket
  const wsUpgrade = upgradeWebSocket(() => ({
    onOpen: async (event: any, ws: any) => {
      try {
        // Create connection wrapper
        const connectionId = generateConnectionId();
        const connection = new WebSocketConnectionImpl({
          id: connectionId,
          ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
          headers: normalizedReq.headers,
          context: hookContext.context,
          raw: ws,
          sendFn: (data: any) => {
            ws.send(data);
          },
          closeFn: (code?: number, reason?: string) => {
            ws.close(code || 1000, reason);
          },
        });

        // Store connection and context for later use
        (ws as any).__bridgeConnection = connection;
        (ws as any).__bridgeContext = hookContext;
        (ws as any).__bridgeCleanup = cleanup;
        (ws as any).__bridgeConfig = config;
        (ws as any).__bridgeRouteName = routeName;
        (ws as any).__bridgeSuccess = true;

        if (config.logRequests) {
          console.log(`[WS] ${routeName} - Connection opened`);
        }

        // Call user's onOpen handler
        if (wsHandler.onOpen) {
          await wsHandler.onOpen(connection);
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

    onMessage: async (event: any, ws: any) => {
      try {
        const connection = (ws as any).__bridgeConnection;
        if (!connection) {
          console.error('WebSocket connection not found');
          return;
        }

        // Parse message
        let message: any;
        try {
          message = JSON.parse(event.data);
        } catch {
          message = event.data;
        }

        // Validate message if input schema is defined
        if (routeDef.input) {
          const validation = validateInput(routeDef.input, message);
          if (!validation.success) {
            ws.send(JSON.stringify({
              type: 'error',
              code: 'VALIDATION_ERROR',
              message: 'Invalid message format',
              details: validation.errors,
            }));
            return;
          }
          message = validation.data;
        }

        // Call user's onMessage handler
        await wsHandler.onMessage(message, connection);
      } catch (error) {
        console.error('WebSocket message handler error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Message handler failed';
        (ws as any).__bridgeSuccess = false;

        ws.send(JSON.stringify({
          type: 'error',
          code: 'HANDLER_ERROR',
          message: errorMessage,
        }));

        if (wsHandler.onError) {
          try {
            const connection = (ws as any).__bridgeConnection;
            await wsHandler.onError(connection, error as Error);
          } catch (onErrorError) {
            console.error('WebSocket onError handler error:', onErrorError);
          }
        }
      }
    },

    onClose: async (event: any, ws: any) => {
      try {
        const connection = (ws as any).__bridgeConnection;
        const hookContext = (ws as any).__bridgeContext;
        const cleanup = (ws as any).__bridgeCleanup;
        const config = (ws as any).__bridgeConfig;
        const routeName = (ws as any).__bridgeRouteName;
        const success = (ws as any).__bridgeSuccess !== false;

        if (config?.logRequests) {
          console.log(`[WS] ${routeName} - Connection closed: ${event.code}`);
        }

        // Call user's onClose handler
        if (wsHandler.onClose && connection) {
          await wsHandler.onClose(connection, event.code, event.reason || '');
        }

        // Execute cleanup hooks
        if (cleanup && hookContext) {
          for (const hook of cleanup) {
            try {
              await hook({
                ...hookContext,
                success,
                error: success ? undefined : { status: 500, message: 'Handler error' },
              });
            } catch (error) {
              console.error('WebSocket cleanup hook error (non-fatal):', error);
            }
          }
        }
      } catch (error) {
        console.error('WebSocket onClose error:', error);
      }
    },

    onError: async (event: any, ws: any) => {
      try {
        console.error('WebSocket error:', event);
        (ws as any).__bridgeSuccess = false;

        const connection = (ws as any).__bridgeConnection;
        if (wsHandler.onError && connection) {
          await wsHandler.onError(connection, new Error('WebSocket error'));
        }
      } catch (error) {
        console.error('WebSocket onError handler error:', error);
      }
    },
  }));

  return wsUpgrade(c);
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
