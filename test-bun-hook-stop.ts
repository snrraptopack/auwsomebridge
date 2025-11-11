import { z } from 'zod';
import { setupBridge, defineRoute, defineHook } from './server/core/bridge';

// Hook that blocks unauthorized requests
const authHook = defineHook({
  name: 'auth-check',
  before: (ctx) => {
    const authHeader = ctx.req.headers.authorization;
    console.log('[AUTH] Checking authorization:', authHeader);
    
    if (!authHeader || authHeader !== 'Bearer secret-token') {
      console.log('[AUTH] Unauthorized - blocking request');
      return { next: false, status: 401, error: 'Unauthorized' };
    }
    
    console.log('[AUTH] Authorized - allowing request');
    return { next: true };
  },
  cleanup: (ctx) => {
    console.log(`[CLEANUP] Request ${ctx.success ? 'succeeded' : 'failed'}`);
    return { next: true };
  },
});

// Define routes
const testRoutes = {
  protected: defineRoute({
    method: 'GET',
    output: z.object({ message: z.string() }),
    hooks: [authHook],
    handler: async () => {
      console.log('[HANDLER] This should only run if authorized');
      return { message: 'You are authorized!' };
    },
  }),
};

const { middleware } = setupBridge(testRoutes, {
  runtime: 'bun',
  prefix: '/api',
  validateResponses: true,
});

Bun.serve({
  port: 3004,
  fetch: middleware,
});

console.log('🚀 Auth hook test server at http://localhost:3004');
console.log('Test without auth: curl http://localhost:3004/api/protected');
console.log('Test with auth: curl -H "Authorization: Bearer secret-token" http://localhost:3004/api/protected');
