import { setupBridge } from "./core/bridge";
import { composeRoutes } from "./core/bridge";
import { userRoutes } from "./routes/user";
import { healthRoutes } from "./routes/health";

// Compose routes without runtime-specific config
const allRoutes = composeRoutes(userRoutes, healthRoutes);

// Setup bridge for client-side API calls only
// No runtime/middleware needed for client
export const { $api, $sse } = setupBridge(allRoutes, {
  prefix: '/api',
  baseUrl: '/api', // Use relative URL for same-origin requests
});
