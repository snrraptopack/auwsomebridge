import { composeRoutes, setupBridge } from './core/bridge';
import { userRoutes } from './routes/user';
import { healthRoutes } from './routes/health';

// Compose all route collections
const allRoutes = composeRoutes(userRoutes, healthRoutes);

// Setup bridge and export the typed client for frontend usage
export const { $api, middleware, metadata } = setupBridge(allRoutes, {
  prefix: '/api',
  validateResponses: true,
  logRequests: true,
  defaultAuthMiddleware: async (req, input) => {
    const token = req.headers.authorization?.split(' ')[1];
    return {
      authorized: !!token,
      context: { userId: 'user-123', token },
    };
  },
});