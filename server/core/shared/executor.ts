import type {
  RouteHook,
  HookContext,
  RouteHandler,
  LifecycleHook,
  BeforeHook,
  AfterHook,
  CleanupHook,
  AfterHookContext,
  CleanupHookContext,
  HookResult,
  AfterHookResult,
} from './types';

// ============================================================================
// HOOK EXECUTION ENGINE
// ============================================================================

/**
 * Executes a chain of hooks with lifecycle support followed by the route handler.
 * 
 * The executor:
 * - Extracts before/after/cleanup methods from hooks
 * - Runs before hooks → handler → after hooks → cleanup hooks
 * - Stops execution if any before/after hook returns `{ next: false }`
 * - Returns early if any before hook returns `{ next: true, response }`
 * - Always executes cleanup hooks, even on errors
 * - Passes mutable context through the entire chain
 * - Handles errors gracefully
 * 
 * @example
 * ```typescript
 * const executor = new HookExecutor();
 * 
 * const result = await executor.execute(
 *   [rateLimitHook, authHook, metricsHook],
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
   * Checks if a hook is a lifecycle hook.
   * 
   * @param hook - Hook to check
   * @returns True if the hook is a lifecycle hook
   */
  private isLifecycleHook(hook: RouteHook): hook is LifecycleHook {
    return typeof hook === 'object' && '__isLifecycleHook' in hook && hook.__isLifecycleHook === true;
  }
  /**
   * Extracts lifecycle methods from hooks.
   * 
   * Separates hooks into before, after, and cleanup arrays.
   * - Lifecycle hooks: extract each defined lifecycle method
   * - Legacy hooks: treat as before hooks
   * 
   * @param hooks - Array of hooks (can be lifecycle or legacy)
   * @returns Object with separated before, after, and cleanup hooks
   */
  private extractLifecycleMethods(hooks: RouteHook[]): {
    before: BeforeHook[];
    after: AfterHook[];
    cleanup: CleanupHook[];
  } {
    const before: BeforeHook[] = [];
    const after: AfterHook[] = [];
    const cleanup: CleanupHook[] = [];

    for (const hook of hooks) {
      if (this.isLifecycleHook(hook)) {
        // Lifecycle hook - extract each phase
        if (hook.before) before.push(hook.before);
        if (hook.after) after.push(hook.after);
        if (hook.cleanup) cleanup.push(hook.cleanup);
      } else {
        // Legacy hook - treat as before hook
        before.push(hook);
      }
    }

    return { before, after, cleanup };
  }

  /**
   * Executes before hooks in sequence.
   * 
   * @param hooks - Before hooks to execute
   * @param ctx - Hook context
   * @returns Success, early response, or error result
   */
  private async executeBeforeHooks(
    hooks: BeforeHook[],
    ctx: HookContext
  ): Promise<
    | { success: true }
    | { success: true; earlyResponse: any }
    | { success: false; status: number; error: string }
  > {
    for (const hook of hooks) {
      try {
        const result: HookResult = await hook(ctx);

        if (!result.next) {
          return {
            success: false,
            status: result.status,
            error: result.error,
          };
        }

        if ('response' in result) {
          return {
            success: true,
            earlyResponse: result.response,
          };
        }
      } catch (error) {
        console.error(`Before hook error:`, error);
        return {
          success: false,
          status: 500,
          error: error instanceof Error ? error.message : 'Hook execution failed',
        };
      }
    }

    return { success: true };
  }

  /**
   * Executes after hooks with response data.
   * 
   * @param hooks - After hooks to execute
   * @param ctx - Hook context
   * @param response - Handler response data
   * @returns Final response or error result
   */
  private async executeAfterHooks(
    hooks: AfterHook[],
    ctx: HookContext,
    response: any
  ): Promise<
    | { success: true; response: any }
    | { success: false; status: number; error: string }
  > {
    let currentResponse = response;

    for (const hook of hooks) {
      try {
        const afterCtx: AfterHookContext = {
          ...ctx,
          response: currentResponse,
        };

        const result: AfterHookResult = await hook(afterCtx);

        if (!result.next) {
          return {
            success: false,
            status: result.status,
            error: result.error,
          };
        }

        // Update response if hook modified it
        if ('response' in result) {
          currentResponse = result.response;
        }
      } catch (error) {
        console.error(`After hook error:`, error);
        return {
          success: false,
          status: 500,
          error: error instanceof Error ? error.message : 'After hook execution failed',
        };
      }
    }

    return { success: true, response: currentResponse };
  }

  /**
   * Executes cleanup hooks (always runs, errors are logged but don't stop execution).
   * 
   * @param hooks - Cleanup hooks to execute
   * @param ctx - Hook context
   * @param outcome - Request outcome information
   */
  private async executeCleanupHooks(
    hooks: CleanupHook[],
    ctx: HookContext,
    outcome: {
      success: boolean;
      response?: any;
      error?: { status: number; message: string };
    }
  ): Promise<void> {
    for (const hook of hooks) {
      try {
        const cleanupCtx: CleanupHookContext = {
          ...ctx,
          success: outcome.success,
          response: outcome.response,
          error: outcome.error,
        };

        await hook(cleanupCtx);
      } catch (error) {
        // Log but don't throw - cleanup hooks must not fail the request
        console.error(`Cleanup hook error (non-fatal):`, error);
      }
    }
  }

  /**
   * Executes hooks in sequence with full lifecycle support.
   * 
   * Execution flow:
   * 1. Extract lifecycle methods from hooks
   * 2. Execute before hooks (can short-circuit or return early)
   * 3. Execute handler (if before hooks pass)
   * 4. Execute after hooks (can transform response or error)
   * 5. Execute cleanup hooks (always runs in finally block)
   * 
   * @param hooks - Array of hooks to execute (global + route-specific)
   * @param handler - Route handler to execute after before hooks
   * @param ctx - Hook context containing request info and mutable context
   * @returns Handler result, early response from hook, or error
   * 
   * @throws Never throws - all errors are caught and converted to error results
   * 
   * @example
   * ```typescript
   * // Execute with lifecycle hooks
   * const result = await executor.execute(
   *   [metricsHook, authHook, cacheHook],
   *   async ({ id }, context) => {
   *     return { id, name: 'John', userId: context.userId };
   *   },
   *   hookContext
   * );
   * ```
   * 
   * @example
   * ```typescript
   * // Before hook stops execution, cleanup still runs
   * const result = await executor.execute(
   *   [authHook, metricsHook], // authHook returns error, metricsHook cleanup still runs
   *   handler,
   *   hookContext
   * );
   * ```
   */
  async execute(
    hooks: RouteHook[],
    handler: RouteHandler<any, any, any>,
    ctx: HookContext
  ): Promise<{ success: true; data: any } | { success: false; status: number; error: string }> {
    // Extract lifecycle methods from hooks
    const { before, after, cleanup } = this.extractLifecycleMethods(hooks);

    let outcome: {
      success: boolean;
      response?: any;
      error?: { status: number; message: string };
    } = { success: false };

    try {
      // 1. Execute before hooks
      const beforeResult = await this.executeBeforeHooks(before, ctx);

      if (!beforeResult.success) {
        outcome = {
          success: false,
          error: {
            status: beforeResult.status,
            message: beforeResult.error,
          },
        };
        return { success: false, status: beforeResult.status, error: beforeResult.error };
      }

      // Check for early response from before hooks
      if ('earlyResponse' in beforeResult) {
        outcome = {
          success: true,
          response: beforeResult.earlyResponse,
        };
        return { success: true, data: beforeResult.earlyResponse };
      }

      // 2. Execute handler
      let handlerResponse: any;
      try {
        handlerResponse = await handler(ctx.input, ctx.context);
      } catch (error) {
        console.error(`Handler execution error:`, error);
        outcome = {
          success: false,
          error: {
            status: 500,
            message: error instanceof Error ? error.message : 'Handler execution failed',
          },
        };
        return {
          success: false,
          status: 500,
          error: error instanceof Error ? error.message : 'Handler execution failed',
        };
      }

      // 3. Execute after hooks
      const afterResult = await this.executeAfterHooks(after, ctx, handlerResponse);

      if (!afterResult.success) {
        outcome = {
          success: false,
          error: {
            status: afterResult.status,
            message: afterResult.error,
          },
        };
        return { success: false, status: afterResult.status, error: afterResult.error };
      }

      // Success!
      outcome = {
        success: true,
        response: afterResult.response,
      };
      return { success: true, data: afterResult.response };
    } finally {
      // 4. Always execute cleanup hooks
      await this.executeCleanupHooks(cleanup, ctx, outcome);
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
