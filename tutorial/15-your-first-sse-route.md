# Tutorial 15: Your First SSE Route

Let's create a simple SSE route that sends messages to the client.

## Basic SSE Route

Here's the simplest SSE route:

```typescript
import { defineRoute } from './server/core/bridge';

const routes = {
  clock: defineRoute({
    kind: 'sse',
    handler: async function* () {
      // Send current time every second
      for (let i = 0; i < 5; i++) {
        yield { time: new Date().toISOString() };
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  })
};
```

## Understanding the Handler

The handler is an **async generator function** (`async function*`):

```typescript
handler: async function* () {
  yield { time: '2024-01-01T12:00:00Z' };  // Send first event
  yield { time: '2024-01-01T12:00:01Z' };  // Send second event
  yield { time: '2024-01-01T12:00:02Z' };  // Send third event
}
```

- `async function*` - Async generator function
- `yield` - Sends one event to the client
- Each `yield` sends data immediately

## Client Side: Using EventSource

On the client, use the native `EventSource` API:

```typescript
// Connect to SSE endpoint
const eventSource = new EventSource('/api/clock');

// Listen for messages
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data.time);
};

// Handle connection open
eventSource.onopen = () => {
  console.log('Connection opened');
};

// Handle errors
eventSource.onerror = (error) => {
  console.error('SSE error:', error);
  eventSource.close();
};

// Close when done
// eventSource.close();
```

## Client Side: Using Framework Helper

The framework provides a helper for easier usage:

```typescript
const { $sse } = setupBridge(routes, { baseUrl: '/api' });

// Connect and handle messages
const connection = $sse.clock({}, {
  onOpen: () => {
    console.log('Connected!');
  },
  onMessage: (data) => {
    console.log('Time:', data.time);
  },
  onError: (error) => {
    console.error('Error:', error);
  }
});

// Close when done
connection.close();
```

## Complete Example

**Server:**
```typescript
import { defineRoute, setupBridge } from './server/core/bridge';

const routes = {
  countdown: defineRoute({
    kind: 'sse',
    handler: async function* () {
      for (let i = 5; i >= 0; i--) {
        yield { count: i, message: i === 0 ? 'Done!' : `${i}...` };
        
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
  })
};

const { middleware } = setupBridge(routes, {
  prefix: '/api'
});

// Express
app.use('/api/:route', middleware);

// Hono
app.use('/api/:route', middleware);

// Bun
Bun.serve({
  port: 3000,
  fetch: middleware
});
```

**Client:**
```typescript
const eventSource = new EventSource('/api/countdown');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.message);  // "5..." "4..." "3..." "2..." "1..." "Done!"
  
  if (data.count === 0) {
    eventSource.close();
  }
};
```

## How Data is Sent

When you `yield` an object, it's sent as:

```
data: {"count":5,"message":"5..."}

data: {"count":4,"message":"4..."}

data: {"count":3,"message":"3..."}
```

The client receives each as a separate event.

## Infinite Streams

SSE routes can run forever:

```typescript
const routes = {
  serverTime: defineRoute({
    kind: 'sse',
    handler: async function* () {
      while (true) {
        yield { time: new Date().toISOString() };
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  })
};
```

The stream continues until:
- Client closes the connection
- Server stops
- An error occurs

## Key Points

1. **Use `kind: 'sse'`** to mark route as SSE
2. **Handler must be `async function*`** (async generator)
3. **Use `yield`** to send each event
4. **Client uses `EventSource`** or `$sse.route()`
5. **Connection stays open** until closed or stream ends

## What's Next?

Now let's learn how to send input to SSE routes!

---

**Next:** [16-sse-with-input.md](./16-sse-with-input.md)
