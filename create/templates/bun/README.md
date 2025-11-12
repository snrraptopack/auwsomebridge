# Auwsomebridge Bun Template

A minimal starter template for building type-safe APIs with **Bun** and **auwsomebridge**.

## Features

- ✅ **Bun Native**: Uses Bun's built-in HTTP server (zero dependencies!)
- ✅ **Type-Safe**: Full TypeScript support with Zod validation
- ✅ **Fast**: Bun's native performance
- ✅ **Hooks**: Lifecycle hooks for auth, logging, metrics, etc.
- ✅ **Auto-Complete**: Type-safe client API generation

## Getting Started

### 1. Install Dependencies

```bash
bun install
```

### 2. Start the Server

```bash
bun run server
# or with auto-reload
bun run dev
```

Your API will be running at `http://localhost:3000`

## Project Structure

```
server/
├── app-bun.ts       # Bun server entry point
└── routes/
    └── user.ts      # Example routes
```

## Example Usage

### Define Routes

```typescript
// server/routes/user.ts
import { z } from 'zod';
import { defineRoute } from 'auwsomebridge';

export const userRoutes = {
  getUser: defineRoute({
    method: 'GET',
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string(), name: z.string() }),
    handler: async ({ id }) => ({ id, name: 'Jane' }),
  }),
};
```

### Setup Server

```typescript
// server/app-bun.ts
import { composeRoutes, setupBridge } from 'auwsomebridge';
import { userRoutes } from './routes/user';

const routes = composeRoutes(userRoutes);
const { middleware } = setupBridge(routes, {
  runtime: 'bun',
  prefix: '/api',
});

Bun.serve({
  port: 3000,
  fetch: middleware,
});
```

### Test the API

```bash
# GET request
curl http://localhost:3000/api/getUser?id=123

# POST request
curl -X POST http://localhost:3000/api/createUser \
  -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@example.com"}'
```

## Adding Hooks

```typescript
import { defineHook } from 'auwsomebridge';

const loggerHook = defineHook({
  name: 'logger',
  before: (ctx) => {
    console.log(`[${ctx.method}] ${ctx.route}`);
    return { next: true };
  },
});

const { middleware } = setupBridge(routes, {
  runtime: 'bun',
  hooks: [loggerHook], // Global hooks
});
```

## Type-Safe Client

Generate a type-safe client for your frontend:

```typescript
import { setupBridge } from 'auwsomebridge';
import { routes } from './server/routes';

const { $api } = setupBridge(routes, {
  baseUrl: '/api',
});

// Fully typed!
const user = await $api.getUser({ id: '123' });
```

## Learn More

- [Auwsomebridge Documentation](https://github.com/snrraptopack/auwsomebridge)
- [Bun Documentation](https://bun.sh/docs)
- [Zod Documentation](https://zod.dev)
