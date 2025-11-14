# WebSocket Support Design Document

## Overview

This design extends auwsomebridge with WebSocket support following the established multi-runtime pattern. Like SSE routes (`kind: 'sse'`), WebSocket routes will use `kind: 'ws'` and work identically across Express, Hono, and Bun. The design leverages existing infrastructure (hooks, validation, normalization) while adding WebSocket-specific connection management.

## Architecture

### High-Level Flow

```
Client Request → Runtime Adapter → Hook Executor → WebSocket Handler → Connection Context
                                                                              ↓
Client ← Runtime-Specific WebSocket ← Message/Event Handlers ← User Handler
```

### Key Design Principles

1. **Consistency with SSE**: Follow the same pattern where `kind: 'ws'` triggers WebSocket behavior
2. **Runtime Agnostic**: Single handler definition works across Express, Hono, and Bun
3. **Hook Integration**: Reuse existing hook system for authentication and lifecycle management
4. **Type Safety**: Leverage Zod for message validation and TypeScript for connection context
5. **Minimal API Surface**: Keep handler API simple and intuitive

## Components and Interfaces

### 1. Route Definition Extension

**File**: `server/core/shared/types.ts`

Add WebSocket support to existing route definition:

```typescript
export interface RouteDefinition<I, O, C> {
  method?: HttpMethod;
  input?: I;
  output?: O;
  handler: RouteHandler<ParsedInput<I>, OutputData<O>, C> | WebSocketHandler<ParsedInput<I>, C>;
  hooks?: RouteHook[];
  description?: string;
  tags?: string[];
  kind?: 'http' | 'sse' | 'ws';  // Add 'ws'
}
```

### 2. WebSocket Handler Types

**File**: `server/core/shared/types.ts`

New types for WebSocket handlers:

```typescript
/**
 * WebSocket connection context providing methods to interact with the connection
 */
export interface WebSocketConnection<TContext = any> {
  /** 
   * Send a message to the client 
   * @param data - Message data (string, object, ArrayBuffer, TypedArray)
   * @param compress - Enable compression for this message (Bun only)
   * @returns void (Express/Hono) or number (Bun: -1=backpressure, 0=dropped, 1+=bytes sent)
   */
  send: (data: any, compress?: boolean) => void;
  
  /** Close the connection with optional code and reason */
  close: (code?: number, reason?: string) => void;
  
  /** Connection metadata */
  readonly id: string;
  readonly ip?: string;
  readonly headers: Record<string, string | string[] | undefined>;
  
  /** Hook-populated context */
  readonly context: TContext;
  
  /** Native platform WebSocket (for advanced use cases like Bun's pub/sub) */
  readonly raw: any;
}

/**
 * WebSocket message handler function
 */
export type WebSocketMessageHandler<TInput = any, TContext = any> = (
  message: TInput,
  connection: WebSocketConnection<TContext>
) => void | Promise<void>;

/**
 * WebSocket handler configuration
 */
export interface WebSocketHandler<TInput = any, TContext = any> {
  /** Called when connection is established (after hooks) */
  onOpen?: (connection: WebSocketConnection<TContext>) => void | Promise<void>;
  
  /** Called when a message is received */
  onMessage: WebSocketMessageHandler<TInput, TContext>;
  
  /** Called when connection closes */
  onClose?: (connection: WebSocketConnection<TContext>, code: number, reason: string) => void | Promise<void>;
  
  /** Called when an error occurs */
  onError?: (connection: WebSocketConnection<TContext>, error: Error) => void | Promise<void>;
}
```

### 3. Adapter Implementation Pattern

Each runtime adapter will implement WebSocket handling following this pattern:

**Express Adapter** (`server/core/express/adapter.ts`):
- Use `ws` library for WebSocket support
- Upgrade HTTP connection to WebSocket during handshake
- Wrap `ws.WebSocket` in `WebSocketConnection` interface
- Store connection metadata in WeakMap

**Hono Adapter** (`server/core/hono/adapter.ts`):
- Use Hono's `upgradeWebSocket()` helper
- Return WebSocket handler from middleware
- Wrap Hono WebSocket in `WebSocketConnection` interface
- Connection context managed by Hono

**Bun Adapter** (`server/core/bun/adapter.ts`):
- Use Bun's native WebSocket support via `Bun.serve({ websocket })`
- Call `server.upgrade(req, { data })` in fetch handler to upgrade connection
- Store route definition, user handlers, and context in `ws.data`
- Create single shared handler object that dispatches to user handlers
- Wrap Bun ServerWebSocket in `WebSocketConnection` interface
- Use `ws.data` structure:
  ```typescript
  {
    routeName: string;
    routeDef: RouteDefinition;
    userHandlers: WebSocketHandler;
    context: any; // Hook-populated context
    connectionId: string;
    headers: Record<string, string | string[] | undefined>;
  }
  ```

### 4. Connection Context Wrapper

**File**: `server/core/shared/websocket.ts` (new file)

Unified wrapper that normalizes WebSocket connections:

