# API Bridge: Introduction and Goals

This project provides a unified, type-safe API bridge that runs identically on Express and Hono. It abstracts framework differences behind a shared execution engine for validation, hooks, and consistent responses, so you can focus on your route logic while keeping runtime flexibility.

## Goals

- Unify server runtimes (Express and Hono) behind a single bridge.
- Enforce input/output validation with Zod and fail fast for invalid data.
- Provide a composable hook system for cross-cutting concerns (auth, rate limiting, logging, caching, permissions).
- Guarantee consistent API responses across runtimes (`ApiSuccess` / `ApiError`).
- Keep handlers minimal: they receive validated `input` and a hook-populated `context`.
- Be ergonomic and type-safe without leaking runtime-specific types into shared code.

## What This Achieves

- Portable routes: define a route once, run it on Express or Hono without changing handler code.
- Click-in hooks: apply global hooks in one place, add route-specific hooks only where needed.
- Predictable responses: clients can rely on stable success/error shapes everywhere.
- Easier testing: routes are deterministic with validation and hook gating.
- Safer typing: strict overloads handled on the adapter side, handlers stay clean.

## Architecture Overview

- `server/core/shared/`
  - `types.ts`: Shared types (`RouteDefinition`, `HookContext`, `ApiSuccess`/`ApiError`, `BridgeConfig`).
  - `hooks.ts`: Hook utilities (`defineHook`, composition patterns).
  - `validation.ts`: Zod-based input/output validation helpers.
  - `response.ts`: Formatters for success and error payloads.
  - `executor.ts`: Hook execution engine that runs global + route hooks, then the handler.
- `server/core/express/` and `server/core/hono/`
  - `normalize.ts`: Convert framework requests into `NormalizedRequest` (headers, query, params, body, ip, url).
  - `adapter.ts`: Framework-specific middleware creation, validation, hook execution, and response sending.
- `server/core/bridge.ts`
  - User-facing API: `defineRoute`, `composeRoutes`, `setupBridge`, and helpers.

## Runtimes: Express vs Hono

- Express: `server/app.ts`
  - Uses `createExpressMiddleware` mounted at `/api/:route`.
  - Standard `res.status(...).json(...)` responses.
- Hono: `server/app-hono.ts`
  - Uses `createHonoMiddleware` mounted at `/api/:route`.
  - Status handling uses `c.status(StatusCode)` and `c.json(...)` to satisfy Hono’s strict typings.
  - Header normalization leverages `c.req.raw.headers.forEach(...)` to avoid runtime issues.

Both entrypoints use port `3000`. Run only one at a time to avoid `EADDRINUSE`.

## Hooks and Context

- Hooks are composable functions that run before the handler and can:
  - Continue: `{ next: true }`
  - Short-circuit with a cached/early response: `{ next: true, response }`
  - Stop with an error: `{ next: false, status, error }`
- `HookContext` gives hooks access to a normalized request and a mutable `context` object. Hooks populate `context` for handlers to use.

Examples:
- `authHook` adds `context.userId` and `context.role` when Authorization is valid.
- `loggerHook` adds timing fields like `context.__loggerStartTime` and logs request metadata.
- `standardRateLimit` enforces request quotas globally without changing context.
- Cache and permission hooks are available for opt-in routes.

Handler signature:
- `handler(input, context?)` — the `context` parameter is optional for type compatibility, but the executor passes an object (initially `{}`) at runtime. Narrow in the handler with `context?.userId` or guard as needed.

## Validation and Responses

- Input validation: define `input` with Zod in your route; invalid requests return `400` with details.
- Output validation (optional via config): define `output` with Zod; if a handler returns invalid data, the bridge returns `500` with validation issues.
- Response format:
  - Success: `{ status: 'success', data, timestamp }`
  - Error: `{ status: 'error', error, code, details?, timestamp }`

## Error Handling Details

- Framework adapters normalize and send errors using shared `HttpStatus` and `ErrorCode`.
- Hono specifics handled in the adapter:
  - Status typing compatibility via `toStatusCode(number): StatusCode`.
  - `c.json` overloads respected by setting status with `c.status(...)` first.
  - Header normalization via native `Request.headers` to avoid `500`.

## Quickstart

1. Install and run Hono server:
   - `bun run server:hono`
   - Visit `/api/ping` → `{ status: 'success', data: { ok: true }, timestamp }`
2. Or run Express server:
   - `bun run server:express` (if script exists) or `node server/app.ts` after building
   - Hit the same endpoints under `/api/:route`.
3. Define a route in `server/routes/user.ts`:
   ```ts
   export const userRoutes = {
     getUserById: defineRoute({
       method: 'GET',
       input: z.object({ id: z.string().uuid() }),
       output: z.object({ id: z.string(), name: z.string(), email: z.string().email() }),
       hooks: [authHook],
       handler: async ({ id }, context?: { userId: string; role?: 'admin' | 'moderator' | 'user' }) => ({
         id,
         name: 'John Doe',
         email: 'john@example.com',
       }),
     }),
   };
   ```

## Developer Ergonomics

- Keep handlers small: they receive validated input and a context populated by hooks.
- Prefer adding hook-based guards (auth/permissions) over inline checks in handlers.
- If handlers need request metadata (e.g., headers or IP), add a small hook that copies needed fields into `context`.
- For strong type guarantees, annotate `context` in each handler or set the third generic on `defineRoute` — but keep the handler’s parameter optional to match `RouteHandler`.

## Non-Goals

- Not a full auth framework — hooks demonstrate patterns for you to customize.
- Not a caching platform — cache hooks provide primitives; you choose storage.
- Not tied to any client — response shapes are stable to integrate with any frontend.

## Roadmap / Future Work

- Add generated client docs (`scripts/generate-api.ts`, `src/api.ts`) and examples.
- Expand hook catalog (rate limit by user, per-route quotas, circuit breakers).
- Add integration tests across both runtimes.
- Provide recipe docs for common patterns (RBAC, ETag caching, request tracing).