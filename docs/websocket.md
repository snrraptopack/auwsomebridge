# WebSocket Support

## Overview

auwsomebridge provides full WebSocket support that works identically across Express, Hono, and Bun. Define WebSocket routes once and run them on any runtime without changing your handler code.

## Quick Start

### Define a WebSocket Route

```typescript
import { defineRoute } from 'auwsomebridge';
import { z } from 'zod';

export const chatRoutes = {
  chatRoom: defineRoute({
    method: 'GET',
    kind: 'ws', // Mark as WebSocket route
    input: z.object({
      message: z.string().min(1).max(500),
    }),
    hooks: [authHook], // Optional: add authentication
    handler: {
      onOpen: async (connection) => {
        console.log(`User ${connection.context.userId} connected`);
        connection.send({ type: 'welcome', message: 'Welcome to chat!' });
      },
      onMessage: async (message, connection) => {
        console.log(`Received:`, message);
        // Echo back
        connection.send({ type: 'echo', data: message });
      },
      onClose: async (connection, code, reason) => {
        console.log(`User disconnected: ${code} ${reason}`);
      },
      onError: async (connection, error) => {
        console.error('WebSocket error:', error);
      },
    },
  }),
};
```

### Server Setup

#### Bun

```typescript
import { setupBridge, composeRoutes } from 'auwsomebridge';
import { chatRoutes } from './routes/chat';

const routes = composeRoutes(chatRoutes);
const { fetch, websocket } = setupBridge(routes, {
  runtime: 'bun',
  prefix: '/api',
});

Bun.serve({
  port: 3000,
  fetch,
  websocket, // Pass WebSocket handler
});
```

#### Hono

```typescript
import { Hono } from 'hono';
import { setupBridge, composeRoutes } from 'auwsomebridge';
import { chatRoutes } from './routes/chat';

const app = new Hono();
const routes = composeRoutes(chatRoutes);
const { middleware } = setupBridge(routes, {
  runtime: 'hono',
  prefix: '/api',
});

app.use('/api/:route', middleware);

export default app;
```

#### Express

```typescript
import express from 'express';
import { setupBridge, composeRoutes } from 'auwsomebridge';
import { createExpressWebSocketServer } from 'auwsomebridge/express';
import { chatRoutes } from './routes/chat';

const app = express();
const routes = composeRoutes(chatRoutes);
const routesMap = new Map(Object.entries(routes));

const { middleware } = setupBridge(routes, {
  runtime: 'express',
  prefix: '/api',
});

app.use('/api/:route', middleware);

const server = app.listen(3000);

// Setup WebSocket server
const wss = createExpressWebSocketServer(routesMap, {
  prefix: '/api',
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});
```

### Client Usage

```typescript
import { $ws } from './server/client-$api';

// Connect to WebSocket
const connection = $ws.chatRoom(
  { roomId: '123' }, // Query parameters (optional)
  {
    onOpen: () => console.log('Connected'),
    onMessage: (data) => console.log('Received:', data),
    onClose: (code, reason) => console.log('Disconnected:', code, reason),
    onError: (error) => console.error('Error:', error),
  }
);

// Send a message
connection.send({ message: 'Hello, world!' });

// Close connection
connection.close();
```

## Handler Lifecycle

WebSocket handlers define four lifecycle methods:

### onOpen (optional)

Called when the connection is established, after hooks have executed.

```typescript
onOpen: async (connection) => {
  // Send initial data
  connection.send({ type: 'welcome', userId: connection.context.userId });
  
  // Subscribe to topics (Bun only)
  const ws = connection.raw as ServerWebSocket;
  ws.subscribe('notifications');
}
```

### onMessage (required)

Called when a message is received. Messages are validated against the route's `input` schema.

```typescript
onMessage: async (message, connection) => {
  // message is already validated
  console.log('User sent:', message.text);
  
  // Send response
  connection.send({ type: 'ack', messageId: message.id });
}
```

### onClose (optional)

Called when the connection closes. Cleanup hooks execute after this.

```typescript
onClose: async (connection, code, reason) => {
  console.log(`Connection closed: ${code} ${reason}`);
  // Cleanup resources
}
```

### onError (optional)

Called when an error occurs.

```typescript
onError: async (connection, error) => {
  console.error('WebSocket error:', error);
  // Log error, notify monitoring system, etc.
}
```

## Connection Object

The `connection` object provides methods to interact with the WebSocket:

```typescript
interface WebSocketConnection {
  // Send a message (auto-serializes objects to JSON)
  send: (data: any, compress?: boolean) => void;
  
  // Close the connection
  close: (code?: number, reason?: string) => void;
  
  // Connection metadata
  readonly id: string;
  readonly ip?: string;
  readonly headers: Record<string, string | string[] | undefined>;
  
  // Hook-populated context
  readonly context: any;
  
  // Native WebSocket (for advanced use cases)
  readonly raw: any;
}
```

