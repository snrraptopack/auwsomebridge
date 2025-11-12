## Baseline Assessment
- Entrypoint mounts:
  - Express: `server/app.ts:8` mounts `middleware` at `'/api/:route'`.
  - Bun: `server/app-bun.ts:5` calls `Bun.serve({ fetch: middleware })`.
- Core runtime detection and bridge:
  - Runtime detection: `server/core/bridge.ts:54` `detectRuntime()` selects `'express' | 'hono' | 'bun'` from env/Globals.
  - Bridge setup: `server/core/bridge.ts:497` `setupBridge()` builds server/client with adapters and hooks.
- Hook engine:
  - Lifecycle executor: `server/core/shared/executor.ts:264` `execute()` runs before → handler → after → cleanup, with `combineHooks()` at `server/core/shared/executor.ts:369`.
- Adapters:
  - Express middleware: `server/core/express/adapter.ts:45` `createExpressMiddleware(...)`, success/error responders at `server/core/express/adapter.ts:{183,202}`.
  - Hono middleware: `server/core/hono/adapter.ts:46` `createHonoMiddleware(...)`.
  - Bun middleware: `server/core/bun/adapter.ts:48` `createBunMiddleware(...)`.
- Routes and contracts (Zod):
  - Example routes: `server/routes/user.ts:{6,24,44,64}`, `server/routes/health.ts:5` using `defineRoute` from `bridge`.
- Logging hooks:
  - Exported hooks: `server/hooks/index.ts:68` exports `loggerHook`, `detailedLoggerHook`, `errorLoggerHook`, `metricsHook`.
  - Base logger hook: `server/hooks/logger.ts:35` `loggerHook`.

## Principles
- Preserve platform-specific adapters; add features by extending each adapter minimally.
- Reuse the hook lifecycle (`before/after/cleanup`) for cross-cutting concerns.
- Keep contracts in `zod` for type-safe IO; extend without breaking existing routes.

## Roadmap (Incremental, each step covers common cases)

### Phase 1: Foundations and Stability
- Declare missing runtime deps explicitly:
  - Ensure `express` and `@types/express` are declared if Express adapter is used alongside its ecosystem.
  - Confirm `hono` present; pin versions to avoid drift.
- Add lint/format tooling:
  - Introduce ESLint + Prettier with TS rules; wire to `bun run lint` and `bun run format`.
- CI quick wins:
  - Add a minimal GitHub Actions workflow to run `bun test` on push/PR; cache bun/npm.
- Build outputs consistency:
  - Verify `tsconfig.build.json` emits ESM with type declarations for `server/core/**` and adapters; ensure `package.json` `exports` maps to built files.

### Phase 2: SSE (Server-Sent Events) Support
- Server adapters:
  - Express: add `createSseRoute()` utility to set `Content-Type: text/event-stream`, `Cache-Control: no-cache`, and `Connection: keep-alive`; integrate with `createExpressMiddleware` via a `route.kind === 'sse'` check.
  - Hono: add `createSseMiddleware()` using `StreamingTextResponse`/`c.text()` with proper headers and flush; similar `route.kind` gating.
  - Bun: implement SSE via `new Response(stream, { headers })` and `ReadableStream`.
- Hook integration:
  - Extend hooks with optional `onStart`, `onEvent`, `onComplete` lifecycle for streaming routes, reusing `before/cleanup` to guard and finalize.
- Contracts:
  - Add `defineSseRoute({ input: zod, eventSchema: zod, ... })` mirroring `defineRoute` so payloads are validated before emission.
- Client `$api`:
  - Add `$api.sse.subscribe(route, input, { onEvent, onError, onClose })` built on `EventSource` in browsers and `fetch` + stream in Node/Bun.
- Coverage:
  - Add tests for backpressure and early termination in `executor` with streaming cleanup paths.

### Phase 3: WebSocket Support (Optional, opt-in)
- Server adapters:
  - Express: integrate `ws` or `uWebSockets.js` behind a small adapter; expose `createWsRoute()` that maps `onConnect`, `onMessage`, `onClose` to hook lifecycle.
  - Hono: use `hono/ws` or native WebSocket upgrade handling if available; wrap with our standardized route metadata.
  - Bun: use `Bun.serve({ websocket: { open, message, close } })` and route dispatch based on `pathname`.
- Hook integration:
  - Define `WsHook` phases: `beforeConnect`, `onMessage`, `cleanup` with permission/rate-limit hooks reusable from HTTP.
- Client `$api`:
  - Add `$api.ws.connect(route, input, handlers)` with auto-reconnect, ping/pong, and zod-validated messages.
- Contracts:
  - `defineWsRoute({ input: zod, messageSchema: zod })` for typed messaging.

### Phase 4: Observability and Resilience
- Request correlation:
  - Introduce request IDs propagated through adapters and hooks; include in logs.
- Metrics:
  - Expand `metricsHook` to collect latency, error counts, in-flight streams; expose Prometheus-compatible counters where applicable.
- Error normalization:
  - Ensure all adapters use a shared error formatter from `server/core/shared/error.ts` so responses are identical.
- Timeouts and cancellation:
  - Add optional per-route timeouts; support `AbortSignal` propagation to handlers and streaming senders.

### Phase 5: Security and Platform Hygiene
- CORS and headers:
  - Provide `corsHook` with sane defaults per runtime; add `helmet`-style headers for Express only, keep others minimal.
- Auth and permissions:
  - Expand `authHook` to support token extraction from headers/cookies consistently; add `requireRole` helper.
- Rate limiting:
  - Improve `standardRateLimit` to support memory LRU and platform-specific drivers (KV for Workers/Bun file-backed), all behind a uniform hook API.

### Phase 6: Configuration and Environment
- Config unification:
  - Extend `detectRuntime()` (`server/core/bridge.ts:54`) to support explicit overrides and fallbacks; centralize config defaults per runtime.
- Environment bindings:
  - Strengthen `server/hooks/env.ts` to validate required bindings and surface clear errors during `before` phase.
- Optional `.env` support for Node/Bun:
  - Load with `dotenv` when present; no requirement for Workers.

### Phase 7: Developer Experience
- CLI templates:
  - Enhance `create/**` templates to include minimal SSE and WS examples for each runtime.
- Manual app demo:
  - Extend `manual-test/**` to showcase `$api.sse` and `$api.ws` alongside existing routes.
- Docs and examples:
  - Add inline JSDoc to new APIs to maintain discoverability without heavy external docs.

## Acceptance Criteria per Phase
- Backward-compatible: existing HTTP routes continue to run unchanged.
- Platform-respecting: features implemented per adapter with minimal common abstractions.
- Contract-first: all inputs/outputs/events/messages validated with `zod`.
- Tested: unit tests for hook lifecycle, adapter behavior, and streaming/WS flows; basic integration via Bun test runner.

## Next Step
- Confirm Phase 1 → 2 ordering and the SSE-first approach; once approved, implement Phase 1 changes, then add SSE endpoints and client helpers incrementally across adapters.