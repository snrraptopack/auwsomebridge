import { composeRoutes, setupBridge } from './core/bridge';
import { userRoutes } from './routes/user';
import { healthRoutes } from './routes/health';
import { chatRoutes } from './routes/chat';
import { standardRateLimit, loggerHook } from './hooks';


export const allRoutes = composeRoutes(userRoutes, healthRoutes, chatRoutes);


export const { $api, $sse, $ws, middleware, metadata } = setupBridge(allRoutes, {
  runtime: 'bun', // Explicitly use Bun
  prefix: '/api',
  validateResponses: true,
  logRequests: false,
  hooks: [standardRateLimit, loggerHook],
});

