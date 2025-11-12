# SSE Streaming with AuwsomeBridge

## Overview
- Server-Sent Events (SSE) lets the server push updates over a single HTTP GET.
- Good for live dashboards, notifications, job progress, and logs.
- In the bridge, you declare `kind: 'sse'` and return an `AsyncIterable` from your handler.

## Add an SSE Route
- File reference: `server/routes/health.ts:14` shows `kind: 'sse'`.
- Minimal route:

```ts
import { defineRoute } from '../core/bridge';

export const healthRoutes = {
  pingSse: defineRoute({
    method: 'GET',
    kind: 'sse',
    handler: async () => {
      async function* gen() {
        for (let i = 0; i < 5; i++) {
          yield { ok: true, seq: i + 1, ts: Date.now() };
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      return gen();
    },
  }),
};
```

## Why Async Generators
- Stream values over time using `async function*`.
- Each `yield` becomes one SSE frame (`data: <json>\n\n`).
- Works the same across Express, Hono, and Bun via bridge adapters.

## Client (Browser)
- Use `EventSource`:

```ts
const es = new EventSource('/api/pingSse');
es.onmessage = (e) => {
  const payload = JSON.parse(e.data);
  console.log(payload);
};
es.onerror = () => es.close();
```

## Traditional vs Bridge
- Traditional Express:

```ts
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.write(`data: {"message":"hello"}\n\n`);
  res.end();
});
```

- Bridge route (runtime-agnostic):

```ts
defineRoute({
  method: 'GET',
  kind: 'sse',
  handler: async () => {
    async function* gen() {
      yield { message: 'hello' };
    }
    return gen();
  },
});
```

## Test Locally
- Start Hono server: `bun run server:hono`.
- Open `http://localhost:3001/api/pingSse`.
- You should see 5 JSON events streamed.

## Notes
- SSE handlers must return an `AsyncIterable`.
- Standard HTTP routes still validate outputs; SSE events are emitted as-is.
- Adapters set SSE headers and manage the stream:
  - Express: `server/core/express/adapter.ts:162`
  - Hono: `server/core/hono/adapter.ts:186`
  - Bun: `server/core/bun/adapter.ts:182`
 
 ## Client ($sse helper)
 - Exported from the bridge along with `$api`: see `server/client-$api.ts:11`.
 - `$sse.<routeName>(input?, { onMessage, onError, onOpen })` subscribes to SSE.
 
 ### Browser usage
 ```ts
 import { $sse } from '../server/client-$api';
 
 const sub = $sse.pingSse(undefined, {
   onOpen: () => console.log('opened'),
   onMessage: (data) => console.log('event', data),
   onError: (err) => console.error('error', err),
 });
 
 // later
 sub.close();
 ```
 
 ### Node/Bun usage
 ```ts
 import { $sse } from '../server/client-$api';
 
 const sub = $sse.pingSse({ q: 'foo' }, {
   onOpen: () => console.log('opened'),
   onMessage: (data) => console.log(data),
   onError: (err) => console.error(err),
 });
 
 // later
 sub.close();
 ```
 
 - Internals:
   - Browser uses native `EventSource` when available.
   - Node/Bun uses `fetch` streaming and parses `data:` frames.
   - Implementation reference: `server/core/bridge.ts:548`.
