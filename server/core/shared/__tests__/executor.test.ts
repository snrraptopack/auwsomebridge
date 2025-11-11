import { describe, test, expect, beforeEach } from 'bun:test';
import { HookExecutor } from '../executor';
import { defineHook } from '../hooks';
import type { HookContext, RouteHandler } from '../types';

describe('HookExecutor', () => {
  let executor: HookExecutor;
  let mockCtx: HookContext;
  let mockHandler: RouteHandler;

  beforeEach(() => {
    executor = new HookExecutor();
    mockCtx = {
      req: {
        method: 'GET',
        headers: {},
        body: {},
        query: {},
        params: {},
        url: '/test',
      },
      platform: { type: 'hono', c: {} as any },
      method: 'GET',
      route: 'testRoute',
      input: { id: '123' },
      context: {},
    };
    mockHandler = async (input) => ({ result: 'success', input });
  });

  describe('extractLifecycleMethods', () => {
    test('correctly separates lifecycle hooks', async () => {
      const hook1 = defineHook({
        name: 'hook1',
        before: (ctx) => {
          ctx.context.hook1Before = true;
          return { next: true };
        },
        after: (ctx) => {
          ctx.context.hook1After = true;
          return { next: true };
        },
      });

      const hook2 = defineHook({
        name: 'hook2',
        cleanup: (ctx) => {
          ctx.context.hook2Cleanup = true;
          return { next: true };
        },
      });

      const result = await executor.execute([hook1, hook2], mockHandler, mockCtx);

      expect(result.success).toBe(true);
      expect(mockCtx.context.hook1Before).toBe(true);
      expect(mockCtx.context.hook1After).toBe(true);
      expect(mockCtx.context.hook2Cleanup).toBe(true);
    });

    test('treats legacy hooks as before hooks', async () => {
      const legacyHook = defineHook({
        name: 'legacy',
        handler: (ctx) => {
          ctx.context.legacyRan = true;
          return { next: true };
        },
      });

      const result = await executor.execute([legacyHook], mockHandler, mockCtx);

      expect(result.success).toBe(true);
      expect(mockCtx.context.legacyRan).toBe(true);
    });

    test('handles mixed legacy and lifecycle hooks', async () => {
      const legacyHook = defineHook({
        name: 'legacy',
        handler: (ctx) => {
          ctx.context.legacy = true;
          return { next: true };
        },
      });

      const lifecycleHook = defineHook({
        name: 'lifecycle',
        before: (ctx) => {
          ctx.context.before = true;
          return { next: true };
        },
        cleanup: (ctx) => {
          ctx.context.cleanup = true;
          return { next: true };
        },
      });

      const result = await executor.execute([legacyHook, lifecycleHook], mockHandler, mockCtx);

      expect(result.success).toBe(true);
      expect(mockCtx.context.legacy).toBe(true);
      expect(mockCtx.context.before).toBe(true);
      expect(mockCtx.context.cleanup).toBe(true);
    });
  });

  describe('before hook execution', () => {
    test('executes before hooks successfully', async () => {
      const hook = defineHook({
        name: 'before-test',
        before: (ctx) => {
          ctx.context.beforeExecuted = true;
          return { next: true };
        },
      });

      const result = await executor.execute([hook], mockHandler, mockCtx);

      expect(result.success).toBe(true);
      expect(mockCtx.context.beforeExecuted).toBe(true);
    });

    test('short-circuits on before hook error', async () => {
      const hook = defineHook({
        name: 'auth-fail',
        before: (ctx) => {
          return { next: false, status: 401, error: 'Unauthorized' };
        },
      });

      const result = await executor.execute([hook], mockHandler, mockCtx);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(401);
        expect(result.error).toBe('Unauthorized');
      }
    });

    test('returns early response from before hook', async () => {
      const hook = defineHook({
        name: 'cache-hit',
        before: (ctx) => {
          return { next: true, response: { cached: true } };
        },
      });

      const result = await executor.execute([hook], mockHandler, mockCtx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ cached: true });
      }
    });
  });

  describe('after hook execution', () => {
    test('executes after hooks with response', async () => {
      const hook = defineHook({
        name: 'after-test',
        after: (ctx) => {
          expect(ctx.response).toBeDefined();
          return { next: true };
        },
      });

      const result = await executor.execute([hook], mockHandler, mockCtx);

      expect(result.success).toBe(true);
    });

    test('transforms response in after hook', async () => {
      const hook = defineHook({
        name: 'wrapper',
        after: (ctx) => {
          return {
            next: true,
            response: {
              data: ctx.response,
              timestamp: Date.now(),
            },
          };
        },
      });

      const result = await executor.execute([hook], mockHandler, mockCtx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('data');
        expect(result.data).toHaveProperty('timestamp');
      }
    });

    test('chains multiple after hooks', async () => {
      const hook1 = defineHook({
        name: 'wrapper1',
        after: (ctx) => ({
          next: true,
          response: { ...ctx.response, step1: true },
        }),
      });

      const hook2 = defineHook({
        name: 'wrapper2',
        after: (ctx) => ({
          next: true,
          response: { ...ctx.response, step2: true },
        }),
      });

      const result = await executor.execute([hook1, hook2], mockHandler, mockCtx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.step1).toBe(true);
        expect(result.data.step2).toBe(true);
      }
    });

    test('short-circuits on after hook error', async () => {
      const hook = defineHook({
        name: 'validator',
        after: (ctx) => {
          return { next: false, status: 500, error: 'Validation failed' };
        },
      });

      const result = await executor.execute([hook], mockHandler, mockCtx);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(500);
        expect(result.error).toBe('Validation failed');
      }
    });
  });

  describe('cleanup hook execution', () => {
    test('executes cleanup hooks on success', async () => {
      let cleanupRan = false;

      const hook = defineHook({
        name: 'cleanup-test',
        cleanup: (ctx) => {
          cleanupRan = true;
          expect(ctx.success).toBe(true);
          expect(ctx.response).toBeDefined();
          return { next: true };
        },
      });

      await executor.execute([hook], mockHandler, mockCtx);

      expect(cleanupRan).toBe(true);
    });

    test('executes cleanup hooks on before hook error', async () => {
      let cleanupRan = false;

      const beforeHook = defineHook({
        name: 'before-fail',
        before: (ctx) => {
          return { next: false, status: 401, error: 'Unauthorized' };
        },
      });

      const cleanupHook = defineHook({
        name: 'cleanup',
        cleanup: (ctx) => {
          cleanupRan = true;
          expect(ctx.success).toBe(false);
          expect(ctx.error).toBeDefined();
          expect(ctx.error?.status).toBe(401);
          return { next: true };
        },
      });

      await executor.execute([beforeHook, cleanupHook], mockHandler, mockCtx);

      expect(cleanupRan).toBe(true);
    });

    test('executes cleanup hooks on handler error', async () => {
      let cleanupRan = false;

      const failingHandler: RouteHandler = async () => {
        throw new Error('Handler failed');
      };

      const cleanupHook = defineHook({
        name: 'cleanup',
        cleanup: (ctx) => {
          cleanupRan = true;
          expect(ctx.success).toBe(false);
          expect(ctx.error?.message).toBe('Handler failed');
          return { next: true };
        },
      });

      await executor.execute([cleanupHook], failingHandler, mockCtx);

      expect(cleanupRan).toBe(true);
    });

    test('executes cleanup hooks on after hook error', async () => {
      let cleanupRan = false;

      const afterHook = defineHook({
        name: 'after-fail',
        after: (ctx) => {
          return { next: false, status: 500, error: 'After failed' };
        },
      });

      const cleanupHook = defineHook({
        name: 'cleanup',
        cleanup: (ctx) => {
          cleanupRan = true;
          expect(ctx.success).toBe(false);
          expect(ctx.error?.status).toBe(500);
          return { next: true };
        },
      });

      await executor.execute([afterHook, cleanupHook], mockHandler, mockCtx);

      expect(cleanupRan).toBe(true);
    });

    test('cleanup hook errors are isolated', async () => {
      let cleanup1Ran = false;
      let cleanup2Ran = false;

      const cleanup1 = defineHook({
        name: 'cleanup1',
        cleanup: (ctx) => {
          cleanup1Ran = true;
          throw new Error('Cleanup 1 failed');
        },
      });

      const cleanup2 = defineHook({
        name: 'cleanup2',
        cleanup: (ctx) => {
          cleanup2Ran = true;
          return { next: true };
        },
      });

      const result = await executor.execute([cleanup1, cleanup2], mockHandler, mockCtx);

      // Request should still succeed
      expect(result.success).toBe(true);
      // Both cleanup hooks should have run
      expect(cleanup1Ran).toBe(true);
      expect(cleanup2Ran).toBe(true);
    });
  });

  describe('full lifecycle', () => {
    test('executes complete flow: before → handler → after → cleanup', async () => {
      const executionOrder: string[] = [];

      const hook = defineHook({
        name: 'full-lifecycle',
        before: (ctx) => {
          executionOrder.push('before');
          return { next: true };
        },
        after: (ctx) => {
          executionOrder.push('after');
          return { next: true };
        },
        cleanup: (ctx) => {
          executionOrder.push('cleanup');
          return { next: true };
        },
      });

      const handler: RouteHandler = async (input) => {
        executionOrder.push('handler');
        return { result: 'success' };
      };

      await executor.execute([hook], handler, mockCtx);

      expect(executionOrder).toEqual(['before', 'handler', 'after', 'cleanup']);
    });

    test('cleanup runs even when before hook fails', async () => {
      const executionOrder: string[] = [];

      const hook = defineHook({
        name: 'lifecycle-with-error',
        before: (ctx) => {
          executionOrder.push('before');
          return { next: false, status: 401, error: 'Unauthorized' };
        },
        after: (ctx) => {
          executionOrder.push('after');
          return { next: true };
        },
        cleanup: (ctx) => {
          executionOrder.push('cleanup');
          return { next: true };
        },
      });

      await executor.execute([hook], mockHandler, mockCtx);

      // After should not run, but cleanup should
      expect(executionOrder).toEqual(['before', 'cleanup']);
    });

    test('cleanup runs even when handler fails', async () => {
      const executionOrder: string[] = [];

      const hook = defineHook({
        name: 'lifecycle-handler-error',
        before: (ctx) => {
          executionOrder.push('before');
          return { next: true };
        },
        after: (ctx) => {
          executionOrder.push('after');
          return { next: true };
        },
        cleanup: (ctx) => {
          executionOrder.push('cleanup');
          return { next: true };
        },
      });

      const failingHandler: RouteHandler = async () => {
        executionOrder.push('handler');
        throw new Error('Handler failed');
      };

      await executor.execute([hook], failingHandler, mockCtx);

      // After should not run, but cleanup should
      expect(executionOrder).toEqual(['before', 'handler', 'cleanup']);
    });
  });

  describe('combineHooks', () => {
    test('combines global and route hooks in correct order', () => {
      const global1 = defineHook({ name: 'global1', handler: () => ({ next: true }) });
      const global2 = defineHook({ name: 'global2', handler: () => ({ next: true }) });
      const route1 = defineHook({ name: 'route1', handler: () => ({ next: true }) });
      const route2 = defineHook({ name: 'route2', handler: () => ({ next: true }) });

      const combined = executor.combineHooks([global1, global2], [route1, route2]);

      expect(combined).toHaveLength(4);
      expect(combined[0]).toBe(global1);
      expect(combined[1]).toBe(global2);
      expect(combined[2]).toBe(route1);
      expect(combined[3]).toBe(route2);
    });
  });
});

