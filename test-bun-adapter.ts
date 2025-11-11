import { z } from 'zod';
import { setupBridge, defineRoute } from './server/core/bridge';

// Define simple test routes
const testRoutes = {
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

  getUser: defineRoute({
    method: 'GET',
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string(), name: z.string() }),
    handler: async ({ id }) => ({ id, name: 'Test User' }),
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
  port: 3001,
  fetch: middleware,
});

console.log('🚀 Bun adapter test server running at http://localhost:3001');
console.log('Test endpoints:');
console.log('  GET  http://localhost:3001/api/ping');
console.log('  POST http://localhost:3001/api/echo (body: {"text": "hello"})');
console.log('  GET  http://localhost:3001/api/getUser?id=123');
