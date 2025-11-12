import { defineHook, defineRoute, setupBridge } from './server/core/bridge';
import { z } from 'zod';

// ❌ WRONG - This will cause issues
const wrongHook = defineHook({
  name: 'wrong',
  before: async (ctx) => {
    console.log('Trying to block...');
    // @ts-expect-error - Missing status and error
    return { next: false }; // TypeScript should error here!
  }
});

// ✅ CORRECT - Properly blocks with status and error
const correctHook = defineHook({
  name: 'correct',
  before: async (ctx) => {
    console.log('Blocking correctly');
    return { 
      next: false, 
      status: 403, 
      error: 'Access denied' 
    };
  }
});

const routes = {
  testWrong: defineRoute({
    method: 'GET',
    hooks: [wrongHook],
    handler: async () => ({ message: 'This should not execute' })
  }),
  
  testCorrect: defineRoute({
    method: 'GET',
    hooks: [correctHook],
    handler: async () => ({ message: 'This should not execute' })
  })
};

const { middleware } = setupBridge(routes, {
  runtime: 'bun',
  prefix: '/api'
});

Bun.serve({
  port: 3010,
  fetch: middleware
});

console.log('Test server running at http://localhost:3010');
console.log('Test wrong hook: curl http://localhost:3010/api/testWrong');
console.log('Test correct hook: curl http://localhost:3010/api/testCorrect');
