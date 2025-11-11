# Design Document: Lifecycle Hooks

## Overview

This design extends the existing hook system to support three lifecycle phases: **before**, **after**, and **cleanup**. The current implementation only supports before hooks that execute prior to the route handler. This enhancement enables post-processing, response transformation, guaranteed cleanup, and comprehensive request lifecycle management.

### Key Design Principles

1. **Backward Compatibility**: Existing hooks continue to work without modification
2. **Minimal API Surface**: Leverage existing `defineHook` with optional phase specification
3. **Centralized Execution**: All lifecycle logic lives in `HookExecutor`
4. **Runtime Agnostic**: Works identically in Express and Hono adapters
5. **Type Safety**: Full TypeScript support for all lifecycle phases

## Architecture

### Current Flow

```
Request → Adapter → HookExecutor.execute() → [Before Hooks] → Handler → Response
```

### New Flow

```
Request → Adapter → HookExecutor.execute() → 
  [Before Hooks] → 
  Handler → 
  [After Hooks] → 
  [Cleanup Hooks] → 
  Response
```

### Execution Guarantees

- **Before hooks**: Execute sequentially; any hook can short-circuit
- **Handler**: Executes only if all before hooks pass
- **After hooks**: Execute only if handler succeeds; can transform response
- **Cleanup hooks**: Always execute, even on errors; cannot modify response

## Components and Interfaces

### 1. Hook Phase Type

```typescript
// server/core/shared/types.ts

/**
 * Lifecycle phase for hooks
 */
export type HookPhase = 'before' | 'after' | 'cleanup';
```

### 2. Extended Hook Definition

```typescript
// server/core/shared/types.ts

export type HookDefinition<TConfig = void, TState = any> =
  | {
      name: string;
      setup: (config: TConfig) => TState;
      // NEW: Lifecycle methods (optional)
      before?: (ctx: HookContext, state: TState) => HookResult | Promise<HookResult>;
      after?: (ctx: AfterHookContext, state: TState) => AfterHookResult | Promise<AfterHookResult>;
      cleanup?: (ctx: CleanupHookContext, state: TState) => CleanupHookResult | Promise<CleanupHookResult>;
      // Legacy: single handler (backward compat, treated as 'before')
      handler?: (ctx: HookContext, state: TState) => HookResult | Promise<HookResult>;
    }
  | {
      name: string;
      setup?: never;
      // NEW: Lifecycle methods (optional)
      before?: (ctx: HookContext) => HookResult | Promise<HookResult>;
      after?: (ctx: AfterHookContext) => AfterHookResult | Promise<AfterHookResult>;
      cleanup?: (ctx: CleanupHookContext) => CleanupHookResult | Promise<CleanupHookResult>;
      // Legacy: single handler (backward compat, treated as 'before')
      handler?: (ctx: HookContext) => HookResult | Promise<HookResult>;
    };
```

### 3. After Hook Context

After hooks need access to the handler response:

```typescript
// server/core/shared/types.ts

/**
 * Context for after hooks with response data
 */
export interface AfterHookContext<TContext = Record<string, any>> extends HookContext<TContext> {
  /** Handler response data */
  response: any;
}

/**
 * Result from after hooks
 */
export type AfterHookResult =
  | { next: true } // Continue with current response
  | { next: true; response: any } // Replace response
  | { next: false; status: number; error: string }; // Error
```

### 4. Cleanup Hook Context

Cleanup hooks need read-only access to the outcome:

```typescript
// server/core/shared/types.ts

/**
 * Context for cleanup hooks with outcome information
 */
export interface CleanupHookContext<TContext = Record<string, any>> extends HookContext<TContext> {
  /** Whether the request succeeded */
  success: boolean;
  /** Final response data (if successful) */
  response?: any;
  /** Error information (if failed) */
  error?: {
    status: number;
    message: string;
  };
}

/**
 * Result from cleanup hooks (cannot modify response)
 */
export type CleanupHookResult = { next: true };
```

### 5. Typed Hook Functions

```typescript
// server/core/shared/types.ts

export type BeforeHook = (ctx: HookContext) => HookResult | Promise<HookResult>;
export type AfterHook = (ctx: AfterHookContext) => AfterHookResult | Promise<AfterHookResult>;
export type CleanupHook = (ctx: CleanupHookContext) => CleanupHookResult | Promise<CleanupHookResult>;

/**
 * Union type for all hook types
 */
export type RouteHook = BeforeHook | AfterHook | CleanupHook;
```

