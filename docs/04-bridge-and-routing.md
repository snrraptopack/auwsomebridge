# Bridge and Routing

This document explains how routes are defined, composed, and exposed via the bridge. It covers path mapping, input/output validation, global options, and practical examples.

## Core Concepts

- Single source of truth: define routes once; both Express and Hono runtimes use the same definitions.
- Bridge mounts routes under a `prefix` (default `/api`) and resolves endpoints as `/api/<routeName>`.
- Hooks and validation run uniformly, producing consistent success/error response shapes.

## Defining Routes

Use `defineRoute` to declare a route with method, schemas, hooks, and handler.

Example: GET with query validation

```
import { z } from 'zod';
import { defineRoute } from '../core/bridge';

export const healthRoutes = {
  ping: defineRoute({
    method: 'GET',
    input: z.object({ verbose: z.boolean().optional() }),
    output: z.object({ ok: z.boolean() }),
    description: 'Health check',
    tags: ['system'],
    handler: async ({ verbose }) => ({ ok: true }),
  }),
};
```

Example: POST with JSON body validation

```
import { z } from 'zod';
import { defineRoute } from '../core/bridge';
import { authHook } from '../hooks';

export const userRoutes = {
  createUser: defineRoute({
    method: 'POST',
    input: z.object({ name: z.string().min(1), email: z.string().email() }),
    output: z.object({ id: z.string(), name: z.string(), email: z.string().email() }),
    hooks: [authHook],
    description: 'Create a new user',
    tags: ['users'],
    handler: async ({ name, email }, context?: { userId: string; role?: 'admin' | 'moderator' | 'user' }) => ({
      id: crypto.randomUUID(),
      name,
      email,
    }),
  }),
};
```

## Composing Routes

Group multiple route objects together and pass them into the bridge.

```
import { composeRoutes, setupBridge } from './core/bridge';
import { healthRoutes } from './routes/health';
import { userRoutes } from './routes/user';
import { standardRateLimit, loggerHook } from './hooks';

const routes = composeRoutes(healthRoutes, userRoutes);

export const { $api, middleware, metadata } = setupBridge(routes, {
  prefix: '/api',
  validateResponses: true,
  hooks: [standardRateLimit, loggerHook],
});
```

- `composeRoutes(...)`: merges route maps; route names must be unique across maps.
- `setupBridge(...)`: configures global hooks, response validation, and the URL prefix.

## Path Mapping

- Route names map directly to endpoints: `ping` → `/api/ping`, `createUser` → `/api/createUser`.
- Query parameters are inferred from `input` for `GET`/`DELETE` methods.
- Request bodies are expected for `POST`/`PUT`/`PATCH` when `input` defines object fields.

Examples:

- GET with query:
```
curl.exe -sS "http://localhost:3000/api/getUserById?id=8b5d5df6-4f9a-4f4f-8d2e-bf6c27f7c111"
```

- POST with JSON body:
```
curl.exe -sS -H "Content-Type: application/json" -d "{\"name\":\"Jane\",\"email\":\"jane@example.com\"}" http://localhost:3000/api/createUser
```

## Validation

- Input validation: the bridge parses query/body and validates against `input` (Zod). Invalid input yields a standardized `400` error.
- Output validation (optional): if `validateResponses` is `true`, handler results are validated against `output`. Failures yield `500` with details.

## Hooks

- Per-route hooks via `hooks: [...]` and global hooks via `setupBridge(..., { hooks: [...] })`.
- Common patterns:
  - Authentication: `authHook` adds `context.userId` and `context.role`.
  - Rate limiting: `standardRateLimit` uses `context.req.ip` to throttle.
  - Logging: `loggerHook` records timings and request metadata.
  - Caching: cache hooks can early-return responses.
  - Permissions: guards that check `context.role`.

Handler `context` parameter is optional for type compatibility:
```
handler: async (input, context?: { userId: string; role?: 'admin' | 'moderator' | 'user' }) => { ... }
```

## Global Config Options

- `prefix`: URL prefix for the bridge (default `/api`).
- `hooks`: array of hooks applied globally (run before route hooks).
- `validateResponses`: boolean to enable output validation.
- `logRequests`: optional flag used by logging hooks.

## Error Model

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
  "code": "INTERNAL_ERROR|BAD_REQUEST|UNAUTHORIZED|FORBIDDEN|NOT_FOUND|RATE_LIMITED|...",
  "details": { ...? },
  "timestamp": 1712345678901
}
```

## Best Practices

- Keep route names descriptive and stable; they form your public endpoints.
- Use Zod schemas for robust input/output contracts.
- Prefer hook-based cross-cutting concerns rather than in-handler logic.
- Narrow `context` inside handlers and add guards if a field is required (e.g., `userId`).
- Keep `context` typing light and optional to align with the base handler type.

## Next

- Continue with `docs/06-hooks.md` and `docs/07-context.md` for deeper hook and context patterns.
- See `docs/10-routes-reference.md` for a catalog of available endpoints.