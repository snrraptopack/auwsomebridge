import { composeRoutes, setupBridge } from 'auwsomebridge';

// Example route collection (replace with your routes)
import { userRoutes } from './routes/user';

const routes = composeRoutes(userRoutes);
const { middleware } = setupBridge(routes, {
  prefix: '/api',
  validateResponses: true,
  // Explicitly select Bun runtime (optional; autodetect works in Bun)
  runtime: 'bun',
});

// Start Bun server with native HTTP
Bun.serve({
  port: 3000,
  fetch: middleware,
});

console.log('🚀 Bun server running at http://localhost:3000');
console.log('API routes available at /api/*');
