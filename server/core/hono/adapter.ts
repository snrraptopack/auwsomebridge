import type { Context, MiddlewareHandler } from 'hono';
import type { StatusCode } from 'hono/utils/http-status';
import type { RouteDefinition, BridgeConfig, HookContext } from '../shared/types';
import { HookExecutor } from '../shared/executor';
import { validateInput, validateOutput } from '../shared/validation';
import {
  formatSuccessResponse,
  formatErrorResponse,
  formatValidationErrorResponse,
} from '../shared/response';
import { HttpStatus, ErrorCode } from '../shared/error';
import { normalizeHonoContext } from './normalize';

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

      // Create hook context
      const hookContext: HookContext = {
        req: normalizedReq,
        method: expectedMethod,
        route: routeName,
        input,
        // Inject Cloudflare Workers bindings (if present) into context
        // Hono exposes bindings on c.env in Workers runtime
        context: { env: (c as any)?.env },
      };

      // Combine global and route hooks
      const allHooks = executor.combineHooks(globalHooks, routeDef.hooks);

      // Execute hooks and handler
      const result = await executor.execute(allHooks, routeDef.handler as any, hookContext);

      // Handle execution result
      if (!result.success) {
        const errorResponse = formatErrorResponse(
          ErrorCode.INTERNAL_ERROR,
          result.error,
          { status: result.status }
        );
        c.status(toStatusCode(result.status));
        return c.json(errorResponse);
      }

      // Validate output if enabled
      if (routeDef.output && config.validateResponses) {
        const validation = validateOutput(routeDef.output, result.data);
        if (!validation.success) {
          console.error('Output validation failed:', validation.errors);
          const errorResponse = formatErrorResponse(
            ErrorCode.INTERNAL_ERROR,
            'Output validation failed (server bug)',
            { issues: validation.errors }
          );
          c.status(toStatusCode(HttpStatus.INTERNAL_SERVER_ERROR));
          return c.json(errorResponse);
        }
      }

      // Send success response
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
