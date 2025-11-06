# Hooks

Hooks provide composable, cross-cutting behavior across all routes, identical in Express and Hono. They can authenticate, rate limit, log, cache, or enforce permissions, and they populate a mutable `context` object used by handlers.

## What Is a Hook?

- A hook is a function that receives a `HookContext` and returns a `HookResult` to control execution.
- It can:
  - Read normalized request data via `ctx.req` (method, headers, body, query, params, ip, url).
  - Read/modify `ctx.context` (shared, mutable object passed to the final handler).
  - Short-circuit the chain with an error or an early success response.
  - Continue to the next hook/handler.

## HookResult Model

Hooks return one of these shapes:

- Continue:
```
{ next: true }
```

- Early success (skip handler):
```
{ next: true, response: any }
```

- Stop with error:
```
{ next: false, status: number, error: string }
```

## Execution Order

- Global hooks (configured in `setupBridge`) run first.
- Per-route hooks (declared in `defineRoute`) run after global hooks.
- If any hook short-circuits, remaining hooks and the handler are not executed.

## Common Built-in Hooks

- `authHook`
  - Validates authorization (e.g., bearer token).
  - Adds `context.userId` and `context.role`.
- `standardRateLimit`
  - Tracks request counts per `ctx.req.ip`.
  - Returns a `429` when limits are exceeded.
  - Does not modify `context`.
- `loggerHook` / `detailedLoggerHook`
  - Records timing and request metadata.
  - May set `context.__loggerStartTime` or similar markers.
- Cache hooks (`createCacheHook`)
  - Compute a cache key (often from `input`, headers, url).
  - Early return cached responses or store fresh results.
- Permission hooks (e.g., `requireAdmin`, `requireRole('...')`)
  - Enforce access policies based on `context.role`.

## Writing a Custom Hook

Example: add request metadata fields for handler consumption

```
import { defineHook } from '../core/shared/hooks';

export const requestMetaHook = defineHook({
  name: 'request-meta',
  handler: async (ctx) => {
    const { headers, ip, url, method } = ctx.req;
    // Copy only what handlers need into context
    ctx.context.request = {
      ip,
      url,
      method,
      userAgent: headers['user-agent'],
    };
    return { next: true };
  },
});
```

Example: permission guard (short-circuit on failure)

```
import { defineHook } from '../core/shared/hooks';

export const requireAdmin = defineHook({
  name: 'require-admin',
  handler: async (ctx) => {
    const role = ctx.context.role;
    if (role !== 'admin') {
      return { next: false, status: 403, error: 'Admin role required' };
    }
    return { next: true };
  },
});
```

Example: cache early return

```
import { defineHook } from '../core/shared/hooks';

export const createSimpleCache = defineHook({
  name: 'simple-cache',
  setup: () => {
    const cache = new Map<string, any>();
    return { cache };
  },
  handler: async (ctx, state) => {
    const key = `${ctx.route}:${JSON.stringify(ctx.input)}`;
    const hit = state.cache.get(key);
    if (hit) {
      return { next: true, response: hit };
    }
    // Continue; another hook or the handler can store the value
    return { next: true };
  },
});
```

Notes:
- Prefer small, focused hooks.
- Only place data in `ctx.context` that handlers actually use.
- Use `ctx.req` for raw request details inside hooks; copy selected fields into `context` if handlers need them.

## Early Returns and Errors

- Hooks can short-circuit by returning an error result (`{ next: false, status, error }`) or a success result (`{ next: true, response }`).
- When a hook short-circuits, remaining hooks and the handler are skipped.

## Testing Hooks

- Unit test by simulating a minimal `HookContext` and asserting mutations to `ctx.context` or short-circuit behavior.
- Integration test via calling actual endpoints and verifying status codes and response shapes.

## Performance Tips

- Keep hook logic O(1) per request where possible.
- Cache expensive computations and reuse across the hook chain using `ctx.context`.
- Rate limiting per IP should use efficient maps; reset windows periodically.

## Best Practices

- Prefer hooks over in-handler logic for cross-cutting concerns and proper status codes.
- Keep `context` fields documented and stable.
- Avoid storing large request bodies or headers in `context`; copy only needed fields.
- Ensure hooks are deterministic and do not depend on mutable global state.

---

See `docs/07-context.md` next for how to type and consume the `context` object in handlers.