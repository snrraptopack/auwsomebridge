import { defineHook } from '../core/shared/hooks';

// ============================================================================
// LOGGING HOOK EXAMPLE
// ============================================================================

/**
 * Simple logging hook that logs request and response information.
 * 
 * This hook:
 * - Logs request method, route, and input
 * - Logs userId if available from auth hook
 * - Measures and logs request duration
 * - Always continues to next hook (non-blocking)
 * 
 * @example
 * ```typescript
 * // Use in routes
 * export const userRoutes = {
 *   getUser: defineRoute({
 *     hooks: [authHook, loggerHook],
 *     handler: async ({ id }) => ({ id, name: 'John' })
 *   })
 * };
 * ```
 * 
 * @example
 * ```typescript
 * // Use globally
 * setupBridge(routes, {
 *   hooks: [loggerHook] // Log all requests
 * });
 * ```
 */
export const loggerHook = defineHook({
  name: 'logger',
  handler: (ctx) => {
    const timestamp = new Date().toISOString();
    const userId = ctx.context.userId || 'anonymous';
    
    // Log request
    console.log(`[${timestamp}] ${ctx.method} ${ctx.route}`, {
      userId,
      input: ctx.input,
      ip: ctx.req.ip,
    });
    
    // Store start time for duration calculation
    ctx.context.__loggerStartTime = Date.now();
    
    // Always continue
    return { next: true };
  },
});

/**
 * Detailed logging hook with request/response timing.
 * 
 * Note: This hook should be placed early in the hook chain to measure
 * total execution time including other hooks.
 * 
 * @example
 * ```typescript
 * export const userRoutes = {
 *   getUser: defineRoute({
 *     hooks: [detailedLoggerHook, authHook, cacheHook],
 *     handler: async ({ id }) => ({ id, name: 'John' })
 *   })
 * };
 * ```
 */
export const detailedLoggerHook = defineHook({
  name: 'detailedLogger',
  handler: (ctx) => {
    const timestamp = new Date().toISOString();
    const userId = ctx.context.userId || 'anonymous';
    
    console.log(`[${timestamp}] → ${ctx.method} ${ctx.route}`, {
      userId,
      input: ctx.input,
      ip: ctx.req.ip,
      headers: {
        userAgent: ctx.req.headers['user-agent'],
        contentType: ctx.req.headers['content-type'],
      },
    });
    
    // Store start time
    ctx.context.__detailedLoggerStartTime = Date.now();
    
    return { next: true };
  },
});

/**
 * Error logging hook that logs errors with context.
 * 
 * This hook should be placed early in the chain to catch errors
 * from subsequent hooks.
 * 
 * @example
 * ```typescript
 * export const userRoutes = {
 *   getUser: defineRoute({
 *     hooks: [errorLoggerHook, authHook, rateLimitHook],
 *     handler: async ({ id }) => {
 *       // If this throws, errorLoggerHook won't catch it
 *       // (hooks don't catch handler errors)
 *       return { id, name: 'John' };
 *     }
 *   })
 * };
 * ```
 */
export const errorLoggerHook = defineHook({
  name: 'errorLogger',
  handler: async (ctx) => {
    try {
      // This won't actually catch errors from next hooks
      // (they're handled by the executor)
      // This is just for demonstration
      return { next: true };
    } catch (error) {
      console.error(`[ERROR] ${ctx.method} ${ctx.route}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: ctx.context.userId,
        input: ctx.input,
      });
      throw error;
    }
  },
});

// ============================================================================
// METRICS HOOK WITH LIFECYCLE SUPPORT
// ============================================================================

/**
 * Metrics hook that tracks request duration and outcome.
 * 
 * This hook uses lifecycle methods:
 * - Before: Records start time
 * - Cleanup: Calculates duration and logs metrics (always runs)
 * 
 * @example
 * ```typescript
 * export const userRoutes = {
 *   getUser: defineRoute({
 *     hooks: [metricsHook, authHook],
 *     handler: async ({ id }) => {
 *       return { id, name: 'John' };
 *     }
 *   })
 * };
 * ```
 */
export const metricsHook = defineHook({
  name: 'metrics',
  before: (ctx) => {
    // Record start time
    ctx.context.__metricsStartTime = Date.now();
    return { next: true };
  },
  cleanup: (ctx) => {
    // Calculate duration
    const duration = Date.now() - (ctx.context.__metricsStartTime || Date.now());
    const status = ctx.success ? 'success' : 'error';
    const userId = ctx.context.userId || 'anonymous';
    
    // Log metrics
    console.log(`[METRICS] ${ctx.method} ${ctx.route}`, {
      duration: `${duration}ms`,
      status,
      userId,
      statusCode: ctx.error?.status,
    });
    
    // In production, you would send this to a metrics service
    // recordMetric({
    //   route: ctx.route,
    //   method: ctx.method,
    //   duration,
    //   status,
    //   userId,
    // });
    
    return { next: true };
  },
});
