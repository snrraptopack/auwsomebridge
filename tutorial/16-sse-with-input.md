# Tutorial 16: SSE with Input

SSE routes can accept input parameters, just like regular routes. The input is sent when the client opens the connection.

## Adding Input Validation

Use the `input` schema to validate query parameters:

```typescript
import { defineRoute } from './server/core/bridge';
import { z } from 'zod';

const routes = {
  countdown: defineRoute({
    kind: 'sse',
    input: z.object({
      start: z.string().transform(Number),
      interval: z.string().transform(Number).optional()
    }),
    handler: async function* ({ start, interval = 1000 }) {
      for (let i = start; i >= 0; i--) {
        yield { count: i };
        
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, interval));
        }
      }
    }
  })
};
```

## Client Side: Passing Input

With `EventSource`, input goes in the URL as query parameters:

```typescript
// Pass input as query parameters
const eventSource = new EventSource('/api/countdown?start=10&interval=500');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Count:', data.count);
};
```

## Client Side: Using Framework Helper

The framework helper makes it cleaner:

```typescript
const { $sse } = setupBridge(routes, { baseUrl: '/api' });

// Pass input as first argument
const connection = $sse.countdown(
  { start: '10', interval: '500' },
  {
    onMessage: (data) => {
      console.log('Count:', data.count);
    }
  }
);
```

## Input is Query Parameters Only

**Important:** SSE input is always sent as query parameters, even if you don't specify `method: 'GET'`:

```typescript
const routes = {
  notifications: defineRoute({
    kind: 'sse',
    // method is always GET for SSE (query params)
    input: z.object({
      userId: z.string(),
      types: z.array(z.string()).optional()
    }),
    handler: async function* ({ userId, types }) {
      // Stream notifications for this user
      while (true) {
        const notification = await getNextNotification(userId, types);
        yield notification;
      }
    }
  })
};

// Client
const es = new EventSource('/api/notifications?userId=123&types=email&types=sms');
```

## Example: Live Search Results

Stream search results as they're found:

```typescript
const routes = {
  liveSearch: defineRoute({
    kind: 'sse',
    input: z.object({
      query: z.string(),
      limit: z.string().transform(Number).default('10')
    }),
    handler: async function* ({ query, limit }) {
      // Search in batches
      let offset = 0;
      let found = 0;
      
      while (found < limit) {
        const results = await searchDatabase(query, offset, 5);
        
        if (results.length === 0) break;
        
        for (const result of results) {
          yield { result, total: found + 1 };
          found++;
          
          if (found >= limit) break;
        }
        
        offset += 5;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      yield { done: true, total: found };
    }
  })
};

// Client
const es = new EventSource('/api/liveSearch?query=javascript&limit=20');

es.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.done) {
    console.log(`Search complete! Found ${data.total} results`);
    es.close();
  } else {
    console.log(`Result ${data.total}:`, data.result);
  }
};
```

## Example: Progress Updates

Stream progress for a long-running task:

```typescript
const routes = {
  processFile: defineRoute({
    kind: 'sse',
    input: z.object({
      fileId: z.string()
    }),
    handler: async function* ({ fileId }) {
      const file = await getFile(fileId);
      const totalSteps = 100;
      
      for (let step = 0; step <= totalSteps; step++) {
        // Do some processing
        await processChunk(file, step);
        
        // Send progress update
        yield {
          progress: step,
          total: totalSteps,
          percentage: Math.round((step / totalSteps) * 100),
          message: `Processing step ${step} of ${totalSteps}`
        };
        
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      yield {
        done: true,
        message: 'Processing complete!',
        result: await getProcessedFile(fileId)
      };
    }
  })
};

// Client
const es = new EventSource('/api/processFile?fileId=abc123');

es.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.done) {
    console.log('✓', data.message);
    console.log('Result:', data.result);
    es.close();
  } else {
    console.log(`Progress: ${data.percentage}% - ${data.message}`);
  }
};
```

## Input Validation Errors

If input validation fails, the connection is rejected:

```typescript
// Invalid input
const es = new EventSource('/api/countdown?start=invalid');

es.onerror = (error) => {
  // Connection fails immediately
  console.error('Failed to connect:', error);
};
```

The server returns a validation error before opening the SSE stream.

## Key Points

1. **Input is always query parameters** for SSE routes
2. **Use `input` schema** to validate parameters
3. **Input is sent when connection opens** (not during the stream)
4. **Validation happens before streaming** starts
5. **Use framework helper** for cleaner client code

## What's Next?

Now let's learn how to use hooks with SSE routes!

---

**Next:** [17-sse-with-hooks.md](./17-sse-with-hooks.md)
