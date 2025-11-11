import { describe, test, expect } from 'bun:test';
import { defineHook } from '../hooks';
import type { HookContext, LifecycleHook, BeforeHook } from '../types';

describe('defineHook', () => {
  describe('lifecycle hook creation without setup', () => {
    test('creates lifecycle hook with before method', () => {
      const hook = defineHook({
        name: 'test-before',
        before: (ctx) => {
          ctx.context.beforeRan = true;
          return { next: true };
        },
      });

      expect(hook).toHaveProperty('__isLifecycleHook', true);
      expect(hook).toHaveProperty('__hookName', 'test-before');
      expect((hook as LifecycleHook).before).toBeFunction();
    });

    test('creates lifecycle hook with after method', () => {
      const hook = defineHook({
        name: 'test-after',
        after: (ctx) => {
          return { next: true, response: { ...ctx.response, modified: true } };
        },
      });

      expect(hook).toHaveProperty('__isLifecycleHook', true);
      expect((hook as LifecycleHook).after).toBeFunction();
    });

    test('creates lifecycle hook with cleanup method', () => {
      const hook = defineHook({
        name: 'test-cleanup',
        cleanup: (ctx) => {
          return { next: true };
        },
      });

      expect(hook).toHaveProperty('__isLifecycleHook', true);
      expect((hook as LifecycleHook).cleanup).toBeFunction();
    });

    test('creates lifecycle hook with all methods', () => {
      const hook = defineHook({
        name: 'test-all',
        before: (ctx) => ({ next: true }),
        after: (ctx) => ({ next: true }),
        cleanup: (ctx) => ({ next: true }),
      });

      expect(hook).toHaveProperty('__isLifecycleHook', true);
      expect((hook as LifecycleHook).before).toBeFunction();
      expect((hook as LifecycleHook).after).toBeFunction();
      expect((hook as LifecycleHook).cleanup).toBeFunction();
    });
  });

  describe('lifecycle hook creation with setup', () => {
    test('creates lifecycle hook factory with state', () => {
      const createHook = defineHook({
        name: 'test-with-state',
        setup: (config: { value: number }) => ({ value: config.value }),
        before: (ctx, state) => {
          ctx.context.stateValue = state.value;
          return { next: true };
        },
      });

      const hook = createHook({ value: 42 });
      expect(hook).toHaveProperty('__isLifecycleHook', true);
      expect((hook as LifecycleHook).before).toBeFunction();
    });

    test('state is shared across lifecycle methods', async () => {
      const createHook = defineHook({
        name: 'test-shared-state',
        setup: (config: { counter: number }) => ({ counter: config.counter }),
        before: (ctx, state) => {
          state.counter++;
          return { next: true };
        },
        after: (ctx, state) => {
          state.counter++;
          return { next: true, response: { counter: state.counter } };
        },
      });

      const hook = createHook({ counter: 0 }) as LifecycleHook;
      
      const mockCtx: HookContext = {
        req: {} as any,
        platform: {} as any,
        method: 'GET',
        route: 'test',
        input: {},
        context: {},
      };

      // Execute before
      await hook.before!(mockCtx);
      
      // Execute after
      const result = await hook.after!({ ...mockCtx, response: {} });
      
      // Counter should be 2 (incremented in both phases)
      expect(result).toHaveProperty('response');
      expect((result as any).response.counter).toBe(2);
    });
  });

  describe('legacy hook backward compatibility', () => {
    test('creates legacy hook with handler', () => {
      const hook = defineHook({
        name: 'legacy-hook',
        handler: (ctx) => {
          ctx.context.legacyRan = true;
          return { next: true };
        },
      });

      // Legacy hooks are functions, not lifecycle objects
      expect(typeof hook).toBe('function');
      expect(hook).not.toHaveProperty('__isLifecycleHook');
    });

    test('legacy hook with setup returns factory', () => {
      const createHook = defineHook({
        name: 'legacy-with-setup',
        setup: (config: { max: number }) => ({ counter: 0, max: config.max }),
        handler: (ctx, state) => {
          state.counter++;
          if (state.counter > state.max) {
            return { next: false, status: 429, error: 'Too many requests' };
          }
          return { next: true };
        },
      });

      const hook = createHook({ max: 5 });
      expect(typeof hook).toBe('function');
    });

    test('legacy hook executes correctly', async () => {
      const hook = defineHook({
        name: 'legacy-test',
        handler: (ctx) => {
          ctx.context.value = 'test';
          return { next: true };
        },
      });

      const mockCtx: HookContext = {
        req: {} as any,
        platform: {} as any,
        method: 'GET',
        route: 'test',
        input: {},
        context: {},
      };

      // Legacy hooks are functions
      if (typeof hook === 'function') {
        const result = await hook(mockCtx);
        
        expect(result).toEqual({ next: true });
        expect(mockCtx.context.value).toBe('test');
      }
    });
  });

  describe('error handling', () => {
    test('throws error when no handler or lifecycle methods provided', () => {
      expect(() => {
        defineHook({
          name: 'invalid-hook',
        } as any);
      }).toThrow();
    });

    test('throws error when setup provided but no handler or lifecycle methods', () => {
      expect(() => {
        const createHook = defineHook({
          name: 'invalid-with-setup',
          setup: () => ({}),
        } as any) as any;
        createHook();
      }).toThrow();
    });
  });
});

