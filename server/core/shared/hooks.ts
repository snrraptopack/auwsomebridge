import type { HookDefinition, RouteHook, HookContext, HookResult } from './types';

// ============================================================================
// HOOK DEFINITION
// ============================================================================

/**
 * Defines a hook that can be used in routes or globally.
 * 
 * This function creates hooks with optional configuration and state management.
 * - If no `setup` function is provided, returns a RouteHook directly
 * - If `setup` is provided, returns a factory function that creates RouteHook instances
 * 
 * @template TConfig - Configuration type for the hook (void if no config needed)
 * @template TState - State type returned by setup function
 * 
 * @param definition - Hook definition with name, optional setup, and handler
 * @returns If setup is provided, returns a factory function; otherwise returns a RouteHook directly
 * 
 * @example
 * // Simple hook without configuration
 * const loggerHook = defineHook({
 *   name: 'logger',
 *   handler: (ctx) => {
 *     console.log(`[${ctx.method}] ${ctx.route}`, ctx.input);
 *     return { next: true };
 *   }
 * });
 * 
 * // Use directly in routes
 * hooks: [loggerHook]
 * 
 * @example
 * // Configurable hook with state management
 * const createRateLimitHook = defineHook({
 *   name: 'rateLimit',
 *   setup: (config: { max: number; window: number }) => {
 *     // State is captured in closure
 *     let counter = 0;
 *     let timestamp = Date.now();
 *     return { counter, timestamp, ...config };
 *   },
 *   handler: (ctx, state) => {
 *     const now = Date.now();
 *     
 *     // Reset counter if window expired
 *     if (now - state.timestamp > state.window) {
 *       state.timestamp = now;
 *       state.counter = 0;
 *     }
 *     
 *     state.counter++;
 *     
 *     if (state.counter > state.max) {
 *       return { next: false, status: 429, error: 'Too many requests' };
 *     }
 *     
 *     return { next: true };
 *   }
 * });
 * 
 * // Create instances with different configs
 * const strictLimit = createRateLimitHook({ max: 10, window: 1000 });
 * const relaxedLimit = createRateLimitHook({ max: 100, window: 60000 });
 * 
 * // Each instance has isolated state
 * hooks: [strictLimit]
 * 
 * @example
 * // Hook that modifies context for subsequent hooks
 * const authHook = defineHook({
 *   name: 'auth',
 *   handler: async (ctx) => {
 *     const token = ctx.req.headers.authorization?.split(' ')[1];
 *     
 *     if (!token) {
 *       return { next: false, status: 401, error: 'Unauthorized' };
 *     }
 *     
 *     // Validate token and add to context
 *     const user = await validateToken(token);
 *     ctx.context.userId = user.id;
 *     ctx.context.role = user.role;
 *     
 *     return { next: true };
 *   }
 * });
 * 
 * @example
 * // Hook that returns early response (skips handler)
 * const cacheHook = defineHook({
 *   name: 'cache',
 *   setup: (config: { ttl: number }) => {
 *     const cache = new Map<string, { data: any; expires: number }>();
 *     return { cache, ttl: config.ttl };
 *   },
 *   handler: async (ctx, state) => {
 *     const key = `${ctx.route}:${JSON.stringify(ctx.input)}`;
 *     const cached = state.cache.get(key);
 *     
 *     if (cached && cached.expires > Date.now()) {
 *       // Return cached response, skip handler
 *       return { next: true, response: cached.data };
 *     }
 *     
 *     // Continue to handler
 *     return { next: true };
 *   }
 * });
 */
export function defineHook<TConfig = void, TState = any>(
  definition: HookDefinition<TConfig, TState>
): TConfig extends void ? RouteHook : (config: TConfig) => RouteHook {
  // If no setup function, return RouteHook directly
  if (!definition.setup) {
    const hook: RouteHook = (ctx: HookContext) => definition.handler(ctx);
    return hook as any;
  }

  // If setup function exists, return factory function
  const factory = (config: TConfig): RouteHook => {
    // Call setup once to initialize state
    const state = definition.setup!(config);

    // Return hook with closure over state
    const hook: RouteHook = (ctx: HookContext) => definition.handler(ctx, state);
    return hook;
  };

  return factory as any;
}

// ============================================================================
// HOOK COMPOSITION
// ============================================================================

/**
 * Composes multiple hooks into a single hook that executes them sequentially.
 * 
 * The composed hook will:
 * - Execute hooks in the order they are provided
 * - Stop execution if any hook returns `{ next: false }`
 * - Return early if any hook returns `{ next: true, response }`
 * - Continue to next hook if hook returns `{ next: true }`
 * 
 * @param hooks - Hooks to compose (executed in order)
 * @returns A single RouteHook that executes all provided hooks sequentially
 * 
 * @example
 * // Create reusable hook compositions
 * const protectedRoute = composeHooks(
 *   rateLimitHook,
 *   authHook,
 *   loggerHook
 * );
 * 
 * // Use composed hook in routes
 * const userRoutes = {
 *   getUser: defineRoute({
 *     hooks: [protectedRoute],
 *     handler: async ({ id }, context) => {
 *       // context.userId available from authHook
 *       return { id, name: 'John' };
 *     }
 *   })
 * };
 * 
 * @example
 * // Compose hooks conditionally
 * const createProtectedRoute = (requireAdmin: boolean) => {
 *   const hooks = [rateLimitHook, authHook];
 *   if (requireAdmin) {
 *     hooks.push(adminOnlyHook);
 *   }
 *   return composeHooks(...hooks);
 * };
 * 
 * const adminRoute = createProtectedRoute(true);
 * const userRoute = createProtectedRoute(false);
 * 
 * @example
 * // Nest composed hooks
 * const baseProtection = composeHooks(rateLimitHook, authHook);
 * const adminProtection = composeHooks(baseProtection, adminOnlyHook);
 */
export function composeHooks(...hooks: RouteHook[]): RouteHook {
  return async (ctx: HookContext): Promise<HookResult> => {
    // Execute hooks sequentially
    for (const hook of hooks) {
      try {
        const result = await hook(ctx);

        // If hook says stop, stop immediately
        if (!result.next) {
          return result;
        }

        // If hook provides response, skip remaining hooks
        if ('response' in result) {
          return result;
        }

        // Otherwise continue to next hook
      } catch (error) {
        // Catch unexpected errors and convert to error result
        console.error(`Hook error in composed hook:`, error);
        return {
          next: false,
          status: 500,
          error: error instanceof Error ? error.message : 'Hook execution failed',
        };
      }
    }

    // All hooks passed, continue to handler
    return { next: true };
  };
}
