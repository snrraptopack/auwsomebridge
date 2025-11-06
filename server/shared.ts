import { composeRoutes, setupBridge } from './core/bridge';
import { userRoutes } from './routes/user';
import { healthRoutes } from './routes/health';
import { standardRateLimit, loggerHook } from './hooks';

// Compose all route collections
const allRoutes = composeRoutes(userRoutes, healthRoutes);

// Setup bridge with hooks support
export const { $api, middleware, metadata } = setupBridge(allRoutes, {
  prefix: '/api',
  validateResponses: true,
  logRequests: false, // Using loggerHook instead
  // Global hooks applied to all routes
  hooks: [standardRateLimit, loggerHook],
});