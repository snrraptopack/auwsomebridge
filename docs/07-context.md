# Context

The `context` object is a mutable bag populated by hooks and passed to your route handler. It enables authentication, permissions, logging, caching, and other cross-cutting concerns without tying your code to a specific runtime.

## Shape and Lifecycle

- Created empty by the adapter and carried through the hook chain.
- Each hook may add or update fields on `context`.
- The final handler receives `context` as its optional second parameter.

```
handler: async (input, context?: { userId: string; role?: 'admin' | 'moderator' | 'user' }) => {
  // Narrowing example
  const userId = context?.userId;
  const role = context?.role;
  // ... use after guards or defaults
  return { /* data */ };
}
```

## Typical Fields

- `userId` and `role` (set by `authHook`).
- `__loggerStartTime` or similar markers (set by `loggerHook`).
- Cache-related markers: `__cacheKey`, `__cacheTtl`, `__cacheStore` (set by cache hooks).
- Request metadata copied by custom hooks: `request.ip`, `request.url`, `request.method`, `request.userAgent`.
- Note: Rate-limit hooks generally do not modify `context`.

## Accessing Raw Request Details

- Raw request info (headers, ip, url, query) lives in `ctx.req` and is available inside hooks.
- Handlers receive only `input` and `context`. If a handler needs request details, introduce a small hook to copy selected `ctx.req` fields into `context`.

Example:
```
ctx.context.request = {
  ip: ctx.req.ip,
  url: ctx.req.url,
  method: ctx.req.method,
  userAgent: ctx.req.headers['user-agent'],
};
return { next: true };
```

## Cloudflare Bindings (`context.env`)

- When running under Hono on Cloudflare Workers, the adapter injects `c.env` into `context.env`.
- On non-Workers runtimes (local Node/Express), `context.env` is `undefined`; guard accordingly.
- Recommended usage:
  - Access bindings from hooks or handlers: `context.env.MY_KV`, `context.env.MY_QUEUE`, `context.env.MY_R2`.
  - Prefer hooks for cross‑cutting concerns that depend on bindings (auth, rate limit, feature flags).

Example: fail fast if required bindings are missing

```
import { setupBridge } from '../server/core/bridge';
import { envGuardHook, createEnvGuardHook } from '../server/hooks';

// Globally require presence of any env (Workers runtime)
const { middleware } = setupBridge(routes, {
  hooks: [envGuardHook],
});

// Or require specific binding keys
const requireKvAndQueue = createEnvGuardHook(['MY_KV', 'MY_QUEUE']);
const { middleware: mw2 } = setupBridge(routes, {
  hooks: [requireKvAndQueue],
});
```

Handler access pattern with guards

```
export const userRoutes = {
  getUserData: defineRoute({
    method: 'GET',
    hooks: [envGuardHook],
    handler: async (_input, context) => {
      const kv = (context!.env as any).MY_KV; // Workers runtime
      const value = await kv.get('user:123');
      return { value };
    },
  }),
};
```

Notes

- Do not log secrets from `context.env`.
- Wrap binding usage behind hooks for consistent testability.
- Keep fallbacks for local development where `context.env` is undefined.

## Typing the Context

- Keep the handler’s context parameter optional for type compatibility:
```
handler: async (input, context?: { userId: string; role?: 'admin' | 'moderator' | 'user' }) => { /* ... */ }
```

- Alternatively, set `defineRoute<I, O, C>` and still accept `context?: C` in the handler.
- If some fields are only set by optional hooks, mark them optional in the type.

## Guards and Permissions

- Prefer dedicated permission hooks (`requireAdmin`, `requireRole`) to enforce access with correct HTTP statuses.
- If you still add guards in the handler, note that throwing will produce a `500` error via the executor. Use hooks for `401/403` semantics.

## Stability and Maintenance

- Document context fields used by each route to keep expectations clear.
- Avoid “context sprawl”; only add fields that multiple handlers need.
- Consider using namespaced fields (e.g., `auth.userId`, `log.start`) to avoid collisions in larger projects.

## Pitfalls

- Treat `context` as optional in handlers; TypeScript models this for routes that don’t rely on hooks.
- Don’t assume raw request fields are present in `context`. Add a hook when needed.
- Avoid storing large blobs (e.g., whole headers or bodies) in `context`.

---

With `context` well-defined and guarded via hooks, your route handlers stay clean, predictable, and runtime-agnostic.