### Examples

```typescript
// Send JSON
connection.send({ type: 'notification', message: 'Hello' });

// Send string
connection.send('Plain text message');

// Send binary (Bun)
connection.send(new Uint8Array([1, 2, 3]));

// Close with code
connection.close(1000, 'Normal closure');

// Access metadata
console.log('Connection ID:', connection.id);
console.log('Client IP:', connection.ip);
console.log('User ID:', connection.context.userId);
```

## Input Validation

### Query Parameters (Handshake)

Query parameters are validated during the WebSocket handshake:

```typescript
defineRoute({
  kind: 'ws',
  input: z.object({
    roomId: z.string().uuid(),
    token: z.string(),
  }),
  handler: {
    onMessage: async (message, connection) => {
      // Query params available in connection.context
    }
  }
})

// Client
$ws.chatRoom({ roomId: '...', token: '...' }, { ... });
```

### Message Validation

Incoming messages are validated against the same `input` schema:

```typescript
defineRoute({
  kind: 'ws',
  input: z.object({
    type: z.enum(['chat', 'typing']),
    content: z.string(),
  }),
  handler: {
    onMessage: async (message, connection) => {
      // message is validated
      if (message.type === 'chat') {
        // Handle chat message
      }
    }
  }
})
```

If validation fails, an error message is sent to the client:

```json
{
  "type": "error",
  "code": "VALIDATION_ERROR",
  "message": "Invalid message format",
  "details": { ... }
}
```

## Hooks Integration

WebSocket routes support the same hook system as HTTP routes:

### Before Hooks

Execute during the WebSocket handshake. Can reject the connection:

```typescript
const authHook = defineHook({
  name: 'auth',
  before: async (ctx) => {
    const token = ctx.req.headers.authorization;
    if (!token) {
      return { next: false, status: 401, error: 'Unauthorized' };
    }
    
    const user = await validateToken(token);
    ctx.context.userId = user.id;
    ctx.context.role = user.role;
    
    return { next: true };
  }
});

defineRoute({
  kind: 'ws',
  hooks: [authHook],
  handler: {
    onMessage: async (message, connection) => {
      // connection.context.userId is available
    }
  }
})
```

### Cleanup Hooks

Execute when the connection closes:

```typescript
const metricsHook = defineHook({
  name: 'metrics',
  cleanup: async (ctx) => {
    console.log(`Connection closed: ${ctx.success ? 'success' : 'error'}`);
    // Log metrics, update counters, etc.
  }
});
```

### After Hooks

Not applicable to WebSocket routes (no single response).

## Runtime-Specific Features

### Bun: Pub/Sub

Bun's native WebSocket implementation includes a built-in pub/sub system:

```typescript
onOpen: async (connection) => {
  const ws = connection.raw as ServerWebSocket;
  
  // Subscribe to topics
  ws.subscribe('chat-room-1');
  ws.subscribe('notifications');
  
  // Publish to topic (excludes self)
  ws.publish('chat-room-1', 'User joined');
  
  // Check subscriptions
  console.log(ws.subscriptions); // ['chat-room-1', 'notifications']
},

onClose: async (connection) => {
  const ws = connection.raw as ServerWebSocket;
  ws.unsubscribe('chat-room-1');
}
```

Server-level publishing (includes all subscribers):

```typescript
const { middleware, server } = setupBridge(routes, { runtime: 'bun' });

// Publish to all subscribers
server.publish('global-notifications', 'System maintenance in 5 minutes');
```

### Bun: Backpressure Handling

Bun's `.send()` returns a status code:

```typescript
onMessage: async (message, connection) => {
  const result = connection.send(response);
  
  if (typeof result === 'number') {
    if (result === -1) {
      console.log('Message queued with backpressure');
    } else if (result === 0) {
      console.log('Message dropped - connection issue');
    } else {
      console.log(`Sent ${result} bytes`);
    }
  }
}
```

### Bun: Corking

Batch multiple sends into one syscall:

```typescript
onMessage: async (message, connection) => {
  const ws = connection.raw as ServerWebSocket;
  
  ws.cork(() => {
    ws.send('Message 1');
    ws.send('Message 2');
    ws.send('Message 3');
  });
}
```

### Bun: Compression

Enable per-message compression:

```typescript
// Enable globally
Bun.serve({
  websocket: {
    perMessageDeflate: true,
  }
});

// Per message
connection.send(largeObject, true); // compress = true
```

## Error Handling

### Handshake Errors

Errors during handshake return HTTP error responses:

