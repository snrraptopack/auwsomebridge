# Tutorial 23: WebSocket with Hooks

Hooks work with WebSocket routes just like regular routes. Use them for authentication, logging, rate limiting, and more.

## Basic Hook Usage

Add hooks to WebSocket routes the same way:

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
    ctx.context.username = user.username;
    
    return { next: true };
  }
});

const routes = {
  chat: defineRoute({
    kind: 'ws',
    hooks: [authHook],  // ← Hook runs before connection opens
    handler: {
      onOpen: async (connection) => {
        // connection.context.userId is available from authHook
        console.log(`User ${connection.context.username} connected`);
        
        connection.send({
          type: 'welcome',
          message: `Welcome, ${connection.context.username}!`
        });
      },
      onMessage: async (message, connection) => {
        // context.userId available here too
        console.log(`Message from ${connection.context.username}:`, message);
      }
    }
  })
};
```

## Hook Execution Flow for WebSocket

```
Client connects
    ↓
Before hooks run
    ↓
[Hook blocks?] → Yes → Connection rejected
    ↓ No
Connection opens (onOpen runs)
    ↓
Messages exchanged (onMessage runs)
    ↓
Connection closes (onClose runs)
    ↓
Cleanup hooks run
```

## Before Hooks: Run Before Connection Opens

Before hooks execute **before** the WebSocket connection is established:

```typescript
const rateLimitHook = defineHook({
  name: 'rateLimit',
  before: async (ctx) => {
    const allowed = await checkConnectionLimit(ctx.req.ip);
    
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
  chat: defineRoute({
    kind: 'ws',
    hooks: [rateLimitHook],
    handler: {
      onMessage: async (message, connection) => {
        // Only reaches here if rate limit passed
        connection.send({ echo: message });
      }
    }
  })
};
```

If a before hook returns `{ next: false }`, the connection is rejected and never opens.

## After Hooks: Don't Run for WebSocket

**Important:** After hooks do NOT run for WebSocket routes because:
- WebSocket connections are long-lived
- There's no single "response" to modify
- Messages flow continuously in both directions

```typescript
const afterHook = defineHook({
  name: 'after',
  after: (ctx) => {
    // ❌ This will NOT run for WebSocket routes
    return { next: true };
  }
});
```

Only `before` and `cleanup` hooks work with WebSocket.

## Cleanup Hooks: Run When Connection Closes

Cleanup hooks run when the connection closes (for any reason):

```typescript
const connectionLoggerHook = defineHook({
  name: 'connectionLogger',
  before: (ctx) => {
    ctx.context.connectedAt = Date.now();
    ctx.context.messageCount = 0;
    console.log(`[WS] ${ctx.context.username} connecting...`);
    return { next: true };
  },
  cleanup: (ctx) => {
    const duration = Date.now() - ctx.context.connectedAt;
    
    console.log(`[WS] ${ctx.context.username} disconnected`, {
      duration: `${duration}ms`,
      messages: ctx.context.messageCount,
      success: ctx.success
    });
    
    return { next: true };
  }
});

const routes = {
  chat: defineRoute({
    kind: 'ws',
    hooks: [authHook, connectionLoggerHook],
    handler: {
      onMessage: async (message, connection) => {
        connection.context.messageCount++;
        connection.send({ echo: message });
      }
    }
  })
};
```

Cleanup hooks run when:
- Client disconnects
- Server closes connection
- An error occurs
- Server stops

## Example: Authenticated Chat Room

```typescript
// hooks/auth.ts
const authHook = defineHook({
  name: 'auth',
  before: async (ctx) => {
    const token = ctx.req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return { next: false, status: 401, error: 'Authentication required' };
    }
    
    try {
      const user = await validateToken(token);
      ctx.context.userId = user.id;
      ctx.context.username = user.username;
      return { next: true };
    } catch (error) {
      return { next: false, status: 401, error: 'Invalid token' };
    }
  }
});

// hooks/roomAccess.ts
const roomAccessHook = defineHook({
  name: 'roomAccess',
  before: async (ctx) => {
    const roomId = ctx.input.roomId;
    const userId = ctx.context.userId;
    
    const hasAccess = await checkRoomAccess(userId, roomId);
    
    if (!hasAccess) {
      return {
        next: false,
        status: 403,
        error: 'You do not have access to this room'
      };
    }
    
    ctx.context.roomId = roomId;
    return { next: true };
  }
});

// hooks/logger.ts
const chatLoggerHook = defineHook({
  name: 'chatLogger',
  before: (ctx) => {
    console.log(`📨 ${ctx.context.username} joining room ${ctx.context.roomId}`);
    ctx.context.joinedAt = Date.now();
    return { next: true };
  },
  cleanup: (ctx) => {
    const duration = Date.now() - ctx.context.joinedAt;
    console.log(`📨 ${ctx.context.username} left room ${ctx.context.roomId} after ${duration}ms`);
    return { next: true };
  }
});

// routes/chat.ts
const routes = {
  chatRoom: defineRoute({
    kind: 'ws',
    input: z.object({
      roomId: z.string()
    }),
    hooks: [
      authHook,           // 1. Authenticate user
      roomAccessHook,     // 2. Check room access
      chatLoggerHook      // 3. Log activity
    ],
    handler: {
      onOpen: async (connection) => {
        // All hooks passed, user is authenticated and has access
        connection.send({
          type: 'joined',
          roomId: connection.context.roomId,
          message: `Welcome to room ${connection.context.roomId}, ${connection.context.username}!`
        });
      },
      
      onMessage: async (message, connection) => {
        // Broadcast message to room
        await broadcastToRoom(connection.context.roomId, {
          type: 'message',
          from: connection.context.username,
          text: message.text,
          timestamp: Date.now()
        });
      },
      
      onClose: async 
(connection, code, reason) => {
        console.log(`${connection.context.username} left room ${connection.context.roomId}`);
      }
    }
  })
};

// Client
const ws = new WebSocket(
  'ws://localhost:3000/api/chatRoom?roomId=general',
  {
    headers: {
      'Authorization': 'Bearer your-token-here'
    }
  }
);
```

## Connection Tracking Hook

Track all active WebSocket connections:

```typescript
const connectionTrackerHook = defineHook({
  name: 'connectionTracker',
  setup: () => {
    const connections = new Map<string, { userId: string; connectedAt: number }>();
    return { connections };
  },
  before: (ctx, state) => {
    const connectionId = crypto.randomUUID();
    ctx.context.connectionId = connectionId;
    
    state.connections.set(connectionId, {
      userId: ctx.context.userId,
      connectedAt: Date.now()
    });
    
    console.log(`Active WebSocket connections: ${state.connections.size}`);
    return { next: true };
  },
  cleanup: (ctx, state) => {
    state.connections.delete(ctx.context.connectionId);
    console.log(`Active WebSocket connections: ${state.connections.size}`);
    return { next: true };
  }
});
```

## Global Hooks with WebSocket

Global hooks work with WebSocket routes too:

```typescript
setupBridge(routes, {
  hooks: [authHook, connectionLoggerHook]  // Applied to all routes, including WebSocket
});
```

## Accessing Context in Handler

Context populated by hooks is available throughout the handler:

```typescript
const routes = {
  chat: defineRoute({
    kind: 'ws',
    hooks: [authHook],  // Populates ctx.context.userId and ctx.context.username
    handler: {
      onOpen: async (connection) => {
        // Available in onOpen
        console.log(`${connection.context.username} connected`);
      },
      
      onMessage: async (message, connection) => {
        // Available in onMessage
        console.log(`Message from ${connection.context.username}`);
      },
      
      onClose: async (connection, code, reason) => {
        // Available in onClose
        console.log(`${connection.context.username} disconnected`);
      },
      
      onError: async (connection, error) => {
        // Available in onError
        console.error(`Error for ${connection.context.username}:`, error);
      }
    }
  })
};
```

## Key Points

1. **Before hooks run before connection opens** - can block connection
2. **After hooks DON'T run for WebSocket** - no single response to modify
3. **Cleanup hooks run when connection closes** - always execute
4. **Use context to share data** between hooks and handler
5. **Global hooks work with WebSocket** routes
6. **Context available in all handler methods** - onOpen, onMessage, onClose, onError

## What's Next?

Now let's build a practical WebSocket example with a real-time chat application!

---

**Next:** [24-websocket-practical-example.md](./24-websocket-practical-example.md)
