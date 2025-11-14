# Cloudflare Workers Support

auwsomebridge works seamlessly with Cloudflare Workers through Hono, giving you access to all Cloudflare bindings (D1, KV, R2, Durable Objects, etc.) in a type-safe way.

## Quick Start

### 1. Define Your Bindings

Update `server/types/env.ts` with your Cloudflare bindings:

```typescript
export interface EnvBindings {
  // D1 Database
  DB: D1Database;
  
  // KV Namespace
  CACHE: KVNamespace;
  
  // R2 Bucket
  UPLOADS: R2Bucket;
  
  // Environment variables
  API_KEY: string;
  ENVIRONMENT: 'development' | 'staging' | 'production';
}
```

### 2. Access Bindings in Handlers

```typescript
import { defineRoute } from 'auwsomebridge';
import { z } from 'zod';

export const userRoutes = {
  getUser: defineRoute({
    method: 'GET',
    input: z.object({ id: z.string() }),
    handler: async ({ id }, context) => {
      // Type-safe access to Cloudflare bindings
      const db = context?.env?.DB;
      
      if (!db) {
        throw new Error('Database not available');
      }
      
      const result = await db
        .prepare('SELECT * FROM users WHERE id = ?')
        .bind(id)
        .first();
      
      return result;
    },
  }),
};
```

### 3. Configure wrangler.toml

```toml
name = "my-api"
main = "server/app-hono.ts"
compatibility_date = "2024-01-01"

[env.production]
vars = { ENVIRONMENT = "production" }

[[d1_databases]]
binding = "DB"
database_name = "my-database"
database_id = "your-database-id"

[[kv_namespaces]]
binding = "CACHE"
id = "your-kv-id"

[[r2_buckets]]
binding = "UPLOADS"
bucket_name = "my-uploads"
```

### 4. Deploy

```bash
npm install -g wrangler
wrangler deploy
```

## Supported Features

### ✅ Fully Supported

- **HTTP Routes** - All HTTP methods (GET, POST, PUT, PATCH, DELETE)
- **SSE (Server-Sent Events)** - Real-time streaming
- **Hooks** - Authentication, rate limiting, logging, etc.
- **Validation** - Zod input/output validation
- **All Cloudflare Bindings**:
  - D1 (SQL database)
  - KV (Key-Value store)
  - R2 (Object storage)
  - Queues
  - Service bindings
  - Environment variables

### ⚠️ Limited Support

