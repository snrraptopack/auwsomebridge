# Tutorial 17: SSE with Hooks

Hooks work with SSE routes just like regular routes. You can use them for authentication, logging, and more.

## Basic Hook Usage

Add hooks to SSE routes the same way:

```typescript
import { defineRoute, defineHook } from './server/core/bridge';
import { z } from 'zod';

const authHook = defineHook({
  name: 'auth',
  before: async (ctx) => {
    const token = ctx.req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return { next: false, status: 401, error: 'Unauthorized' };
    }
    
    // Validate token and populate context
    const user = await validateToken(token);
    ctx.context.userId = user.id;
    
    return { next: true };
  }
});

const routes = {
  notifications: defineRoute({
    kind: 'sse',
    hooks: [authHook],  // ← Hook runs before stream starts
    handler: async function* (_, context) {
      // context.userId is available from authHook
      while (true) {
        const notification = await getNextNotification(context.userId);
        yield notification;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  })
};
```

## Hook Execution Flow for SSE

```
Client connects
    ↓
Before hooks run
    ↓
[Hook blocks?] → Yes → Connection rejected
    ↓ No
Stream starts (handler runs)
    ↓
Events sent via yield
    ↓
Stream ends or client disconnects
    ↓
Cleanup hooks run
```

## Before Hooks: Run Before Stream Starts

Before hooks execute **before** the SSE stream begins:

```typescript
const rateLimitHook = defineHook({
  name: 'rateLimit',
  before: async (ctx) => {
    const allowed = await checkRateLimit(ctx.req.ip);
    
    if (!allowed) {
      return {
        next: false,
        status: 429,
        error: 'Too many connections'
      };
    }
    
    return { next: true };
  }
});

const routes = {
  liveData: defineRoute({
    kind: 'sse',
    hooks: [rateLimitHook],
    handler: async function* () {
      // Only reaches here if rate limit passed
      while (true) {
        yield { data: Math.random() };
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  })
};
```

If a before hook returns `{ next: false }`, the connection is rejected and the stream never starts.

## After Hooks: Don't Run for SSE

**Important:** After hooks do NOT run for SSE routes because:
- SSE streams multiple events over time
- There's no single "response" to modify
- The stream can run indefinitely

```typescript
const afterHook = defineHook({
  name: 'after',
  after: (ctx) => {
    // ❌ This will NOT run for SSE routes
    return { next: true };
  }
});
```

Only `before` and `cleanup` hooks work with SSE.

## Cleanup Hooks: Run When Stream Ends

Cleanup hooks run when the stream ends (for any reason):

```typescript
const metricsHook = defineHook({
  name: 'metrics',
  before: (ctx) => {
    ctx.context.startTime = Date.now();
    ctx.context.eventCount = 0;
    return { next: true };
  },
  cleanup: (ctx) => {
    const duration = Date.now() - ctx.context.startTime;
    
    console.log(`SSE stream ended:`, {
      route: ctx.route,
      duration: `${duration}ms`,
      events: ctx.context.eventCount,
      success: ctx.success
    });
    
    return { next: true };
  }
});

const routes = {
  updates: defineRoute({
    kind: 'sse',
    hooks: [metricsHook],
    handler: async function* (_, context) {
      for (let i = 0; i < 10; i++) {
        yield { update: i };
        context.eventCount++;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  })
};
```

Cleanup hooks run when:
- Stream completes normally
- Client disconnects
- An error occurs
- Server stops

## Example: Authenticated Live Feed

```typescript
const authHook = defineHook({
  name: 'auth',
  before: async (ctx) => {
    const token = ctx.req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return { next: false, status: 401, error: 'Unauthorized' };
    }
    
    const user = await validateToken(token);
    ctx.context.userId = user.id;
    ctx.context.username = user.username;
    
    return { next: true };
  }
});

const loggerHook = defineHook({
  name: 'logger',
  before: (ctx) => {
    console.log(`[SSE] ${ctx.context.username} connected to ${ctx.route}`);
    return { next: true };
  },
  cleanup: (ctx) => {
    console.log(`[SSE] ${ctx.context.username} disconnected from ${ctx.route}`);
    return { next: true };
  }
});

const routes = {
  liveFeed: defineRoute({
    kind: 'sse',
    hooks: [authHook, loggerHook],
    input: z.object({
      topic: z.string()
    }),
    handler: async function* ({ topic }, context) {
      console.log(`Streaming ${topic} to user ${context.userId}`);
      
      while (true) {
        const event = await getNextEvent(topic, context.userId);
        yield event;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  })
};

// Client
const es = new EventSource('/api/liveFeed?topic=news', {
  headers: {
    'Authorization': 'Bearer your-token-here'
  }
});
```

## Example: Connection Tracking

Track active SSE connections:

```typescript
const connectionTracker = defineHook({
  name: 'connectionTracker',
  setup: () => {
    const activeConnections = new Set<string>();
    return { activeConnections };
  },
  before: (ctx, state) => {
    const connectionId = `${ctx.route}:${ctx.req.ip}:${Date.now()}`;
    ctx.context.connectionId = connectionId;
    state.activeConnections.add(connectionId);
    
    console.log(`Active SSE connections: ${state.activeConnections.size}`);
    return { next: true };
  },
  cleanup: (ctx, state) => {
    state.activeConnections.delete(ctx.context.connectionId);
    console.log(`Active SSE connections: ${state.activeConnections.size}`);
    return { next: true };
  }
});

const routes = {
  stream: defineRoute({
    kind: 'sse',
    hooks: [connectionTracker],
    handler: async function* () {
      while (true) {
        yield { data: Date.now() };
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  })
};
```

## Global Hooks with SSE

Global hooks work with SSE routes too:

```typescript
setupBridge(routes, {
  hooks: [authHook, loggerHook]  // Applied to all routes, including SSE
});
```

## Key Points

1. **Before hooks run before stream starts** - can block connection
2. **After hooks DON'T run for SSE** - no single response to modify
3. **Cleanup hooks run when stream ends** - always execute
4. **Use context to share data** between hooks and handler
5. **Global hooks work with SSE** routes

## What's Next?

Now let's learn about error handling in SSE routes!

---

**Next:** [18-sse-error-handling.md](./18-sse-error-handling.md)
