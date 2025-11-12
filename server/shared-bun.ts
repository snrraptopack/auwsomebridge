import { composeRoutes, setupBridge } from './core/bridge';
import { userRoutes } from './routes/user';
import { healthRoutes } from './routes/health';
import { standardRateLimit, loggerHook } from './hooks';

// Compose all route collections
export const allRoutes = composeRoutes(userRoutes, healthRoutes);

// Setup bridge with Bun runtime explicitly
export const { $api,$sse,middleware, metadata } = setupBridge(allRoutes, {
  runtime: 'bun', // Explicitly use Bun
  prefix: '/api',
  validateResponses: true,
  logRequests: false,
  hooks: [standardRateLimit, loggerHook],
});


