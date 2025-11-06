# Runtime Adapters (Express vs Hono)

This document explains how the bridge integrates with Express and Hono, what the adapters do, how requests are normalized, and practical differences to be aware of.

## Overview

- A single, shared bridge powers both runtimes. Your route definitions and hooks are identical regardless of whether you run Express or Hono.
- The adapters translate framework-specific requests/responses into a common shape and mount the bridge middleware at a configurable `prefix` (default `/api`).
- The bridge enforces a consistent response format for success and error cases.

## Architecture

- `setupBridge(routes, config)` composes routes, applies global hooks, and returns:
  - `middleware`: a framework-agnostic handler that adapters mount at `/api/:route`.
  - `$api`: a client interface derived from routes.
  - `metadata`: route descriptions for docs/introspection.
- Express and Hono adapters map their request/response primitives into the bridge’s `HookContext` and `NormalizedRequest`.

## Request Normalization

Normalization converts runtime-specific request objects to the bridge’s common `NormalizedRequest`:

- Fields:
  - `method`: HTTP method as uppercase string.
  - `headers`: lowercase-normalized headers map.
  - `body`: parsed JSON or undefined.
  - `query`: query parameters as a string-keyed object.
  - `params`: path parameters as a string-keyed object.
  - `ip`: best-effort client IP.
  - `url`: full request URL.

- Sources:
  - Express: from `req`, via `normalizeExpressRequest`.
  - Hono: from `Context`, via `normalizeHonoContext`.

## Response Handling

- Success JSON:
```
{
  "status": "success",
  "data": { ... },
  "timestamp": 1712345678901
}
```

- Error JSON:
```
{
  "status": "error",
  "error": "Human readable message",
  "code": "INTERNAL_ERROR|...",
  "details": { ...? },
  "timestamp": 1712345678901
}
```

- The adapters set the HTTP status code and forward the JSON body produced by the bridge.

## Status Codes and Typing Nuances

- Hono’s `c.status(code)` API expects a `StatusCode` type; the adapter ensures the numeric status is set before calling `c.json(...)`.
- Express uses numeric statuses directly (`res.status(code)`), no special typing required.

## Header Normalization

- Hono: raw headers are read from `c.req.raw.headers`, iterated and normalized to lowercase to avoid runtime mismatches.
- Express: headers come from `req.headers` and are similarly normalized.
- Always read headers from `context.req.headers` inside hooks/handlers for a consistent experience.

## Body Parsing

- The bridge expects JSON for request bodies and will provide `context.req.body` if available.
- Ensure JSON body parsing middleware is present:
  - Express: use `express.json()` before mounting the bridge.
  - Hono: Hono’s `c.req.json()` is used by the adapter where applicable.

## IP and URL

- Hono: IP is derived from `c.req.raw` and headers (`x-forwarded-for`) when available.
- Express: IP comes from `req.ip` (respects `trust proxy` if configured).
- For auditing/rate limiting, rely on `context.req.ip` exposed by the bridge.

## Mounting the Bridge

- Express example:
```
import express from 'express';
import { middleware } from './server/shared';

const app = express();
app.use(express.json());
app.use('/api', middleware);
app.listen(3000, () => console.log('Express on 3000'));
```

- Hono example:
```
import { Hono } from 'hono';
import { middleware } from './server/shared';

const app = new Hono();
app.route('/api', middleware);
export default app; // or createServer/app.listen based on your setup
```

Note: Only run one server on port `3000` at a time.

## Hooks and Context

- Hooks run identically across both runtimes and populate the mutable `context` object passed to your handler.
- Common hooks: `authHook`, `standardRateLimit`, `loggerHook`, caching hooks, and permission gates.
- In handlers, keep the second parameter optional for type compatibility:
```
handler: async (input, context?: { userId: string; role?: 'admin' | 'moderator' | 'user' }) => { ... }
```

## Known Differences and Gotchas

- Streaming responses: prefer JSON responses; streaming support varies and isn’t standardized by the bridge.
- Middleware order: in Express, mount body parsers and CORS before the bridge; in Hono, set up global middleware before `route('/api', ...)`.
- Cookies: handle via runtime-specific middleware/utilities; the bridge does not abstract cookies.
- CORS: configure at the runtime level; the bridge does not inject CORS headers.

## Debugging Tips

- Verify health:
```
curl.exe -sS http://localhost:3000/api/ping
```
- Inspect headers in a hook by logging `context.req.headers`.
- Confirm status handling in Hono if you see type errors: ensure `c.status(...)` is set before `c.json(...)` in the adapter.
- Check IP resolution and proxies if rate limiting behaves unexpectedly.

## When to Choose Which Runtime

- Hono
  - Lightweight, fast, edge-friendly
  - Explicit status typing can catch mistakes during development

- Express
  - Mature ecosystem, broad middleware availability
  - Familiar operational model for many teams

Both runtimes achieve identical behavior through the bridge. Pick the one that aligns with your deployment and operational preferences.