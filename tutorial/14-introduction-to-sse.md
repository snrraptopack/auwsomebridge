# Tutorial 14: Introduction to Server-Sent Events (SSE)

Server-Sent Events (SSE) allow your server to push real-time updates to the client over a single HTTP connection.

## What is SSE?

SSE is a one-way communication channel from server to client:
- **Server → Client**: Server can send multiple messages
- **Client → Server**: Client cannot send messages (except initial request)

Think of it like a news feed or live updates - the server pushes data when it's ready.

## SSE vs Regular HTTP vs WebSocket

### Regular HTTP (Fetch)
```
Client → Request → Server
Client ← Response ← Server
[Connection closes]
```
One request, one response, done.

### Server-Sent Events (SSE)
```
Client → Request → Server
Client ← Message 1 ← Server
Client ← Message 2 ← Server
Client ← Message 3 ← Server
[Connection stays open]
```
One request, multiple responses over time.

### WebSocket
```
Client ↔ Message ↔ Server
Client ↔ Message ↔ Server
[Two-way communication]
```
Both can send messages anytime.

## When to Use SSE

Use SSE when:
- ✅ Server needs to push updates to client
- ✅ Client only needs to receive data (not send)
- ✅ You want automatic reconnection
- ✅ You need a simple, HTTP-based solution

Examples:
- Live notifications
- Stock price updates
- Server logs streaming
- Progress updates for long tasks
- Live sports scores
- Real-time dashboards

## When NOT to Use SSE

Don't use SSE when:
- ❌ Client needs to send messages to server (use WebSocket)
- ❌ You need binary data (use WebSocket)
- ❌ You need two-way communication (use WebSocket)

## How SSE Works

1. **Client opens connection**:
```typescript
const eventSource = new EventSource('/api/notifications');
```

2. **Server keeps connection open and sends events**:
```typescript
// Server sends:
data: {"message": "New notification"}

data: {"message": "Another update"}
```

3. **Client receives events**:
```typescript
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.message);
};
```

4. **Connection stays open** until client closes it or server ends the stream.

## SSE in This Framework

In this framework, SSE routes are marked with `kind: 'sse'`:

```typescript
const routes = {
  notifications: defineRoute({
    kind: 'sse',  // ← This makes it an SSE route
    handler: async function* () {
      // Send events over time
      yield { message: 'First event' };
      yield { message: 'Second event' };
    }
  })
};
```

Notice the `async function*` - that's an **async generator**. We'll learn about that next!

## Key Differences from Regular Routes

| Feature | Regular Route | SSE Route |
|---------|--------------|-----------|
| `kind` | `'http'` (default) | `'sse'` |
| Handler | Returns once | Yields multiple times |
| Response | Single JSON object | Stream of events |
| Connection | Closes after response | Stays open |
| Client API | `fetch()` or `$api.route()` | `EventSource` or `$sse.route()` |

## What's Next?

Now that you understand what SSE is, let's create your first SSE route!

---

**Next:** [15-your-first-sse-route.md](./15-your-first-sse-route.md)
