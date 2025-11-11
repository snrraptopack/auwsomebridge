import { z } from 'zod';
import { setupBridge, defineRoute, defineHook } from './server/core/bridge';

// Hook that adds metadata to the response
const metadataHook = defineHook({
  name: 'add-metadata',
  after: (ctx) => {
    console.log('[AFTER] Original response:', ctx.response);
    const enhanced = {
      ...ctx.response,
      serverTime: Date.now(),
      version: '1.0.0',
    };
    console.log('[AFTER] Enhanced response:', enhanced);
    return { next: true, response: enhanced };
  },
});

const testRoutes = {
  test: defineRoute({
    method: 'GET',
    output: z.object({
      message: z.string(),
      serverTime: z.number(),
      version: z.string(),
    }),
    hooks: [metadataHook],
    handler: async () => {
      console.log('[HANDLER] Returning base response');
      return { message: 'Hello', serverTime: 0, version: '' };
    },
  }),
};

const { middleware } = setupBridge(testRoutes, {
  runtime: 'bun',
  prefix: '/api',
  validateResponses: true,
});

Bun.serve({
  port: 3005,
  fetch: middleware,
});

console.log('🚀 After hook test server at http://localhost:3005');
console.log('Test: curl http://localhost:3005/api/test');
