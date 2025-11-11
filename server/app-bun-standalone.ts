import { z } from 'zod';
import { setupBridge, defineRoute, defineHook } from './core/bridge';

// Define your routes
const routes = {
  ping: defineRoute({
    method: 'GET',
    output: z.object({ message: z.string() }),
    handler: async () => ({ message: 'pong' }),
  }),

  echo: defineRoute({
    method: 'POST',
    input: z.object({ text: z.string() }),
    output: z.object({ echo: z.string() }),
    handler: async ({ text }) => ({ echo: text }),
  }),
};

// Optional: Add hooks
const loggerHook = defineHook({
  name: 'logger',
  before: (ctx) => {
    console.log(`[${ctx.method}] ${ctx.route}`);
    return { next: true };
  },
});

// Setup bridge with Bun runtime
const { middleware } = setupBridge(routes, {
  runtime: 'bun', // Explicitly use Bun
  prefix: '/api',
  validateResponses: true,
  hooks: [loggerHook],
});

// Start Bun server
Bun.serve({
  port: 3000,
  fetch: middleware,
});

console.log('🚀 Bun server running at http://localhost:3000');
console.log('Routes:');
console.log('  GET  /api/ping');
console.log('  POST /api/echo');
