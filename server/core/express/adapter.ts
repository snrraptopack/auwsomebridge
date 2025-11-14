import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { RouteDefinition, BridgeConfig, HookContext, WebSocketHandler } from '../shared/types';
import { HookExecutor } from '../shared/executor';
import { validateInput, validateOutput } from '../shared/validation';
import {
  formatSuccessResponse,
  formatErrorResponse,
  formatValidationErrorResponse,
} from '../shared/response';
import { HttpStatus, ErrorCode } from '../shared/error';
import { normalizeExpressRequest } from './normalize';
import { WebSocketConnectionImpl, generateConnectionId } from '../shared/websocket';

// WebSocket types (optional dependency)
type WebSocket = any;
type WebSocketServer = any;

// ============================================================================
// EXPRESS ADAPTER
// ============================================================================

/**
 * Creates Express middleware from bridge configuration.
 * 
 * This adapter integrates the shared hook execution engine with Express,
 * handling request normalization, validation, hook execution, and response formatting.
 * 
 * @param routes - Map of route definitions
 * @param config - Bridge configuration
 * @returns Express request handler
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
 * const middleware = createExpressMiddleware(routes, {
 *   prefix: '/api',
 *   hooks: [rateLimitHook, loggerHook]
 * });
 * 
 * app.use('/api/:route', middleware);
 * ```
 */
export function createExpressMiddleware(
  routes: Map<string, RouteDefinition>,
  config: BridgeConfig
): RequestHandler {
  const executor = new HookExecutor();
  const globalHooks = config.hooks || [];

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract route name from params or URL
      const routeName = req.params.route || extractRouteFromUrl(req.url, config.prefix);

      if (!routeName) {
        return sendExpressError(res, HttpStatus.NOT_FOUND, ErrorCode.ROUTE_NOT_FOUND, 'Route not found');
      }

      const routeDef = routes.get(routeName);
      if (!routeDef) {
        return sendExpressError(
          res,
          HttpStatus.NOT_FOUND,
          ErrorCode.ROUTE_NOT_FOUND,
          `Route ${routeName} not found`
        );
      }

      // Validate HTTP method
      const expectedMethod = routeDef.method || 'POST';
      if (req.method !== expectedMethod) {
        return sendExpressError(
          res,
          HttpStatus.METHOD_NOT_ALLOWED,
          ErrorCode.METHOD_NOT_ALLOWED,
          `Expected ${expectedMethod}, got ${req.method}`
        );
      }

      // Extract input based on method
      let input: unknown;
      if (expectedMethod === 'GET') {
        input = req.query;
      } else {
        input = req.body;
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
          return res.status(HttpStatus.BAD_REQUEST).json(errorResponse);
        }
        input = validation.data;
      }

      // Normalize request
      const normalizedReq = normalizeExpressRequest(req);

      // Create platform context (native Express objects) and hook context
      const platform = { type: 'express' as const, req, res };
      const hookContext: HookContext = {
        req: normalizedReq,
        platform,
        method: expectedMethod,
        route: routeName,
        input,
        // Expose platform to handlers via context.platform
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
        return res.status(result.status).json(errorResponse);
      }

      // Handle WebSocket routes
      if (routeDef.kind === 'ws') {
        // WebSocket routes should not reach here - they should be handled by WebSocket server
        // This is a fallback error response
        return sendExpressError(
          res,
          HttpStatus.BAD_REQUEST,
          ErrorCode.INTERNAL_ERROR,
          'WebSocket routes must be accessed via WebSocket protocol'
        );
      }

      if (routeDef.kind === 'sse') {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        const data = result.data as any;
        const isAsyncIterable = data && typeof data === 'object' && Symbol.asyncIterator in data;
        if (!isAsyncIterable) {
          const errorResponse = formatErrorResponse(
            ErrorCode.INTERNAL_ERROR,
            'SSE handler must return AsyncIterable',
            {}
          );
          return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(errorResponse);
        }
        try {
          for await (const ev of data as AsyncIterable<any>) {
            const s = typeof ev === 'string' ? ev : JSON.stringify(ev);
            res.write(`data: ${s}\n\n`);
          }
        } catch (e) {
          res.write(`event: error\n`);
          res.write(`data: ${JSON.stringify({ message: (e as any)?.message || 'stream error' })}\n\n`);
        }
        res.end();
        return;
      }

      if (routeDef.output && config.validateResponses) {
        const validation = validateOutput(routeDef.output, result.data);
        if (!validation.success) {
          const errorResponse = formatErrorResponse(
            ErrorCode.INTERNAL_ERROR,
            'Output validation failed (server bug)',
            { issues: validation.errors }
          );
          return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(errorResponse);
        }
      }
      return sendExpressSuccess(res, result.data);
    } catch (error) {
      console.error('Express adapter error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return sendExpressError(res, HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_ERROR, message);
    }
  };
}