### 6. Lifecycle Hook Wrapper

A lifecycle hook is an object that contains the lifecycle methods:

```typescript
// server/core/shared/types.ts

/**
 * A hook with lifecycle methods
 */
export interface LifecycleHook {
  __hookName: string;
  __isLifecycleHook: true;
  before?: BeforeHook;
  after?: AfterHook;
  cleanup?: CleanupHook;
}

/**
 * Union type: either a simple hook (backward compat) or lifecycle hook
 */
export type RouteHook = BeforeHook | LifecycleHook;
```

### 7. Updated defineHook

```typescript
// server/core/shared/hooks.ts

export function defineHook<TConfig = void, TState = any>(
  definition: HookDefinition<TConfig, TState>
): TConfig extends void ? RouteHook : (config: TConfig) => RouteHook {
  
  // Check if this is a lifecycle hook (has before/after/cleanup) or legacy hook (has handler)
  const isLifecycleHook = !!(definition.before || definition.after || definition.cleanup);
  const isLegacyHook = !!definition.handler;
  
  if (!definition.setup) {
    // No setup function - simple hook
    if (isLifecycleHook) {
      // Return lifecycle hook object
      const lifecycleHook: LifecycleHook = {
        __hookName: definition.name,
        __isLifecycleHook: true,
        before: definition.before,
        after: definition.after,
        cleanup: definition.cleanup,
      };
      return lifecycleHook as any;
    } else {
      // Legacy hook - single handler defaults to 'before'
      const hook: BeforeHook = (ctx: HookContext) => definition.handler!(ctx);
      return hook as any;
    }
  }

  // Has setup function - return factory
  const factory = (config: TConfig): RouteHook => {
    const state = definition.setup!(config);
    
    if (isLifecycleHook) {
      // Create lifecycle hook with state closure
      const lifecycleHook: LifecycleHook = {
        __hookName: definition.name,
        __isLifecycleHook: true,
        before: definition.before ? (ctx) => definition.before!(ctx, state) : undefined,
        after: definition.after ? (ctx) => definition.after!(ctx, state) : undefined,
        cleanup: definition.cleanup ? (ctx) => definition.cleanup!(ctx, state) : undefined,
      };
      return lifecycleHook;
    } else {
      // Legacy hook with state
      const hook: BeforeHook = (ctx: HookContext) => definition.handler!(ctx, state);
      return hook;
    }
  };

  return factory as any;
}
```

### 8. Updated HookExecutor

The executor needs to:
1. Extract lifecycle methods from hooks
2. Execute before hooks → handler → after hooks → cleanup hooks
3. Handle errors at each stage
4. Ensure cleanup hooks always run

