import { defineHook } from '../core/shared/hooks';

// ============================================================================
// RATE LIMITING HOOK EXAMPLE
// ============================================================================

/**
 * Creates a rate limiting hook with configurable limits.
 * 
 * This hook:
 * - Tracks request counts per IP address
 * - Resets counter after time window expires
 * - Returns 429 error when limit exceeded
 * - Uses closure-based state management
 * 
 * @example
 * ```typescript
 * // Create rate limit instances with different configs
 * const strictLimit = createRateLimitHook({ max: 10, window: 1000 });
 * const relaxedLimit = createRateLimitHook({ max: 100, window: 60000 });
 * 
 * // Use in routes
 * export const publicRoutes = {
 *   search: defineRoute({
 *     hooks: [strictLimit], // 10 requests per second
 *     handler: async ({ query }) => ({ results: [] })
 *   })
 * };
 * 
 * export const userRoutes = {
 *   getProfile: defineRoute({
 *     hooks: [relaxedLimit], // 100 requests per minute
 *     handler: async () => ({ profile: {} })
 *   })
 * };
 * ```
 * 
 * @example
 * ```typescript
 * // Use globally
 * const globalLimit = createRateLimitHook({ max: 1000, window: 60000 });
 * 
 * setupBridge(routes, {
 *   hooks: [globalLimit] // Apply to all routes
 * });
 * ```
 */
export const createRateLimitHook = defineHook({
  name: 'rateLimit',
  setup: (config: { max: number; window: number }) => {
    // State captured in closure - separate for each hook instance
    const requestCounts = new Map<string, { count: number; timestamp: number }>();
    
    return {
      requestCounts,
      max: config.max,
      window: config.window,
    };
  },
  handler: (ctx, state) => {
    // Get client identifier (IP address)
    const clientId = ctx.req.ip || 'unknown';
    const now = Date.now();
    
    // Get or create request count for this client
    let clientData = state.requestCounts.get(clientId);
    
    if (!clientData) {
      // First request from this client
      clientData = { count: 0, timestamp: now };
      state.requestCounts.set(clientId, clientData);
    }
    
    // Check if window has expired
    if (now - clientData.timestamp > state.window) {
      // Reset counter for new window
      clientData.count = 0;
      clientData.timestamp = now;
    }
    
    // Increment counter
    clientData.count++;
    
    // Check if limit exceeded
    if (clientData.count > state.max) {
      return {
        next: false,
        status: 429,
        error: `Rate limit exceeded. Max ${state.max} requests per ${state.window}ms`,
      };
    }
    
    // Continue to next hook
    return { next: true };
  },
});

/**
 * Pre-configured rate limit hooks for common use cases
 */

/**
 * Strict rate limit: 10 requests per second
 * Suitable for expensive operations or public endpoints
 */
export const strictRateLimit = createRateLimitHook({ max: 10, window: 1000 });

/**
 * Standard rate limit: 100 requests per minute
 * Suitable for most authenticated endpoints
 */
export const standardRateLimit = createRateLimitHook({ max: 100, window: 60000 });

/**
 * Relaxed rate limit: 1000 requests per minute
 * Suitable for high-throughput endpoints
 */
export const relaxedRateLimit = createRateLimitHook({ max: 1000, window: 60000 });
