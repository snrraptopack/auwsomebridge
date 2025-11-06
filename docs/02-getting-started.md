# Getting Started

This guide walks you through installing dependencies, running the API on Express or Hono, calling routes, and adding your own routes with validation and hooks.

## Prerequisites

- Node.js and Bun installed
- Port `3000` available (only run one server at a time)

## Install

- Install dependencies:

```
bun install
```

- Recommended: verify TypeScript builds cleanly (if you have a build step):

```
bun run build
```

## Choose Your Runtime

You can run either Express or Hono. Both mount the bridge at `/api/:route` and produce identical response shapes.

- Run Hono:

```
bun run server:hono
```

- Run Express (if a script exists):

```
bun run server:express
```

Notes:
- Both servers use `http://localhost:3000`. If one is already running, the other will fail with `EADDRINUSE`.
- Stop any existing process before switching runtimes.

## Smoke Test: Health Route

Call the health check to confirm the server is up.

- Using curl on Windows:

```
curl.exe -sS http://localhost:3000/api/ping
```

Expected response:

```
{
  "status": "success",
  "data": { "ok": true },
  "timestamp": 1712345678901
}
```

## Route Basics

Routes live under `server/routes/`. Here’s the `getUserById` route pattern:

```
import { z } from 'zod';
import { defineRoute } from '../core/bridge';
import { authHook } from '../hooks';

export const userRoutes = {
  getUserById: defineRoute({
    method: 'GET',
    input: z.object({ id: z.string().uuid() }),
    output: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string().email(),
    }),
    hooks: [authHook],
    description: 'Fetch a user by ID',
    tags: ['users'],
    handler: async ({ id }, context?: { userId: string; role?: 'admin' | 'moderator' | 'user' }) => ({
      id,
      name: 'John Doe',
      email: 'john@example.com',
    }),
  }),
};
```

Key points:
- `input`: Zod schema validates request data; invalid input returns `400` automatically.
- `output`: Optional Zod schema validates handler result (if enabled in config). Invalid output returns `500`.
- `hooks`: Composable functions for auth, rate limiting, logging, caching, and permissions.
- `handler(input, context?)`: Handlers receive parsed `input` and a hook-populated `context`. The context parameter is optional for type compatibility.

## API Setup

All routes are composed and the bridge is configured in `server/shared.ts`:

```
import { composeRoutes, setupBridge } from './core/bridge';
import { userRoutes } from './routes/user';
import { healthRoutes } from './routes/health';
import { standardRateLimit, loggerHook } from './hooks';

const allRoutes = composeRoutes(userRoutes, healthRoutes);

export const { $api, middleware, metadata } = setupBridge(allRoutes, {
  prefix: '/api',
  validateResponses: true,
  logRequests: false,
  hooks: [standardRateLimit, loggerHook],
});
```

- `middleware`: framework-agnostic bridge middleware mounted at `/api/:route` in both runtimes.
- `$api`: client-friendly interface derived from routes (optional use).
- `metadata`: route metadata for docs or introspection.

## Calling Routes

- Health:
```
curl.exe -sS http://localhost:3000/api/ping
```

- Get user by ID:
```
curl.exe -sS "http://localhost:3000/api/getUserById?id=8b5d5df6-4f9a-4f4f-8d2e-bf6c27f7c111"
```

- Create user:
```
curl.exe -sS -H "Content-Type: application/json" -d "{\"name\":\"Jane\",\"email\":\"jane@example.com\"}" http://localhost:3000/api/createUser
```

## Hook System in Practice

- Add a hook globally in `server/shared.ts` or per-route in the route definition.
- Common hooks:
  - `authHook`: validates Authorization, adds `context.userId` and `context.role`.
  - `standardRateLimit`: throttles requests per IP.
  - `loggerHook` / `detailedLoggerHook`: logs request details and timings.
  - `createCacheHook`: early-return cached responses.
  - `requireAdmin`/`requireUser`: permission checks based on role.

## Context Typing Tips

- Prefer typing the handler parameter directly:
```
handler: async (input, context?: { userId: string; role?: 'admin' | 'moderator' | 'user' }) => { ... }
```

- Or set the third generic parameter on `defineRoute<I, O, C>` while keeping the handler’s second param optional.

## Response Shape Guarantees

- Success:
```
{
  "status": "success",
  "data": { ... },
  "timestamp": 1712345678901
}
```

- Error:
```
{
  "status": "error",
  "error": "Human readable message",
  "code": "INTERNAL_ERROR|...",
  "details": { ...? },
  "timestamp": 1712345678901
}
```

## Troubleshooting

- Port in use (`EADDRINUSE`): stop the running server on `3000` before starting another.
- Hono status typing errors: the adapter converts numeric statuses to `StatusCode` and uses `c.status(...)` before `c.json(...)`.
- Header normalization: Hono uses `c.req.raw.headers.forEach(...)` to avoid runtime errors.
- Context mismatch errors: keep the handler’s `context` parameter optional.

## Next Steps

- Explore `docs/03-runtime-adapters.md` for Express vs Hono details.
- Read `docs/06-hooks.md` and `docs/07-context.md` to design your cross-cutting concerns.
- Use `docs/10-routes-reference.md` as a catalog with example requests and responses.