- **WebSockets** - Not supported in standard Workers
  - Use **Durable Objects** for WebSocket support
  - See [Durable Objects WebSockets](#durable-objects-websockets) below

## Using Cloudflare Bindings

### D1 Database

```typescript
handler: async (input, context) => {
  const db = context?.env?.DB;
  
  // Query
  const users = await db.prepare('SELECT * FROM users').all();
  
  // Insert
  await db.prepare('INSERT INTO users (name, email) VALUES (?, ?)')
    .bind(input.name, input.email)
    .run();
  
  return users;
}
```

### KV Namespace

```typescript
handler: async (input, context) => {
  const kv = context?.env?.CACHE;
  
  // Get
  const cached = await kv.get('user:123');
  
  // Set with expiration
  await kv.put('user:123', JSON.stringify(user), {
    expirationTtl: 3600, // 1 hour
  });
  
  // Delete
  await kv.delete('user:123');
  
  return { cached };
}
```

### R2 Bucket

```typescript
handler: async (input, context) => {
  const bucket = context?.env?.UPLOADS;
  
  // Upload
  await bucket.put('file.txt', 'Hello World', {
    httpMetadata: {
      contentType: 'text/plain',
    },
  });
  
  // Download
  const object = await bucket.get('file.txt');
  const text = await object?.text();
  
  // List
  const list = await bucket.list({ prefix: 'images/' });
  
  return { text, files: list.objects };
}
```

### Environment Variables

```typescript
handler: async (input, context) => {
  const apiKey = context?.env?.API_KEY;
  const environment = context?.env?.ENVIRONMENT;
  
  if (environment === 'production') {
    // Production-specific logic
  }
  
  return { environment };
}
```

## Durable Objects WebSockets

For WebSocket support on Cloudflare Workers, use Durable Objects:

### 1. Create a Durable Object

```typescript
// server/durable-objects/ChatRoom.ts
export class ChatRoom {
  state: DurableObjectState;
  sessions: Set<WebSocket>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.sessions = new Set();
  }

  async fetch(request: Request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.handleSession(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  handleSession(webSocket: WebSocket) {
    webSocket.accept();
    this.sessions.add(webSocket);

    webSocket.addEventListener('message', (event) => {
      // Broadcast to all sessions
      this.sessions.forEach((session) => {
        session.send(event.data);
      });
    });

    webSocket.addEventListener('close', () => {
      this.sessions.delete(webSocket);
    });
  }
}
```

### 2. Configure in wrangler.toml

```toml
[[durable_objects.bindings]]
name = "CHAT_ROOM"
class_name = "ChatRoom"
script_name = "my-api"

[[migrations]]
tag = "v1"
new_classes = ["ChatRoom"]
```

### 3. Use in Routes

```typescript
handler: async (input, context) => {
  const durableObject = context?.env?.CHAT_ROOM;
  const id = durableObject.idFromName('room-123');
  const stub = durableObject.get(id);
  
  // Forward WebSocket upgrade to Durable Object
  return stub.fetch(request);
}
```

## Development vs Production

### Local Development

Use Bun or Express for local development with full WebSocket support:

```bash
# Bun (recommended for speed)
bun run server:hono

# Express
npm run server:express
```

### Production

Deploy to Cloudflare Workers:

```bash
wrangler deploy
```

## Best Practices

### 1. Type Your Bindings

Always define your bindings in `EnvBindings` for type safety:

```typescript
export interface EnvBindings {
  DB: D1Database;
  CACHE: KVNamespace;
  // Add all your bindings
}
```

### 2. Check Binding Availability

Always check if bindings exist (for local dev compatibility):

```typescript
const db = context?.env?.DB;
if (!db) {
  throw new Error('Database not configured');
}
```

### 3. Use Hooks for Common Operations

Create hooks for common Cloudflare operations:

```typescript
const cacheHook = defineHook({
  name: 'cache',
  before: async (ctx) => {
    const kv = ctx.context.env?.CACHE;
    if (!kv) return { next: true };
    
    const cached = await kv.get(ctx.route);
    if (cached) {
      return { next: true, response: JSON.parse(cached) };
    }
    
    return { next: true };
  },
  after: async (ctx) => {
    const kv = ctx.context.env?.CACHE;
    if (!kv) return { next: true };
    
    await kv.put(ctx.route, JSON.stringify(ctx.response), {
      expirationTtl: 3600,
    });
    
    return { next: true };
  },
});
```

### 4. Handle Errors Gracefully

```typescript
handler: async (input, context) => {
  try {
    const db = context?.env?.DB;
    if (!db) {
      return { error: 'Database not available' };
    }
    
    const result = await db.prepare('SELECT * FROM users').all();
    return result;
  } catch (error) {
    console.error('Database error:', error);
    throw new Error('Failed to fetch users');
  }
}
```

## Limitations

1. **No Traditional WebSockets** - Use Durable Objects instead
2. **CPU Time Limits** - 50ms for free tier, 30s for paid
3. **Memory Limits** - 128MB per request
4. **Request Size** - 100MB max

## Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [D1 Database](https://developers.cloudflare.com/d1/)
- [KV Storage](https://developers.cloudflare.com/kv/)
- [R2 Storage](https://developers.cloudflare.com/r2/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Hono on Cloudflare](https://hono.dev/getting-started/cloudflare-workers)
