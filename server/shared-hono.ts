import { composeRoutes, setupBridge } from './core/bridge';
import { userRoutes } from './routes/user';
import { healthRoutes } from './routes/health';
import { standardRateLimit, loggerHook } from './hooks';

// Compose all route collections
export const allRoutes = composeRoutes(userRoutes, healthRoutes);

// Setup bridge with Hono runtime explicitly
export const { middleware, metadata } = setupBridge(allRoutes, {
  runtime: 'hono', // Explicitly use Hono
  prefix: '/api',
  validateResponses: true,
  logRequests: false,
  hooks: [standardRateLimit, loggerHook],
});
