import { defineHook } from '../core/shared/hooks';

// ============================================================================
// ENV BINDINGS GUARD HOOK
// ============================================================================

/**
 * Guard that ensures Cloudflare Workers bindings are available in `context.env`.
 *
 * Use this as a global hook or per-route hook to fail fast when required
 * environment bindings are missing, preventing undefined access errors.
 *
 * @example
 * ```typescript
 * // Require presence of any env bindings (Workers runtime)
 * setupBridge(routes, { hooks: [envGuardHook] });
 *
 * // Require specific bindings
 * const requireKvAndQueue = createEnvGuardHook(['MY_KV', 'MY_QUEUE']);
 * setupBridge(routes, { hooks: [requireKvAndQueue] });
 * ```
 */
export const envGuardHook = defineHook({
  name: 'envGuard',
  handler: (ctx) => {
    const env = (ctx.context as any)?.env;
    if (!env) {
      return {
        next: false,
        status: 500,
        error: 'Environment bindings unavailable (non-Workers runtime or not injected)',
      };
    }
    return { next: true };
  },
});

/**
 * Creates a guard hook that requires specific binding keys in `context.env`.
 *
 * @param requiredKeys - List of binding names that must exist
 * @returns RouteHook that enforces presence of the specified bindings
 */
export const createEnvGuardHook = defineHook({
  name: 'envGuardWithKeys',
  setup: (requiredKeys: string[]) => ({ requiredKeys }),
  handler: (ctx, state) => {
    const env = (ctx.context as any)?.env as Record<string, unknown> | undefined;
    if (!env) {
      return {
        next: false,
        status: 500,
        error: 'Environment bindings unavailable (non-Workers runtime or not injected)',
      };
    }

    const missing = state.requiredKeys.filter((k) => env[k] === undefined);
    if (missing.length > 0) {
      return {
        next: false,
        status: 500,
        error: `Required environment bindings missing: ${missing.join(', ')}`,
      };
    }

    return { next: true };
  },
});