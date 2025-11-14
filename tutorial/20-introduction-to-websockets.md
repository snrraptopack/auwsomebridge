# Tutorial 20: Introduction to WebSockets

WebSockets enable real-time, two-way communication between client and server. Unlike SSE, both sides can send messages anytime.

## What are WebSockets?

WebSockets create a persistent connection where both client and server can send messages:

```
Client ↔ Message ↔ Server
Client ↔ Message ↔ Server
Client ↔ Message ↔ Server
[Connection stays open]
```

Both sides can send messages at any time, without waiting for the other.

## WebSocket vs SSE vs HTTP

### Regular HTTP (Fetch)
```
Client → Request → Server
Client ← Response ← Server
[Connection closes]
```
- One request, one response
- Client initiates
- Connection closes after response

### Server-Sent Events (SSE)
```
Client → Request → Server
Client ← Message ← Server
Client ← Message ← Server
[One-way: Server → Client]
```
- Client opens connection
- Server pushes messages
- Client cannot send messages back
- Automatic reconnection

### WebSocket
```
Client ↔ Message ↔ Server
Client ↔ Message ↔ Server
[Two-way: Client ↔ Server]
```
- Both can send messages anytime
- Real-time, bidirectional
- No automatic reconnection (you handle it)
- Lower latency than SSE

## When to Use WebSockets

Use WebSockets when:
- ✅ You need two-way communication
- ✅ Client needs to send frequent messages
- ✅ You need real-time updates (chat, games, collaboration)
- ✅ You need low latency
- ✅ You want to send binary data

Examples:
- Chat applications
- Multiplayer games
- Collaborative editing (Google Docs style)
- Live trading platforms
- Real-time dashboards with user input
- Video/audio streaming controls

## When NOT to Use WebSockets

Don't use WebSockets when:
- ❌ You only need server → client updates (use SSE)
- ❌ You need simple request/response (use HTTP)
- ❌ You need automatic reconnection (use SSE)
- ❌ You're behind restrictive firewalls (SSE works better)

## How WebSockets Work

1. **Client initiates handshake** (HTTP upgrade):
```typescript
const ws = new WebSocket('ws://localhost:3000/api/chat');
```

2. **Connection established** (both can now send):
```typescript
// Client sends
ws.send(JSON.stringify({ message: 'Hello!' }));

// Server sends
connection.send({ message: 'Hi there!' });
```

3. **Both sides can send/receive anytime**:
```typescript
// Client receives
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};

// Server receives
onMessage: async (message, connection) => {
  console.log('Received:', message);
}
```

4. **Connection stays open** until closed by either side.

## WebSocket Lifecycle

```
1. Connection Request (Handshake)
   ↓
2. Connection Established (onOpen)
   ↓
3. Messages Flow (onMessage)
   ↓
4. Connection Closes (onClose)
```

## WebSockets in This Framework

In this framework, WebSocket routes are marked with `kind: 'ws'`:

```typescript
const routes = {
  chat: defineRoute({
    kind: 'ws',  // ← This makes it a WebSocket route
    handler: {
      onOpen: async (connection) => {
        // Connection established
        connection.send({ type: 'welcome', message: 'Connected!' });
      },
      onMessage: async (message, connection) => {
        // Received message from client
        console.log('Received:', message);
        
        // Send response
        connection.send({ type: 'echo', data: message });
      },
      onClose: async (connection, code, reason) => {
        // Connection closed
        console.log('Disconnected:', reason);
      }
    }
  })
};
```

## Key Differences from HTTP and SSE

| Feature | HTTP | SSE | WebSocket |
|---------|------|-----|-----------|
| `kind` | `'http'` (default) | `'sse'` | `'ws'` |
| Direction | Client → Server | Server → Client | Both ways |
| Handler | Function | Async generator | Object with callbacks |
| Client API | `fetch()` | `EventSource` | `WebSocket` |
| Connection | Closes after response | Stays open | Stays open |
| Reconnection | N/A | Automatic | Manual |
| Binary Data | Yes | No | Yes |

## WebSocket Handler Structure

WebSocket handlers are objects with lifecycle methods:

```typescript
handler: {
  onOpen: (connection) => {
    // Called when connection opens
  },
  onMessage: (message, connection) => {
    // Called when message received (REQUIRED)
  },
  onClose: (connection, code, reason) => {
    // Called when connection closes
  },
  onError: (connection, error) => {
    // Called when error occurs
  }
}
```

Only `onMessage` is required.

## What's Next?

Now let's create your first WebSocket route!

---

**Next:** [21-your-first-websocket-route.md](./21-your-first-websocket-route.md)