- **400 Bad Request**: Validation error (invalid query parameters)
- **401 Unauthorized**: Authentication failed (hook rejected)
- **404 Not Found**: Route not found
- **500 Internal Server Error**: Server error

### Runtime Errors

Errors during message handling send error messages to the client:

```json
{
  "type": "error",
  "code": "HANDLER_ERROR",
  "message": "Message handler failed"
}
```

### Error Logging

Enable request logging to see WebSocket events:

```typescript
setupBridge(routes, {
  logRequests: true, // Logs connections, messages, errors
});
```

Output:

```
[WS] chatRoom - Connection request
[WS] chatRoom - Connection opened
[WS] chatRoom - Connection closed: 1000
```

## Best Practices

### 1. Always Validate Messages

```typescript
input: z.object({
  type: z.enum(['chat', 'typing', 'ping']),
  content: z.string().max(1000),
})
```

### 2. Use Hooks for Authentication

```typescript
hooks: [authHook, rateLimitHook]
```

### 3. Handle Errors Gracefully

```typescript
onError: async (connection, error) => {
  console.error('Error:', error);
  connection.send({ type: 'error', message: 'Something went wrong' });
}
```

### 4. Clean Up Resources

```typescript
onClose: async (connection) => {
  // Unsubscribe from topics
  // Close database connections
  // Clear timers
}
```

### 5. Implement Heartbeat/Ping

```typescript
onOpen: async (connection) => {
  const interval = setInterval(() => {
    connection.send({ type: 'ping' });
  }, 30000);
  
  (connection.raw as any).__pingInterval = interval;
},

onClose: async (connection) => {
  clearInterval((connection.raw as any).__pingInterval);
}
```

### 6. Rate Limit Messages

```typescript
const messageRateLimit = defineHook({
  name: 'messageRateLimit',
  setup: () => ({
    counts: new Map<string, number>(),
  }),
  before: (ctx, state) => {
    const userId = ctx.context.userId;
    const count = state.counts.get(userId) || 0;
    
    if (count > 100) {
      return { next: false, status: 429, error: 'Too many messages' };
    }
    
    state.counts.set(userId, count + 1);
    setTimeout(() => state.counts.delete(userId), 60000);
    
    return { next: true };
  }
});
```

## Security Considerations

### 1. Authentication

Always authenticate WebSocket connections:

```typescript
hooks: [authHook]
```

### 2. Origin Validation

Validate the Origin header in hooks:

```typescript
before: async (ctx) => {
  const origin = ctx.req.headers.origin;
  if (!allowedOrigins.includes(origin)) {
    return { next: false, status: 403, error: 'Forbidden origin' };
  }
  return { next: true };
}
```

### 3. Message Size Limits

Configure max payload size (Bun):

```typescript
Bun.serve({
  websocket: {
    maxPayloadLength: 1024 * 1024, // 1 MB
  }
});
```

### 4. Idle Timeout

Configure connection timeout (Bun):

```typescript
Bun.serve({
  websocket: {
    idleTimeout: 60, // 60 seconds
  }
});
```

### 5. Input Validation

Always validate all incoming messages:

```typescript
input: z.object({
  // Define strict schema
})
```

## Troubleshooting

### Connection Not Upgrading

**Express**: Ensure you're handling the `upgrade` event:

```typescript
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});
```

**Hono**: Ensure `hono/websocket` is installed:

```bash
npm install hono
```

**Bun**: Ensure you're passing the `websocket` config:

```typescript
Bun.serve({
  fetch,
  websocket, // Don't forget this!
});
```

### Messages Not Validated

Ensure `input` schema is defined:

```typescript
defineRoute({
  kind: 'ws',
  input: z.object({ ... }), // Required for validation
  handler: { ... }
})
```

### Hooks Not Executing

Ensure hooks are passed to `setupBridge`:

```typescript
setupBridge(routes, {
  hooks: [authHook, loggerHook], // Global hooks
});
```

Or to individual routes:

```typescript
defineRoute({
  kind: 'ws',
  hooks: [authHook], // Route-specific hooks
  handler: { ... }
})
```

### Client Can't Connect

Check the WebSocket URL protocol:

```typescript
// Correct
ws://localhost:3000/api/chatRoom
wss://example.com/api/chatRoom

// Incorrect
http://localhost:3000/api/chatRoom
```

The `$ws` helper automatically converts `http://` to `ws://` and `https://` to `wss://`.

## Examples

See the `server/routes/` directory for complete examples:
- Chat room with broadcasting
- Real-time dashboard with periodic updates
- Notification system with pub/sub

See the `test/` directory for client examples:
- `test/bun-ws/index.html` - Bun WebSocket client
- `test/hono-ws/index.html` - Hono WebSocket client
- `test/express-ws/index.html` - Express WebSocket client
