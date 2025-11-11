import type {
  HookDefinition,
  RouteHook,
  HookContext,
  HookResult,
  LifecycleHook,
  BeforeHook,
} from './types';

// ============================================================================
// HOOK DEFINITION
// ============================================================================

/**
 * Defines a hook that can be used in routes or globally.
 * 
 * This function creates hooks with optional configuration, state management, and lifecycle support.
 * - Supports legacy `handler` (treated as before hook) for backward compatibility
 * - Supports lifecycle methods: `before`, `after`, `cleanup`
 * - If no `setup` function is provided, returns a RouteHook directly
 * - If `setup` is provided, returns a factory function that creates RouteHook instances
 * 
 * @template TConfig - Configuration type for the hook (void if no config needed)
 * @template TState - State type returned by setup function
 * 
 * @param definition - Hook definition with name, optional setup, and lifecycle methods
 * @returns If setup is provided, returns a factory function; otherwise returns a RouteHook directly
 * 
 * @example
 * // Legacy hook (backward compatible)
 * const loggerHook = defineHook({
 *   name: 'logger',
 *   handler: (ctx) => {
 *     console.log(`[${ctx.method}] ${ctx.route}`, ctx.input);
 *     return { next: true };
 *   }
 * });
 * 
 * @example
 * // Lifecycle hook with all phases
 * const metricsHook = defineHook({
 *   name: 'metrics',
 *   before: (ctx) => {
 *     ctx.context.__startTime = Date.now();
 *     return { next: true };
 *   },
 *   after: (ctx) => {
 *     console.log('Handler completed');
 *     return { next: true };
 *   },
 *   cleanup: (ctx) => {
 *     const duration = Date.now() - ctx.context.__startTime;
 *     console.log(`Duration: ${duration}ms, Success: ${ctx.success}`);
 *     return { next: true };
 *   }
 * });
 * 
 * @example
 * // Lifecycle hook with state management
 * const createCacheHook = defineHook({
 *   name: 'cache',
 *   setup: (config: { ttl: number }) => {
 *     const cache = new Map<string, { data: any; expires: number }>();
 *     return { cache, ttl: config.ttl };
 *   },
 *   before: (ctx, state) => {
 *     const key = `${ctx.route}:${JSON.stringify(ctx.input)}`;
 *     const cached = state.cache.get(key);
 *     
 *     if (cached && cached.expires > Date.now()) {
 *       return { next: true, response: cached.data };
 *     }
 *     
 *     ctx.context.__cacheKey = key;
 *     return { next: true };
 *   },
 *   after: (ctx, state) => {
 *     const key = ctx.context.__cacheKey;
 *     if (key) {
 *       state.cache.set(key, {
 *         data: ctx.response,
 *         expires: Date.now() + state.ttl * 1000,
 *       });
 *     }
 *     return { next: true };
 *   }
 * });
 * 
 * const shortCache = createCacheHook({ ttl: 60 });
 */
export function defineHook<TConfig = void, TState = any>(
  definition: HookDefinition<TConfig, TState>
): TConfig extends void ? RouteHook : (config: TConfig) => RouteHook {
  // Detect if this is a lifecycle hook or legacy hook
  const isLifecycleHook = !!(definition.before || definition.after || definition.cleanup);
  const isLegacyHook = !!definition.handler;

  // If no setup function
  if (!definition.setup) {
    if (isLifecycleHook) {
      // Return lifecycle hook object
      const lifecycleHook: LifecycleHook = {
        __hookName: definition.name,
        __isLifecycleHook: true,
        before: definition.before,
        after: definition.after,
        cleanup: definition.cleanup,
      };
      return lifecycleHook as any;
    } else if (isLegacyHook) {
      // Legacy hook - single handler treated as before hook
      const hook: BeforeHook = (ctx: HookContext) => definition.handler!(ctx);
      return hook as any;
    } else {
      // No handler or lifecycle methods - invalid
      throw new Error(`Hook "${definition.name}" must have either handler or lifecycle methods (before/after/cleanup)`);
    }
  }

  // Has setup function - return factory
  const factory = (config: TConfig): RouteHook => {
    const state = definition.setup!(config);

    if (isLifecycleHook) {
      // Create lifecycle hook with state closure
      const lifecycleHook: LifecycleHook = {
        __hookName: definition.name,
        __isLifecycleHook: true,
        before: definition.before ? (ctx) => definition.before!(ctx, state) : undefined,
        after: definition.after ? (ctx) => definition.after!(ctx, state) : undefined,
        cleanup: definition.cleanup ? (ctx) => definition.cleanup!(ctx, state) : undefined,
      };
      return lifecycleHook;
    } else if (isLegacyHook) {
      // Legacy hook with state
      const hook: BeforeHook = (ctx: HookContext) => definition.handler!(ctx, state);
      return hook;
    } else {
      // No handler or lifecycle methods - invalid
      throw new Error(`Hook "${definition.name}" must have either handler or lifecycle methods (before/after/cleanup)`);
    }
  };

  return factory as any;
}

// ============================================================================
// HOOK COMPOSITION
// ============================================================================

/**
 * Checks if a hook is a lifecycle hook.
 * 
 * @param hook - Hook to check
 * @returns True if the hook is a lifecycle hook
 */
function isLifecycleHook(hook: RouteHook): hook is LifecycleHook {
  return typeof hook === 'object' && '__isLifecycleHook' in hook && hook.__isLifecycleHook === true;
}

/**
 * Composes multiple hooks into a single hook that executes them sequentially.
 * 
 * The composed hook will:
 * - Execute hooks in the order they are provided
 * - Stop execution if any hook returns `{ next: false }`
 * - Return early if any hook returns `{ next: true, response }`
 * - Continue to next hook if hook returns `{ next: true }`
 * 
 * Note: This function only composes before hooks. Lifecycle hooks are flattened
 * to their before methods. For full lifecycle support, use hooks directly in routes.
 * 
 * @param hooks - Hooks to compose (executed in order)
 * @returns A single BeforeHook that executes all provided hooks sequentially
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
export function composeHooks(...hooks: RouteHook[]): BeforeHook {
  return async (ctx: HookContext): Promise<HookResult> => {
    // Execute hooks sequentially
    for (const hook of hooks) {
      try {
        let result: HookResult;

        if (isLifecycleHook(hook)) {
          // For lifecycle hooks, only execute the before method
          if (hook.before) {
            result = await hook.before(ctx);
          } else {
            // No before method, continue
            continue;
          }
        } else {
          // Legacy before hook
          result = await hook(ctx);
        }

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