/**
 * Sends success response in Express format.
 * 
 * @param res - Express response object
 * @param data - Response data
 * 
 * @example
 * ```typescript
 * sendExpressSuccess(res, { id: '123', name: 'John' });
 * ```
 */
export function sendExpressSuccess(res: Response, data: any): void {
  const response = formatSuccessResponse(data);
  res.status(HttpStatus.OK).json(response);
}

/**
 * Sends error response in Express format.
 * 
 * @param res - Express response object
 * @param status - HTTP status code
 * @param code - Error code
 * @param message - Error message
 * @param details - Optional error details
 * 
 * @example
 * ```typescript
 * sendExpressError(res, 401, 'unauthorized', 'Invalid token');
 * ```
 */
export function sendExpressError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
): void {
  const response = formatErrorResponse(code, message, details);
  res.status(status).json(response);
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
  const path = url.split('?')[0]; // Remove query string
  const prefixPattern = cleanPrefix.replace(/\//g, '\\/');
  const match = path.match(new RegExp(`${prefixPattern}/([^/]+)`));
  return match ? match[1] : null;
}

// ============================================================================
// WEBSOCKET SUPPORT
// ============================================================================

/**
 * Creates a WebSocket server for Express with bridge integration.
 * 
 * This function sets up a WebSocket server that handles WebSocket routes
 * defined with `kind: 'ws'`. It integrates with the bridge's hook system
 * and validation.
 * 
 * @param routes - Map of route definitions
 * @param config - Bridge configuration
 * @returns WebSocket server instance
 * 
 * @example
 * ```typescript
 * import { WebSocketServer } from 'ws';
 * import express from 'express';
 * 
 * const app = express();
 * const server = app.listen(3000);
 * 
 * const wss = createExpressWebSocketServer(routes, config);
 * wss.on('connection', (ws, req) => {
 *   // Handled by bridge
 * });
 * 
 * server.on('upgrade', (request, socket, head) => {
 *   wss.handleUpgrade(request, socket, head, (ws) => {
 *     wss.emit('connection', ws, request);
 *   });
 * });
 * ```
 */
export function createExpressWebSocketServer(
  routes: Map<string, RouteDefinition>,
  config: BridgeConfig
): WebSocketServer {
  const executor = new HookExecutor();
  const globalHooks = config.hooks || [];
  
  // Import WebSocketServer dynamically to avoid requiring ws as a dependency
  let WebSocketServerClass: any;
  try {
    WebSocketServerClass = require('ws').WebSocketServer;
  } catch (error) {
    throw new Error(
      'WebSocket support requires the "ws" package. Install it with: npm install ws @types/ws'
    );
  }
  
  const wss = new WebSocketServerClass({ noServer: true });
  
  wss.on('connection', async (ws: WebSocket, req: Request) => {
    try {
      // Extract route name from URL
      const routeName = extractRouteFromUrl(req.url || '', config.prefix);
      
      if (!routeName) {
        ws.close(1008, 'Route not found');
        return;
      }
      
      const routeDef = routes.get(routeName);
      if (!routeDef || routeDef.kind !== 'ws') {
        ws.close(1008, `WebSocket route ${routeName} not found`);
        return;
      }
      
      // Validate that handler is a WebSocket handler
      const wsHandler = routeDef.handler as WebSocketHandler;
      if (typeof wsHandler !== 'object' || !wsHandler.onMessage) {
        ws.close(1011, 'Invalid WebSocket handler');
        return;
      }
      
      // Extract and validate query parameters (handshake input)
      const url = new URL(req.url || '', `http://${req.headers.host}`);
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
          ws.close(1008, `Validation error: ${JSON.stringify(validation.errors)}`);
          return;
        }
        input = validation.data;
      }
      
      // Log request if enabled
      if (config.logRequests) {
        console.log(`[WS] ${routeName} - Connection from ${req.socket.remoteAddress}`);
      }
      
      // Normalize request
      const normalizedReq = normalizeExpressRequest(req);
      
      // Create platform context and hook context
      const platform = { type: 'express' as const, req, res: null as any };
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
            ws.close(1008, result.error);
            return;
          }
        } catch (error) {
          console.error('WebSocket before hook error:', error);
          ws.close(1011, 'Hook execution failed');
          return;
        }
      }
      
      // Create connection wrapper
      const connectionId = generateConnectionId();
      const connection = new WebSocketConnectionImpl({
        id: connectionId,
        ip: req.socket.remoteAddress,
        headers: req.headers,
        context: hookContext.context,
        raw: ws,
        sendFn: (data: any) => {
          if (ws.readyState === 1) { // OPEN
            ws.send(data);
          }
        },
        closeFn: (code?: number, reason?: string) => {
          ws.close(code || 1000, reason);
        },
      });
      
      // Track connection outcome for cleanup hooks
      let connectionSuccess = true;
      let connectionError: { status: number; message: string } | undefined;
      
      // Call onOpen handler
      if (wsHandler.onOpen) {
        try {
          await wsHandler.onOpen(connection);
        } catch (error) {
          console.error('WebSocket onOpen error:', error);
          const errorMessage = error instanceof Error ? error.message : 'onOpen handler failed';
          ws.send(JSON.stringify({
            type: 'error',
            code: 'HANDLER_ERROR',
            message: errorMessage,
          }));
        }
      }
      
      // Handle incoming messages
      ws.on('message', async (data: Buffer | string) => {
        try {
          // Parse message
          let message: any;
          try {
            const messageStr = data.toString();
            message = JSON.parse(messageStr);
          } catch {
            message = data.toString();
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
          
          // Call onMessage handler
          await wsHandler.onMessage(message, connection);
        } catch (error) {
          console.error('WebSocket message handler error:', error);
          const errorMessage = error instanceof Error ? error.message : 'Message handler failed';
          connectionSuccess = false;
          connectionError = { status: 500, message: errorMessage };
          
          ws.send(JSON.stringify({
            type: 'error',
            code: 'HANDLER_ERROR',
            message: errorMessage,
          }));
          
          if (wsHandler.onError) {
            try {
              await wsHandler.onError(connection, error as Error);
            } catch (onErrorError) {
              console.error('WebSocket onError handler error:', onErrorError);
            }
          }
        }
      });
      
      // Handle connection close
      ws.on('close', async (code: number, reason: Buffer) => {
        const reasonStr = reason.toString();
        
        if (config.logRequests) {
          console.log(`[WS] ${routeName} - Connection closed: ${code} ${reasonStr}`);
        }
        
        // Call onClose handler
        if (wsHandler.onClose) {
          try {
            await wsHandler.onClose(connection, code, reasonStr);
          } catch (error) {
            console.error('WebSocket onClose error:', error);
          }
        }
        
        // Execute cleanup hooks
        for (const hook of cleanup) {
          try {
            await hook({
              ...hookContext,
              success: connectionSuccess,
              error: connectionError,
            });
          } catch (error) {
            console.error('WebSocket cleanup hook error (non-fatal):', error);
          }
        }
      });
      
      // Handle errors
      ws.on('error', async (error: Error) => {
        console.error('WebSocket error:', error);
        connectionSuccess = false;
        connectionError = { status: 500, message: error.message };
        
        if (wsHandler.onError) {
          try {
            await wsHandler.onError(connection, error);
          } catch (onErrorError) {
            console.error('WebSocket onError handler error:', onErrorError);
          }
        }
      });
      
    } catch (error) {
      console.error('WebSocket connection setup error:', error);
      ws.close(1011, 'Internal server error');
    }
  });
  
  return wss;
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
