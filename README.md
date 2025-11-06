# auwsomebridge

Unified, runtime-agnostic API bridge for Express and Hono with validation and hooks.

Follow the repository and open the docs to get started:
- Repository: https://github.com/snrraptopack/auwsomebridge
- Docs: see the `docs/` folder in this repo (start with `docs/01-intro.md` and `docs/02-getting-started.md`).

Install (library consumers):
```bash
npm install auwsomebridge zod
# Pick a runtime
npm install express
# or
npm install hono
```

Quick start (Express):
```ts
import express from 'express';
import { composeRoutes, setupBridge, defineRoute } from 'auwsomebridge';

const routes = composeRoutes({
  ping: defineRoute({ method: 'GET', handler: async () => ({ ok: true }) })
});

const { middleware } = setupBridge(routes, { prefix: '/api', runtime: 'express' });

const app = express();
app.use('/api/:route', middleware);
app.listen(3000);
```

Quick start (Hono):
```ts
import { Hono } from 'hono';
import { composeRoutes, setupBridge, defineRoute } from 'auwsomebridge';

const routes = composeRoutes({
  ping: defineRoute({ method: 'GET', handler: async () => ({ ok: true }) })
});

const { middleware } = setupBridge(routes, { prefix: '/api', runtime: 'hono' });

const app = new Hono();
app.use('/api/:route', middleware);
export default { fetch: app.fetch };
```

Notes:
- Runtime auto-detection works if only one of `express` or `hono` is installed; you can force a runtime via `runtime: 'express' | 'hono'`.
- See `docs/03-runtime-adapters.md` and `docs/04-bridge-and-routing.md` for architecture and usage.
