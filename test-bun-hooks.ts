import { z } from 'zod';
import { setupBridge, defineRoute, defineHook } from './server/core/bridge';

// Define a test hook with all lifecycle phases
const testHook = defineHook({
  name: 'test-lifecycle',
  before: (ctx) => {
    console.log(`[BEFORE] ${ctx.method} ${ctx.route}`);
    ctx.context.startTime = Date.now();
    return { next: true };
  },
  after: (ctx) => {
    console.log(`[AFTER] ${ctx.method} ${ctx.route} - Response:`, ctx.response);
    return { next: true };
  },
  cleanup: (ctx) => {
    const duration = Date.now() - ctx.context.startTime;
    console.log(`[CLEANUP] ${ctx.method} ${ctx.route} - Duration: ${duration}ms - Success: ${ctx.success}`);
    return { next: true };
  },
});

// Define routes
const testRoutes = {
  test: defineRoute({
    method: 'GET',
    output: z.object({ message: z.string() }),
    hooks: [testHook],
    handler: async () => {
      console.log('[HANDLER] Executing handler');
      return { message: 'Hook test successful' };
    },
  }),
};

// Setup bridge with Bun runtime
const { middleware } = setupBridge(testRoutes, {
  runtime: 'bun',
  prefix: '/api',
  validateResponses: true,
  logRequests: true,
});

// Start Bun server
Bun.serve({
  port: 3002,
  fetch: middleware,
});

console.log('🚀 Bun hooks test server running at http://localhost:3002');
console.log('Test endpoint: GET http://localhost:3002/api/test');