```typescript
// server/core/shared/executor.ts

export class HookExecutor {
  /**
   * Checks if a hook is a lifecycle hook
   */
  private isLifecycleHook(hook: RouteHook): hook is LifecycleHook {
    return typeof hook === 'object' && '__isLifecycleHook' in hook;
  }

  /**
   * Extracts lifecycle methods from hooks
   */
  private extractLifecycleMethods(hooks: RouteHook[]): {
    before: BeforeHook[];
    after: AfterHook[];
    cleanup: CleanupHook[];
  } {
    const before: BeforeHook[] = [];
    const after: AfterHook[] = [];
    const cleanup: CleanupHook[] = [];

    for (const hook of hooks) {
      if (this.isLifecycleHook(hook)) {
        // Lifecycle hook - extract each phase
        if (hook.before) before.push(hook.before);
        if (hook.after) after.push(hook.after);
        if (hook.cleanup) cleanup.push(hook.cleanup);
      } else {
        // Legacy hook - treat as before hook
        before.push(hook as BeforeHook);
      }
    }

    return { before, after, cleanup };
  }

  /**
   * Executes before hooks
   */
  private async executeBeforeHooks(
    hooks: RouteHook[],
    ctx: HookContext
  ): Promise<
    | { success: true }
    | { success: true; earlyResponse: any }
    | { success: false; status: number; error: string }
  > {
    for (const hook of hooks) {
      try {
        const result = await hook(ctx);

        if (!result.next) {
          return {
            success: false,
            status: result.status,
            error: result.error,
          };
        }

        if ('response' in result) {
          return {
            success: true,
            earlyResponse: result.response,
          };
        }
      } catch (error) {
        console.error(`Before hook error:`, error);
        return {
          success: false,
          status: 500,
          error: error instanceof Error ? error.message : 'Hook execution failed',
        };
      }
    }

    return { success: true };
  }

  /**
   * Executes after hooks with response data
   */
  private async executeAfterHooks(
    hooks: RouteHook[],
    ctx: HookContext,
    response: any
  ): Promise<
    | { success: true; response: any }
    | { success: false; status: number; error: string }
  > {
    let currentResponse = response;

    for (const hook of hooks) {
      try {
        const afterCtx: AfterHookContext = {
          ...ctx,
          response: currentResponse,
        };

        const result = await hook(afterCtx as any);

        if (!result.next) {
          return {
            success: false,
            status: result.status,
            error: result.error,
          };
        }

        // Update response if hook modified it
        if ('response' in result) {
          currentResponse = result.response;
        }
      } catch (error) {
        console.error(`After hook error:`, error);
        return {
          success: false,
          status: 500,
          error: error instanceof Error ? error.message : 'After hook execution failed',
        };
      }
    }

    return { success: true, response: currentResponse };
  }

  /**
   * Executes cleanup hooks (always runs, errors are logged but don't stop execution)
   */
  private async executeCleanupHooks(
    hooks: RouteHook[],
    ctx: HookContext,
    outcome: {
      success: boolean;
      response?: any;
      error?: { status: number; message: string };
    }
  ): Promise<void> {
    for (const hook of hooks) {
      try {
        const cleanupCtx: CleanupHookContext = {
          ...ctx,
          success: outcome.success,
          response: outcome.response,
          error: outcome.error,
        };

        await hook(cleanupCtx as any);
      } catch (error) {
        // Log but don't throw - cleanup hooks must not fail the request
        console.error(`Cleanup hook error (non-fatal):`, error);
      }
    }
  }

  /**
   * Main execution method with lifecycle support
   */
  async execute(
    hooks: RouteHook[],
    handler: RouteHandler<any, any, any>,
    ctx: HookContext
  ): Promise<{ success: true; data: any } | { success: false; status: number; error: string }> {
    // Extract lifecycle methods from hooks
    const { before, after, cleanup } = this.extractLifecycleMethods(hooks);

    let outcome: {
      success: boolean;
      response?: any;
      error?: { status: number; message: string };
    } = { success: false };

    try {
      // 1. Execute before hooks
      const beforeResult = await this.executeBeforeHooks(before, ctx);

      if (!beforeResult.success) {
        outcome = {
          success: false,
          error: {
            status: beforeResult.status,
            message: beforeResult.error,
          },
        };
        return { success: false, status: beforeResult.status, error: beforeResult.error };
      }

      // Check for early response from before hooks
      if ('earlyResponse' in beforeResult) {
        outcome = {
          success: true,
          response: beforeResult.earlyResponse,
        };
        return { success: true, data: beforeResult.earlyResponse };
      }

      // 2. Execute handler
      let handlerResponse: any;
      try {
        handlerResponse = await handler(ctx.input, ctx.context);
      } catch (error) {
        console.error(`Handler execution error:`, error);
        outcome = {
          success: false,
          error: {
            status: 500,
            message: error instanceof Error ? error.message : 'Handler execution failed',
          },
        };
        return {
          success: false,
          status: 500,
          error: error instanceof Error ? error.message : 'Handler execution failed',
        };
      }

      // 3. Execute after hooks
      const afterResult = await this.executeAfterHooks(after, ctx, handlerResponse);

      if (!afterResult.success) {
        outcome = {
          success: false,
          error: {
            status: afterResult.status,
            message: afterResult.error,
          },
        };
        return { success: false, status: afterResult.status, error: afterResult.error };
      }

      // Success!
      outcome = {
        success: true,
        response: afterResult.response,
      };
      return { success: true, data: afterResult.response };
    } finally {
      // 4. Always execute cleanup hooks
      await this.executeCleanupHooks(cleanup, ctx, outcome);
    }
  }

  combineHooks(globalHooks: RouteHook[] = [], routeHooks: RouteHook[] = []): RouteHook[] {
    return [...globalHooks, ...routeHooks];
  }
}
```

## Data Models

### Lifecycle Hook Structure

