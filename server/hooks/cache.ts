import { defineHook } from '../core/shared/hooks';

// ============================================================================
// CACHING HOOK EXAMPLE
// ============================================================================

/**
 * Creates a caching hook with configurable TTL.
 * 
 * This hook:
 * - Caches responses based on route and input
 * - Returns cached response early (skips handler)
 * - Automatically expires cache after TTL
 * - Uses closure-based state for cache storage
 * 
 * @example
 * ```typescript
 * // Create cache instances with different TTLs
 * const shortCache = createCacheHook({ ttl: 60 }); // 60 seconds
 * const longCache = createCacheHook({ ttl: 3600 }); // 1 hour
 * 
 * // Use in routes
 * export const dataRoutes = {
 *   getStats: defineRoute({
 *     method: 'GET',
 *     hooks: [longCache], // Cache for 1 hour
 *     handler: async () => {
 *       // Expensive computation
 *       return { stats: computeStats() };
 *     }
 *   }),
 *   
 *   search: defineRoute({
 *     method: 'GET',
 *     hooks: [shortCache], // Cache for 60 seconds
 *     handler: async ({ query }) => {
 *       return { results: searchDatabase(query) };
 *     }
 *   })
 * };
 * ```
 */
export const createCacheHook = defineHook({
  name: 'cache',
  setup: (config: { ttl: number }) => {
    // Cache storage - separate for each hook instance
    const cache = new Map<string, { data: any; expires: number }>();
    
    // Cleanup expired entries periodically
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, value] of cache.entries()) {
        if (value.expires < now) {
          cache.delete(key);
        }
      }
    }, config.ttl * 1000);
    
    // Note: In production, you'd want to clear this interval
    // when the server shuts down
    
    return {
      cache,
      ttl: config.ttl,
      cleanupInterval,
    };
  },
  handler: (ctx, state) => {
    // Generate cache key from route and input
    const cacheKey = `${ctx.route}:${JSON.stringify(ctx.input)}`;
    const now = Date.now();
    
    // Check cache
    const cached = state.cache.get(cacheKey);
    if (cached && cached.expires > now) {
      // Cache hit - return early, skip handler
      return {
        next: true,
        response: cached.data,
      };
    }
    
    // Cache miss - store key for later
    // (We'll cache the response after handler executes)
    ctx.context.__cacheKey = cacheKey;
    ctx.context.__cacheTtl = state.ttl;
    ctx.context.__cacheStore = state.cache;
    
    // Continue to handler
    return { next: true };
  },
});

/**
 * Post-response cache hook that stores handler results.
 * 
 * Note: This is a conceptual example. In the current implementation,
 * hooks don't run after the handler. To cache responses, you'd need
 * to modify the executor or use a different approach.
 * 
 * For now, caching is done by storing the cache key in context
 * and having the adapter cache the response.
 */

/**
 * Pre-configured cache hooks for common use cases
 */

/**
 * Short-lived cache: 60 seconds
 * Suitable for frequently changing data
 */
export const shortCache = createCacheHook({ ttl: 60 });

/**
 * Medium-lived cache: 5 minutes
 * Suitable for moderately stable data
 */
export const mediumCache = createCacheHook({ ttl: 300 });

/**
 * Long-lived cache: 1 hour
 * Suitable for rarely changing data
 */
export const longCache = createCacheHook({ ttl: 3600 });

/**
 * User-specific cache hook that includes userId in cache key.
 * 
 * This ensures each user gets their own cached data.
 * 
 * @example
 * ```typescript
 * export const userRoutes = {
 *   getProfile: defineRoute({
 *     hooks: [authHook, userCacheHook],
 *     handler: async (input, context) => {
 *       return { userId: context.userId, profile: {} };
 *     }
 *   })
 * };
 * ```
 */
export const createUserCacheHook = defineHook({
  name: 'userCache',
  setup: (config: { ttl: number }) => {
    const cache = new Map<string, { data: any; expires: number }>();
    return { cache, ttl: config.ttl };
  },
  handler: (ctx, state) => {
    // Include userId in cache key
    const userId = ctx.context.userId || 'anonymous';
    const cacheKey = `${userId}:${ctx.route}:${JSON.stringify(ctx.input)}`;
    const now = Date.now();
    
    const cached = state.cache.get(cacheKey);
    if (cached && cached.expires > now) {
      return {
        next: true,
        response: cached.data,
      };
    }
    
    ctx.context.__cacheKey = cacheKey;
    ctx.context.__cacheTtl = state.ttl;
    ctx.context.__cacheStore = state.cache;
    
    return { next: true };
  },
});

/**
 * User-specific cache with 5 minute TTL
 */
export const userCache = createUserCacheHook({ ttl: 300 });
