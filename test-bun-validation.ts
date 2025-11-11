import { z } from 'zod';
import { setupBridge, defineRoute } from './server/core/bridge';

// Define routes with validation
const testRoutes = {
  // This should fail output validation
  invalidOutput: defineRoute({
    method: 'GET',
    output: z.object({ name: z.string(), age: z.number() }),
    handler: async () => {
      // Return wrong type - age should be number
      return { name: 'John', age: 'not a number' } as any;
    },
  }),

  // This should pass
  validOutput: defineRoute({
    method: 'GET',
    output: z.object({ name: z.string(), age: z.number() }),
    handler: async () => {
      return { name: 'John', age: 30 };
    },
  }),
};

// Setup bridge with output validation enabled
const { middleware } = setupBridge(testRoutes, {
  runtime: 'bun',
  prefix: '/api',
  validateResponses: true,
  logRequests: true,
});

Bun.serve({
  port: 3003,
  fetch: middleware,
});

console.log('🚀 Validation test server at http://localhost:3003');
console.log('  GET http://localhost:3003/api/invalidOutput (should fail)');
console.log('  GET http://localhost:3003/api/validOutput (should succeed)');
