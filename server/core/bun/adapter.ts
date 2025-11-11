import type { RouteDefinition, BridgeConfig, HookContext } from '../shared/types';
import { HookExecutor } from '../shared/executor';
import { validateInput, validateOutput } from '../shared/validation';
import {
  formatSuccessResponse,
  formatErrorResponse,
  formatValidationErrorResponse,
} from '../shared/response';
import { HttpStatus, ErrorCode } from '../shared/error';
import { normalizeBunRequest } from './normalize';

// ============================================================================
// BUN ADAPTER
// ============================================================================

/**
 * Creates a Bun fetch handler from bridge configuration.
 * 
 * This adapter integrates the shared hook execution engine with Bun's native
 * HTTP server, handling request normalization, validation, hook execution,
 * and response formatting using Web API standards (Request/Response).
 * 
 * @param routes - Map of route definitions
 * @param config - Bridge configuration
 * @returns Fetch handler compatible with Bun.serve()
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
 * const handler = createBunMiddleware(routes, {
 *   prefix: '/api',
 *   hooks: [rateLimitHook, loggerHook]
 * });
 * 
 * Bun.serve({
 *   port: 3000,
 *   fetch: handler
 * });
 * ```
 */
export function createBunMiddleware(
  routes: Map<string, RouteDefinition>,
  config: BridgeConfig
): (req: Request) => Promise<Response> {
  const executor = new HookExecutor();
  const globalHooks = config.hooks || [];

  return async (req: Request): Promise<Response> => {
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

      // Execute hooks and handler
      const result = await executor.execute(allHooks, routeDef.handler as any, hookContext);

      // Handle execution result
      if (!result.success) {
        const errorResponse = formatErrorResponse(
          ErrorCode.INTERNAL_ERROR,
          result.error,
          { status: result.status }
        );
        return Response.json(errorResponse, { status: result.status });
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
          return Response.json(errorResponse, { status: HttpStatus.INTERNAL_SERVER_ERROR });
        }
      }

      // Send success response
      return sendBunSuccess(result.data);
    } catch (error) {
      console.error('Bun adapter error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return sendBunError(HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_ERROR, message);
    }
  };
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
