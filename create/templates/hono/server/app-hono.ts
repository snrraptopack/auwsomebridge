import { Hono } from 'hono';
import { composeRoutes, setupBridge } from 'auwsomebridge';

// Example route collection (replace with your routes)
import { userRoutes } from './routes/user';

const routes = composeRoutes(userRoutes);
const { middleware } = setupBridge(routes, {
  prefix: '/api',
  validateResponses: true,
  // Explicitly select Hono runtime (optional; autodetect works if hono is installed)
  runtime: 'hono',
});

const app = new Hono();
app.use('/api/:route', middleware);

export default {
  fetch: app.fetch,
};