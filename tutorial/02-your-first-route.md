# Tutorial 02: Your First Route

Let's create your first API route and see it working!

## What We'll Build

A simple "Hello" endpoint that responds with a greeting.

## Step 1: Create a Route File

Create a file for your routes:

```typescript
// routes.ts
import { defineRoute } from 'auwsomebridge';

export const myRoutes = {
  hello: defineRoute({
    method: 'GET',
    handler: async () => {
      return { message: 'Hello, World!' };
    }
  })
};
```

That's it! You've defined your first route.

## Step 2: Setup the Server

Now connect your route to a server. Choose your runtime:

### Option A: Bun

```typescript
// server.ts
import { setupBridge } from 'auwsomebridge';
import { myRoutes } from './routes';

const { fetch, websocket } = setupBridge(myRoutes, {
  runtime: 'bun',
  prefix: '/api'
});

Bun.serve({
  port: 3000,
  fetch,
  websocket
});

console.log('Server running at http://localhost:3000');
```

### Option B: Hono

```typescript
// server.ts
import { Hono } from 'hono';
import { setupBridge } from 'auwsomebridge';
import { myRoutes } from './routes';

const app = new Hono();

const { middleware } = setupBridge(myRoutes, {
  runtime: 'hono',
  prefix: '/api'
});

app.use('/api/:route', middleware);

export default app;
```

### Option C: Express

```typescript
// server.ts
import express from 'express';
import { setupBridge } from 'auwsomebridge';
import { myRoutes } from './routes';

const app = express();
app.use(express.json());

const { middleware } = setupBridge(myRoutes, {
  runtime: 'express',
  prefix: '/api'
});

app.use('/api/:route', middleware);

app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
```

## Step 3: Run It

Depending on your runtime:

```bash
# Bun
bun run server.ts

# Hono (with Node)
node server.ts

# Express
node server.ts
```

## Step 4: Test It

Open your browser or use curl:

```bash
curl http://localhost:3000/api/hello
```

You'll get:

```json
{
  "status": "success",
  "data": {
    "message": "Hello, World!"
  },
  "timestamp": 1234567890
}
```

## What Just Happened?

1. **defineRoute** - Created a route definition
2. **setupBridge** - Connected the route to your chosen runtime
3. **Server started** - Using your runtime's native API
4. **Automatic response wrapping** - Your data was wrapped in a standard format

## Key Differences Between Runtimes

- **Bun**: Returns `{ fetch, websocket }` - use with `Bun.serve()`
- **Hono**: Returns `{ middleware }` - use with `app.use()`
- **Express**: Returns `{ middleware }` - use with `app.use()`

The route definition stays the same - only the server setup changes!

## The Response Format

Notice your response was automatically wrapped:

```json
{
  "status": "success",     // Always "success" or "error"
  "data": { ... },         // Your handler's return value
  "timestamp": 1234567890  // When the response was created
}
```

This happens automatically for all routes!

## What's Next?

Now that you have a working route, let's understand what `defineRoute` can do.

---

**Next:** [03-understanding-routes.md](./03-understanding-routes.md)
