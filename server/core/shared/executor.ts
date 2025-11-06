import type { RouteHook, HookContext, RouteHandler } from './types';

// ============================================================================
// HOOK EXECUTION ENGINE
// ============================================================================

/**
 * Executes a chain of hooks followed by the route handler.
 * 
 * The executor:
 * - Runs global hooks first, then route-specific hooks
 * - Stops execution if any hook returns `{ next: false }`
 * - Returns early if any hook returns `{ next: true, response }`
 * - Passes mutable context through the entire chain
 * - Handles errors gracefully
 * 
 * @example
 * ```typescript
 * const executor = new HookExecutor();
 * 
 * const result = await executor.execute(
 *   [rateLimitHook, authHook],
 *   async (input, context) => {
 *     return { userId: context.userId };
 *   },
 *   {
 *     req: normalizedRequest,
 *     method: 'GET',
 *     route: 'getUser',
 *     input: { id: '123' },
 *     context: {}
 *   }
 * );
 * ```
 */
export class HookExecutor {
  /**
   * Executes hooks in sequence, stopping on error or early response.
   * 
   * Execution flow:
   * 1. Execute each hook in order
   * 2. If hook returns `{ next: false }`, stop and return error
   * 3. If hook returns `{ next: true, response }`, skip handler and return response
   * 4. If all hooks pass, execute handler
   * 5. Return handler result
   * 
   * @param hooks - Array of hooks to execute (global + route-specific)
   * @param handler - Route handler to execute after hooks
   * @param ctx - Hook context containing request info and mutable context
   * @returns Handler result, early response from hook, or error
   * 
   * @throws Never throws - all errors are caught and converted to error results
   * 
   * @example
   * ```typescript
   * // Execute with hooks
   * const result = await executor.execute(
   *   [authHook, loggerHook],
   *   async ({ id }, context) => {
   *     return { id, name: 'John', userId: context.userId };
   *   },
   *   hookContext
   * );
   * ```
   * 
   * @example
   * ```typescript
   * // Hook stops execution
   * const result = await executor.execute(
   *   [authHook], // Returns { next: false, status: 401, error: 'Unauthorized' }
   *   handler,
   *   hookContext
   * );
   * // result = { error: 'Unauthorized', status: 401 }
   * ```
   * 
   * @example
   * ```typescript
   * // Hook returns early response (cache hit)
   * const result = await executor.execute(
   *   [cacheHook], // Returns { next: true, response: cachedData }
   *   handler,
   *   hookContext
   * );
   * // result = cachedData (handler not executed)
   * ```
   */
  async execute(
    hooks: RouteHook[],
    handler: RouteHandler<any, any, any>,
    ctx: HookContext
  ): Promise<{ success: true; data: any } | { success: false; status: number; error: string }> {
    try {
      // Execute hooks sequentially
      for (const hook of hooks) {
        try {
          const result = await hook(ctx);

          // Hook says stop - return error
          if (!result.next) {
            return {
              success: false,
              status: result.status,
              error: result.error,
            };
          }

          // Hook provides early response - skip handler
          if ('response' in result) {
            return {
              success: true,
              data: result.response,
            };
          }

          // Hook says continue - proceed to next hook
        } catch (error) {
          // Catch unexpected errors in hook execution
          console.error(`Hook execution error:`, error);
          return {
            success: false,
            status: 500,
            error: error instanceof Error ? error.message : 'Hook execution failed',
          };
        }
      }

      // All hooks passed - execute handler
      try {
        const result = await handler(ctx.input, ctx.context);
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        // Catch errors in handler execution
        console.error(`Handler execution error:`, error);
        return {
          success: false,
          status: 500,
          error: error instanceof Error ? error.message : 'Handler execution failed',
        };
      }
    } catch (error) {
      // Catch any unexpected errors
      console.error(`Unexpected error in executor:`, error);
      return {
        success: false,
        status: 500,
        error: 'Internal server error',
      };
    }
  }

  /**
   * Combines global and route-specific hooks in the correct order.
   * 
   * Global hooks are executed first, followed by route-specific hooks.
   * This allows global concerns (rate limiting, logging) to run before
   * route-specific concerns (authentication, permissions).
   * 
   * @param globalHooks - Hooks that apply to all routes
   * @param routeHooks - Hooks specific to this route
   * @returns Combined array of hooks in execution order
   * 
   * @example
   * ```typescript
   * const executor = new HookExecutor();
   * const allHooks = executor.combineHooks(
   *   [rateLimitHook, loggerHook],  // Global
   *   [authHook, cacheHook]          // Route-specific
   * );
   * // Result: [rateLimitHook, loggerHook, authHook, cacheHook]
   * ```
   */
  combineHooks(globalHooks: RouteHook[] = [], routeHooks: RouteHook[] = []): RouteHook[] {
    return [...globalHooks, ...routeHooks];
  }
}
