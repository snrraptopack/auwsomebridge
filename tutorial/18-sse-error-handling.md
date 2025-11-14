# Tutorial 18: SSE Error Handling

Errors in SSE routes need special handling because the connection is already open. Let's learn how to handle them properly.

## Errors Before Stream Starts

If an error occurs before the stream starts (validation, hooks), the connection is rejected normally:

```typescript
const routes = {
  notifications: defineRoute({
    kind: 'sse',
    input: z.object({
      userId: z.string()
    }),
    hooks: [authHook],
    handler: async function* ({ userId }) {
      // Stream notifications
    }
  })
};

// Client
const es = new EventSource('/api/notifications?userId=invalid');

es.onerror = (error) => {
  // Connection fails immediately
  console.error('Failed to connect');
};
```

The client never receives any events - the connection is rejected.

## Errors During Stream

Once the stream starts, errors are sent as special error events:

```typescript
const routes = {
  data: defineRoute({
    kind: 'sse',
    handler: async function* () {
      yield { message: 'Event 1' };
      yield { message: 'Event 2' };
      
      // Error occurs here
      throw new Error('Something went wrong!');
      
      // This never executes
      yield { message: 'Event 3' };
    }
  })
};
```

The server sends an error event:

```
data: {"message":"Event 1"}

data: {"message":"Event 2"}

event: error
data: {"message":"Something went wrong!"}
```

Then the stream ends.

## Handling Errors in Client

The client's `onerror` handler is called:

```typescript
const es = new EventSource('/api/data');

es.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};

es.onerror = (error) => {
  console.error('Stream error or disconnected');
  // EventSource automatically tries to reconnect
};
```

**Note:** `EventSource` automatically tries to reconnect after errors. To prevent this, close the connection:

```typescript
es.onerror = (error) => {
  console.error('Error occurred');
  es.close();  // Prevent reconnection
};
```

## Try-Catch Inside Handler

Handle errors gracefully inside your handler:

```typescript
const routes = {
  safeStream: defineRoute({
    kind: 'sse',
    handler: async function* () {
      while (true) {
        try {
          const data = await fetchData();
          yield { data };
        } catch (error) {
          // Send error as a regular event
          yield {
            type: 'error',
            message: error.message,
            timestamp: Date.now()
          };
          
          // Continue streaming
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
  })
};

// Client
es.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'error') {
    console.error('Stream error:', data.message);
  } else {
    console.log('Data:', data.data);
  }
};
```

This way, errors don't break the stream - they're just regular events.

## Graceful Shutdown

Send a final event before ending the stream:

```typescript
const routes = {
  countdown: defineRoute({
    kind: 'sse',
    handler: async function* () {
      try {
        for (let i = 5; i >= 0; i--) {
          yield { count: i };
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Send completion event
        yield { type: 'complete', message: 'Countdown finished!' };
      } catch (error) {
        // Send error event
        yield { type: 'error', message: error.message };
      }
    }
  })
};

// Client
es.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'complete') {
    console.log('✓', data.message);
    es.close();
  } else if (data.type === 'error') {
    console.error('✗', data.message);
    es.close();
  } else {
    console.log('Count:', data.count);
  }
};
```

## Handling Client Disconnection

You can't detect client disconnection directly in the handler, but cleanup hooks will run:

```typescript
const disconnectHook = defineHook({
  name: 'disconnect',
  before: (ctx) => {
    ctx.context.connected = true;
    return { next: true };
  },
  cleanup: (ctx) => {
    console.log(`Client disconnected from ${ctx.route}`);
    
    // Clean up resources
    if (ctx.context.subscription) {
      ctx.context.subscription.unsubscribe();
    }
    
    return { next: true };
  }
});

const routes = {
  stream: defineRoute({
    kind: 'sse',
    hooks: [disconnectHook],
    handler: async function* (_, context) {
      // Set up subscription
      context.subscription = subscribeToEvents();
      
      while (context.connected) {
        const event = await context.subscription.next();
        yield event;
      }
    }
  })
};
```

## Timeout Pattern

Automatically end streams after a timeout:

```typescript
const routes = {
  timedStream: defineRoute({
    kind: 'sse',
    input: z.object({
      duration: z.string().transform(Number).default('30000')
    }),
    handler: async function* ({ duration }) {
      const startTime = Date.now();
      
      while (Date.now() - startTime < duration) {
        yield {
          data: Math.random(),
          remaining: duration - (Date.now() - startTime)
        };
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      yield { type: 'timeout', message: 'Stream timeout reached' };
    }
  })
};
```

## Error Event Types

You can send different error types:

```typescript
const routes = {
  monitoring: defineRoute({
    kind: 'sse',
    handler: async function* () {
      while (true) {
        try {
          const metrics = await getMetrics();
          
          if (metrics.error) {
            yield {
              type: 'warning',
              level: 'warn',
              message: metrics.error
            };
          } else {
            yield {
              type: 'data',
              metrics
            };
          }
        } catch (error) {
          yield {
            type: 'error',
            level: 'error',
            message: error.message
          };
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  })
};

// Client
es.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'data':
      console.log('Metrics:', data.metrics);
      break;
    case 'warning':
      console.warn('⚠️', data.message);
      break;
    case 'error':
      console.error('❌', data.message);
      break;
  }
};
```

## Key Points

1. **Errors before stream starts** → Connection rejected
2. **Errors during stream** → Sent as error events, then stream ends
3. **Use try-catch inside handler** → Handle errors gracefully
4. **Send completion events** → Signal successful end
5. **Cleanup hooks always run** → Clean up resources
6. **EventSource auto-reconnects** → Call `close()` to prevent
7. **Send error types** → Distinguish warnings from errors

## What's Next?

You've learned the basics of SSE! Let's wrap up with some practical SSE patterns.

---

**Next:** [19-sse-patterns.md](./19-sse-patterns.md)