Lifecycle hooks are objects with optional lifecycle methods:

```typescript
interface LifecycleHook {
  __hookName: string;
  __isLifecycleHook: true;
  before?: (ctx: HookContext) => HookResult | Promise<HookResult>;
  after?: (ctx: AfterHookContext) => AfterHookResult | Promise<AfterHookResult>;
  cleanup?: (ctx: CleanupHookContext) => CleanupHookResult | Promise<CleanupHookResult>;
}
```

This approach:
- Groups related lifecycle logic together
- Maintains backward compatibility (legacy hooks are functions)
- Allows sharing state across lifecycle phases via closure
- Clear separation between lifecycle and legacy hooks

## Error Handling

### Before Hook Errors
- Stop execution immediately
- Return error to client
- Skip handler and after hooks
- Still execute cleanup hooks

### Handler Errors
- Stop execution immediately
- Return error to client
- Skip after hooks
- Still execute cleanup hooks

### After Hook Errors
- Stop execution immediately
- Return error to client (overrides handler response)
- Still execute cleanup hooks

### Cleanup Hook Errors
- Log error but continue
- Execute remaining cleanup hooks
- Do not affect response to client

## Output Schema Validation

### Validation Timing
Output schema validation occurs **after** all after hooks complete. This ensures:
1. After hooks can transform the response
2. The final response is validated against the schema
3. Schema validation failures are caught before sending to client

### After Hook Response Transformation
After hooks can modify the response in two ways:

1. **Replace entire response**: Return `{ next: true, response: newData }`
   - The new response must match the output schema
   - Validation will check the transformed response

2. **Wrap response**: Return `{ next: true, response: { data: ctx.response, ...metadata } }`
   - If wrapping adds fields, the output schema must account for them
   - Or disable output validation for that route

### Recommended Patterns

**Pattern 1: Schema-aware transformation**
```typescript
// Route with schema that includes metadata
const route = defineRoute({
  output: z.object({
    data: z.object({ id: z.string(), name: z.string() }),
    timestamp: z.number(),
    requestId: z.string(),
  }),
  handler: async ({ id }) => {
    // Handler returns just the data
    return { id, name: 'John' };
  },
});

// After hook wraps with metadata
const wrapperHook = defineHook({
  name: 'wrapper',
  after: (ctx) => ({
    next: true,
    response: {
      data: ctx.response,
      timestamp: Date.now(),
      requestId: ctx.context.requestId,
    },
  }),
});
```

**Pattern 2: Disable validation for wrapped responses**
```typescript
// Route without output validation
const route = defineRoute({
  output: z.object({ id: z.string(), name: z.string() }),
  handler: async ({ id }) => ({ id, name: 'John' }),
});

// Setup bridge with validation disabled
setupBridge(routes, {
  validateResponses: false, // Disable for all routes
  hooks: [wrapperHook],
});
```

**Pattern 3: Conditional wrapping**
```typescript
const smartWrapperHook = defineHook({
  name: 'smart-wrapper',
  after: (ctx) => {
    // Only wrap if route doesn't have output schema
    const hasOutputSchema = ctx.context.__hasOutputSchema;
    
    if (!hasOutputSchema) {
      return {
        next: true,
        response: {
          data: ctx.response,
          timestamp: Date.now(),
        },
      };
    }
    
    // Don't modify if schema exists
    return { next: true };
  },
});
```

### Implementation Note
The adapters will need to pass output schema information to the executor so after hooks can make informed decisions about response transformation.

## Testing Strategy

### Unit Tests

1. **Hook Phase Separation**
   - Test `separateHooksByPhase` correctly categorizes hooks
   - Test default phase is 'before'
   - Test mixed hook arrays

2. **Before Hook Execution**
   - Test successful execution
   - Test short-circuit on error
   - Test early response

3. **After Hook Execution**
   - Test response transformation
   - Test multiple after hooks chaining
   - Test error handling

