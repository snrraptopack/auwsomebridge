import { Hono } from 'hono';
import type { EnvBindings } from './types/env';
import { middleware } from './shared';

const app = new Hono<{ Bindings: EnvBindings }>();

// Mount the bridge middleware at /api/:route
app.use('/api/:route', middleware);

const port = 3000;

console.log(`API server listening at http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
