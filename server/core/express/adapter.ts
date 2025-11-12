import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { RouteDefinition, BridgeConfig, HookContext } from '../shared/types';
import { HookExecutor } from '../shared/executor';
import { validateInput, validateOutput } from '../shared/validation';
import {
  formatSuccessResponse,
  formatErrorResponse,
  formatValidationErrorResponse,
} from '../shared/response';
import { HttpStatus, ErrorCode } from '../shared/error';
import { normalizeExpressRequest } from './normalize';

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