4. **Cleanup Hook Execution**
   - Test execution on success
   - Test execution on error
   - Test error isolation (one cleanup error doesn't stop others)

5. **Full Lifecycle**
   - Test complete flow: before → handler → after → cleanup
   - Test cleanup runs on before hook error
   - Test cleanup runs on handler error
   - Test cleanup runs on after hook error

### Integration Tests

1. **Express Adapter**
   - Test lifecycle hooks with Express routes
   - Test response transformation
   - Test cleanup execution

2. **Hono Adapter**
   - Test lifecycle hooks with Hono routes
   - Test response transformation
   - Test cleanup execution

3. **Real-World Scenarios**
   - Cache hook (before: check cache, after: store response)
   - Metrics hook (before: start timer, cleanup: record duration)
   - Audit hook (cleanup: log request outcome)

## Example Usage

### Response Caching (Before + After)

```typescript
export const createFullCacheHook = defineHook({
  name: 'full-cache',
  setup: (config: { ttl: number }) => {
    const cache = new Map<string, { data: any; expires: number }>();
    return { cache, ttl: config.ttl };
  },
  before: (ctx, state) => {
    const key = `${ctx.route}:${JSON.stringify(ctx.input)}`;
    const cached = state.cache.get(key);
    
    if (cached && cached.expires > Date.now()) {
      // Return cached response, skip handler
      return { next: true, response: cached.data };
    }
    
    // Store key for after hook
    ctx.context.__cacheKey = key;
    return { next: true };
  },
  after: (ctx, state) => {
    const key = ctx.context.__cacheKey;
    if (key) {
      state.cache.set(key, {
        data: ctx.response,
        expires: Date.now() + state.ttl * 1000,
      });
    }
    return { next: true };
  },
});

// Usage
const shortCache = createFullCacheHook({ ttl: 60 });
const longCache = createFullCacheHook({ ttl: 3600 });
```

### Request Metrics (Before + Cleanup)

```typescript
export const metricsHook = defineHook({
  name: 'metrics',
  before: (ctx) => {
    ctx.context.__metricsStart = Date.now();
    return { next: true };
  },
  cleanup: (ctx) => {
    const duration = Date.now() - (ctx.context.__metricsStart || 0);
    const status = ctx.success ? 'success' : 'error';
    
    console.log(`[METRICS] ${ctx.route} - ${status} - ${duration}ms`);
    
    // Could send to metrics service here
    // recordMetric({ route: ctx.route, duration, status });
    
    return { next: true };
  },
});
```

### Response Transformation (After)

```typescript
export const addTimestampHook = defineHook({
  name: 'add-timestamp',
  after: (ctx) => {
    // Wrap response with metadata
    return {
      next: true,
      response: {
        data: ctx.response,
        timestamp: Date.now(),
        requestId: ctx.context.requestId,
      },
    };
  },
});
```

### Audit Logging (Cleanup)

```typescript
export const auditHook = defineHook({
  name: 'audit',
  cleanup: async (ctx) => {
    const logEntry = {
      timestamp: Date.now(),
      route: ctx.route,
      method: ctx.method,
      userId: ctx.context.userId || 'anonymous',
      success: ctx.success,
      status: ctx.error?.status,
      ip: ctx.req.ip,
    };
    
    // Store in audit log (never fails the request)
    try {
      await saveAuditLog(logEntry);
    } catch (error) {
      console.error('Failed to save audit log:', error);
    }
    
    return { next: true };
  },
});
```

### All Lifecycle Phases Together

```typescript
export const comprehensiveHook = defineHook({
  name: 'comprehensive',
  setup: (config: { logLevel: string }) => {
    return { logLevel: config.logLevel, startTime: 0 };
  },
  before: (ctx, state) => {
    state.startTime = Date.now();
    console.log(`[${state.logLevel}] Starting ${ctx.route}`);
    return { next: true };
  },
  after: (ctx, state) => {
    console.log(`[${state.logLevel}] Handler completed for ${ctx.route}`);
    // Could transform response here
    return { next: true };
  },
  cleanup: (ctx, state) => {
    const duration = Date.now() - state.startTime;
    console.log(`[${state.logLevel}] Finished ${ctx.route} in ${duration}ms - ${ctx.success ? 'success' : 'error'}`);
    return { next: true };
  },
});
```

## Migration Path

### Existing Hooks
All existing hooks continue to work without changes. They default to 'before' phase.

### Gradual Adoption
Developers can:
1. Keep using existing hooks as-is
2. Add new after/cleanup hooks alongside existing hooks
3. Gradually refactor hooks to use lifecycle phases where beneficial

### No Breaking Changes
- `defineHook` signature remains compatible
- `RouteHook` type remains compatible
- `HookContext` remains compatible
- Existing hook execution behavior unchanged