```typescript
export class WebSocketConnectionImpl<TContext = any> implements WebSocketConnection<TContext> {
  readonly id: string;
  readonly ip?: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly context: TContext;
  readonly raw: any;
  
  private sendFn: (data: any, compress?: boolean) => number | void;
  private closeFn: (code?: number, reason?: string) => void;
  
  constructor(config: {
    id: string;
    ip?: string;
    headers: Record<string, string | string[] | undefined>;
    context: TContext;
    raw: any;
    sendFn: (data: any, compress?: boolean) => number | void;
    closeFn: (code?: number, reason?: string) => void;
  }) {
    this.id = config.id;
    this.ip = config.ip;
    this.headers = config.headers;
    this.context = config.context;
    this.raw = config.raw;
    this.sendFn = config.sendFn;
    this.closeFn = config.closeFn;
  }
  
  send(data: any, compress?: boolean): void {
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    this.sendFn(message, compress);
  }
  
  close(code?: number, reason?: string): void {
    this.closeFn(code, reason);
  }
}
```

**Note on Bun's Performance Design**: Bun uses a single handler object shared across all connections (rather than per-connection handlers) for performance. The bridge will adapt this by:
1. Storing user handlers in the route definition
2. Creating a single Bun handler object that dispatches to user handlers
3. Using `ws.data` to store connection-specific context and metadata

## Data Models

### WebSocket Route Example

```typescript
export const chatRoutes = {
  chatRoom: defineRoute({
    method: 'GET',
    kind: 'ws',
    input: z.object({
      message: z.string().min(1).max(500),
    }),
    hooks: [authHook],
    handler: {
      onOpen: async (connection) => {
        console.log(`User ${connection.context.userId} connected`);
        connection.send({ type: 'welcome', message: 'Connected to chat' });
      },
      onMessage: async (message, connection) => {
        console.log(`Received from ${connection.context.userId}:`, message);
        // Broadcast logic here
        connection.send({ type: 'echo', data: message });
      },
      onClose: async (connection, code, reason) => {
        console.log(`User ${connection.context.userId} disconnected`);
      },
      onError: async (connection, error) => {
        console.error(`Error for ${connection.context.userId}:`, error);
      },
    },
  }),
};
```

### Client Usage Example

```typescript
import { $ws } from './server/client-$api';

const ws = $ws.chatRoom({
  onOpen: () => console.log('Connected'),
  onMessage: (data) => console.log('Received:', data),
  onClose: () => console.log('Disconnected'),
  onError: (err) => console.error('Error:', err),
});

// Send a message
ws.send({ message: 'Hello, world!' });

// Close connection
ws.close();
```

## Error Handling

### Handshake Errors

1. **Hook Rejection**: If before hooks return `{ next: false }`, reject upgrade with HTTP error
2. **Validation Errors**: If query parameters fail validation, return 400 Bad Request
3. **Route Not Found**: If WebSocket route doesn't exist, return 404 Not Found

### Runtime Errors

1. **Message Validation**: Send error message to client, don't invoke handler
2. **Handler Errors**: Log error, send error message to client, optionally close connection
3. **Connection Errors**: Invoke error handler, log error, clean up resources

### Error Message Format

```typescript
{
  type: 'error',
  code: 'VALIDATION_ERROR' | 'HANDLER_ERROR' | 'INTERNAL_ERROR',
  message: 'Human-readable error message',
  details?: any
}
```

## Testing Strategy

### Unit Tests

1. **WebSocketConnectionImpl**: Test send, close, and property access
2. **Message Validation**: Test Zod schema validation for incoming messages
3. **Hook Integration**: Test before hooks during handshake, cleanup hooks on close
4. **Error Handling**: Test validation errors, handler errors, connection errors

### Integration Tests

1. **Express WebSocket**: Test full connection lifecycle with ws library
2. **Hono WebSocket**: Test full connection lifecycle with Hono's WebSocket support
3. **Bun WebSocket**: Test full connection lifecycle with Bun's native WebSocket
4. **Cross-Runtime**: Verify identical behavior across all three runtimes

### Manual Tests

1. **Browser Client**: Test WebSocket connection from browser using $ws helper
2. **Node Client**: Test WebSocket connection from Node.js using $ws helper
3. **Message Flow**: Test bidirectional message exchange
4. **Reconnection**: Test connection recovery after disconnect
5. **Authentication**: Test hook-based authentication during handshake

## Implementation Notes

### Hook Execution for WebSocket Routes

- **Before Hooks**: Execute during handshake (before upgrade)
  - Can reject connection with `{ next: false }`
  - Can populate context for connection handlers
  - Have access to query parameters and headers
  
- **After Hooks**: Not applicable (no single response)

- **Cleanup Hooks**: Execute when connection closes
  - Always run regardless of close reason
  - Have access to connection outcome (normal close vs error)

### Query Parameter Handling

Query parameters are validated during handshake:

```typescript
// Route definition
defineRoute({
  kind: 'ws',
  input: z.object({
    roomId: z.string().uuid(),
    token: z.string(),
  }),
  handler: { /* ... */ }
})

// Client usage
$ws.chatRoom({ roomId: '...', token: '...' }, {
  onMessage: (msg) => { /* ... */ }
})
```

The `input` schema validates query parameters during handshake, then validates messages during the connection.

### Message vs Query Parameter Validation

To support both query parameters (handshake) and messages (runtime), we'll use:

- `input`: Validates query parameters during handshake
- Message validation: Reuse `input` schema for incoming messages

This keeps the API simple while supporting both use cases.

### Runtime-Specific Considerations

**Express**:
- Requires `ws` library as peer dependency
- WebSocket upgrade handled manually in adapter
- Connection stored in WeakMap for cleanup
- Event-based API: `ws.on('message', handler)`

**Hono**:
- Uses `upgradeWebSocket()` from `hono/websocket`
- Returns WebSocket handler from middleware
- Hono manages connection lifecycle
- Handler object with lifecycle methods

**Bun**:
- Native WebSocket support via `Bun.serve({ websocket })`
- Single handler object shared across all connections (performance optimization)
- Connection data stored in `ws.data` property
- Call `server.upgrade(req, { data, headers })` to upgrade
- Handler methods: `open(ws)`, `message(ws, message)`, `close(ws, code, reason)`, `error(ws, error)`, `drain(ws)`
- Built-in pub/sub: `ws.subscribe(topic)`, `ws.publish(topic, data)`, `server.publish(topic, data)`
- Compression support: `perMessageDeflate` option and per-message compression
- Backpressure handling: `.send()` returns status (-1, 0, or bytes sent)
- Default idle timeout: 120 seconds
- Default max payload: 16 MB

## Migration Path

### For Existing Users

1. No breaking changes - WebSocket is additive
2. Existing HTTP and SSE routes continue to work
3. Optional peer dependency on `ws` for Express users

### For New Features

1. Add `kind: 'ws'` to route definition
2. Change handler from function to object with lifecycle methods
3. Use `$ws` helper for client connections

## Performance Considerations

1. **Connection Pooling**: Each runtime manages its own connection pool
2. **Message Buffering**: Rely on native WebSocket buffering
3. **Memory Management**: Use WeakMap for connection metadata to allow garbage collection
4. **Scalability**: WebSocket connections are stateful - consider horizontal scaling implications

## Bun-Specific Features

While the bridge provides a unified API, Bun's native WebSocket implementation offers additional features accessible via `connection.raw`:

### Pub/Sub API

```typescript
// In handler
onOpen: (connection) => {
  // Access native Bun ServerWebSocket
  const ws = connection.raw as ServerWebSocket;
  
  // Subscribe to topics
  ws.subscribe('chat-room-1');
  ws.subscribe('notifications');
  
  // Publish to topic (excludes self)
  ws.publish('chat-room-1', 'User joined');
  
  // Check subscriptions
  console.log(ws.isSubscribed('chat-room-1')); // true
  console.log(ws.subscriptions); // ['chat-room-1', 'notifications']
},

onClose: (connection) => {
  const ws = connection.raw as ServerWebSocket;
  ws.unsubscribe('chat-room-1');
}
```

### Server-Level Publishing

```typescript
// Access server instance to publish to all subscribers
const { middleware, server } = setupBridge(routes, { runtime: 'bun' });

// Publish to all subscribers of a topic (including sender)
server.publish('global-notifications', 'System maintenance in 5 minutes');
```

### Backpressure Handling

```typescript
onMessage: (message, connection) => {
  const result = connection.send(response);
  
  // Bun returns a number indicating send status
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

### Corking for Batched Sends

```typescript
onMessage: (message, connection) => {
  const ws = connection.raw as ServerWebSocket;
  
  // Cork to batch multiple sends into one syscall
  ws.cork(() => {
    ws.send('Message 1');
    ws.send('Message 2');
    ws.send('Message 3');
  });
}
```

## Security Considerations

1. **Authentication**: Use before hooks to validate tokens during handshake
2. **Authorization**: Check permissions in before hooks before allowing upgrade
3. **Rate Limiting**: Apply rate limiting hooks to prevent abuse
4. **Input Validation**: Always validate incoming messages with Zod schemas
5. **Origin Checking**: Validate Origin header in before hooks for CORS protection
6. **Message Size Limits**: Configure max message size at runtime level (Bun default: 16 MB)
7. **Idle Timeout**: Configure connection timeout (Bun default: 120 seconds)

## Documentation Requirements

1. **API Reference**: Document WebSocket route definition and handler interface
2. **Examples**: Provide chat room, real-time dashboard, and notification examples
3. **Migration Guide**: Show how to convert polling/SSE to WebSocket
4. **Runtime Setup**: Document runtime-specific WebSocket configuration
5. **Client Usage**: Document $ws helper with TypeScript examples
6. **Security Best Practices**: Document authentication and authorization patterns
