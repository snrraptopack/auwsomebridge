# Hooks

Hooks provide composable, cross-cutting behavior across all routes, identical in Express and Hono. They can authenticate, rate limit, log, cache, or enforce permissions, and they populate a mutable `context` object used by handlers.

## What Is a Hook?

Hooks come in two forms:

1. **Legacy Hooks** (backward compatible): A function that receives a `HookContext` and returns a `HookResult`
2. **Lifecycle Hooks** (new): An object with optional `before`, `after`, and `cleanup` methods

Both types can:
  - Read normalized request data via `ctx.req` (method, headers, body, query, params, ip, url).
  - Access native runtime via `ctx.platform`:
    - Hono: `ctx.platform.c` is the Hono `Context` (`c.env`, `c.req`, `c.req.raw`, `c.executionCtx`).
    - Express: `ctx.platform.req`/`ctx.platform.res` are the native Express objects.
  - Read/modify `ctx.context` (shared, mutable object passed to the final handler). `context.platform` mirrors `ctx.platform` for handlers.
  - Short-circuit the chain with an error or an early success response (before/after hooks only).
  - Continue to the next hook/handler.

## Lifecycle Phases

Hooks can now execute at three different phases:

1. **Before**: Executes before the route handler
   - Can short-circuit execution
   - Can return early response (skips handler)
   - Can modify context for handler

2. **After**: Executes after the route handler succeeds
   - Has access to handler response
   - Can transform the response
   - Can short-circuit with error
   - Only runs if handler succeeds

3. **Cleanup**: Always executes at the end
   - Runs regardless of success or failure
   - Has read-only access to outcome
   - Cannot modify response
   - Errors are logged but don't fail the request
   - Perfect for metrics, logging, resource cleanup

## Context Properties by Lifecycle Phase

Each lifecycle phase has access to different context properties:

| Property | Before | After | Cleanup | Description |
|----------|--------|-------|---------|-------------|
| `ctx.req` | ✅ | ✅ | ✅ | Normalized request (method, headers, body, query, params, ip, url) |
| `ctx.platform` | ✅ | ✅ | ✅ | Native platform context (Hono `c` or Express `req`/`res`) |
| `ctx.method` | ✅ | ✅ | ✅ | HTTP method (GET, POST, etc.) |
| `ctx.route` | ✅ | ✅ | ✅ | Route name (e.g., 'getUserById') |
| `ctx.input` | ✅ | ✅ | ✅ | Validated input data from request |
| `ctx.context` | ✅ (read/write) | ✅ (read/write) | ✅ (read-only) | Mutable context object shared across hooks and handler |
| `ctx.response` | ❌ | ✅ | ✅ (if success) | Handler response data |
| `ctx.success` | ❌ | ❌ | ✅ | Whether the request succeeded (boolean) |
| `ctx.error` | ❌ | ❌ | ✅ (if failed) | Error information (`{ status: number, message: string }`) |

### Key Differences:

**Before Hooks:**
- No access to `response` (handler hasn't run yet)
- Can modify `ctx.context` to pass data to handler and other hooks
- Can return early response to skip handler

**After Hooks:**
- Has `ctx.response` with the handler's return value
- Can transform `ctx.response` by returning `{ next: true, response: newData }`
- Can still modify `ctx.context` (though less common)

**Cleanup Hooks:**
- Has `ctx.success` to know if request succeeded or failed
- Has `ctx.response` only if `ctx.success === true`
- Has `ctx.error` only if `ctx.success === false`
- Cannot modify the response (read-only access)
- Should never throw errors (wrap in try-catch)

### Example: Accessing Properties

```typescript
const comprehensiveHook = defineHook({
  name: 'comprehensive',
  before: (ctx) => {
    // ✅ Available: req, platform, method, route, input, context
    console.log('Request:', ctx.method, ctx.route);
    console.log('Input:', ctx.input);
    
    // ❌ Not available: response, success, error
    // console.log(ctx.response); // TypeScript error!
    
    // Store data for later phases
    ctx.context.startTime = Date.now();
    
    return { next: true };
  },
  after: (ctx) => {
    // ✅ Available: req, platform, method, route, input, context, response
    console.log('Response:', ctx.response);
    
    // ❌ Not available: success, error
    // console.log(ctx.success); // TypeScript error!
    
    // Transform response
    return {
      next: true,
      response: {
        data: ctx.response,
        timestamp: Date.now(),
      },
    };
  },
  cleanup: (ctx) => {
    // ✅ Available: req, platform, method, route, input, context, success, error, response
    const duration = Date.now() - ctx.context.startTime;
    
    if (ctx.success) {
      console.log('Success! Response:', ctx.response);
    } else {
      console.log('Failed! Error:', ctx.error?.message);
    }
    
    console.log(`Duration: ${duration}ms`);
    
    return { next: true };
  },
});
```

## HookResult Model

**Before hooks** return one of these shapes:

- Continue:
```
{ next: true }
```

- Early success (skip handler):
```
{ next: true, response: any }
```

- Stop with error:
```
{ next: false, status: number, error: string }
```

**After hooks** return:

- Continue with current response:
```
{ next: true }
```

- Replace response:
```
{ next: true, response: newData }
```

- Stop with error:
```
{ next: false, status: number, error: string }
```

**Cleanup hooks** always return:
```
{ next: true }
```

## Execution Order

The complete execution flow is:

1. **Global before hooks** (configured in `setupBridge`)
2. **Route before hooks** (declared in `defineRoute`)
3. **Route handler** (if all before hooks pass)
4. **Route after hooks** (if handler succeeds)
5. **Global after hooks** (if handler succeeds)
6. **Route cleanup hooks** (always runs)
7. **Global cleanup hooks** (always runs)

Notes:
- If any before hook short-circuits, remaining before hooks and the handler are skipped
- If handler fails, after hooks are skipped
- Cleanup hooks always run, even on errors
- Output validation occurs after all after hooks complete

## Common Built-in Hooks

- `authHook`
  - Validates authorization (e.g., bearer token).
  - Adds `context.userId` and `context.role`.
- `standardRateLimit`
  - Tracks request counts per `ctx.req.ip`.
  - Returns a `429` when limits are exceeded.
  - Does not modify `context`.
- `loggerHook` / `detailedLoggerHook`
  - Records timing and request metadata.
  - May set `context.__loggerStartTime` or similar markers.
- Cache hooks (`createCacheHook`)
  - Compute a cache key (often from `input`, headers, url).
  - Early return cached responses or store fresh results.
- Permission hooks (e.g., `requireAdmin`, `requireRole('...')`)
  - Enforce access policies based on `context.role`.

## Writing Custom Hooks

### Legacy Hook (Backward Compatible)

Example: add request metadata fields for handler consumption

```typescript
import { defineHook } from '../core/shared/hooks';

export const requestMetaHook = defineHook({
  name: 'request-meta',
  handler: async (ctx) => {
    const { headers, ip, url, method } = ctx.req;
    // Copy only what handlers need into context
    ctx.context.request = {
      ip,
      url,
      method,
      userAgent: headers['user-agent'],
    };
    return { next: true };
  },
});
```

### Lifecycle Hook with Before Phase

Example: permission guard (short-circuit on failure)

```typescript
import { defineHook } from '../core/shared/hooks';

export const requireAdmin = defineHook({
  name: 'require-admin',
  before: async (ctx) => {
    const role = ctx.context.role;
    if (role !== 'admin') {
      return { next: false, status: 403, error: 'Admin role required' };
    }
    return { next: true };
  },
});
```

### Lifecycle Hook with Before and After

Example: full cache with before check and after store

```typescript
import { defineHook } from '../core/shared/hooks';

export const createFullCache = defineHook({
  name: 'full-cache',
  setup: (config: { ttl: number }) => {
    const cache = new Map<string, { data: any; expires: number }>();
    return { cache, ttl: config.ttl };
  },
  before: async (ctx, state) => {
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
  after: async (ctx, state) => {
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

const apiCache = createFullCache({ ttl: 300 });
```

### Lifecycle Hook with Before and Cleanup

Example: metrics tracking

```typescript
import { defineHook } from '../core/shared/hooks';

export const metricsHook = defineHook({
  name: 'metrics',
  before: (ctx) => {
    ctx.context.__startTime = Date.now();
    return { next: true };
  },
  cleanup: (ctx) => {
    const duration = Date.now() - ctx.context.__startTime;
    console.log(`${ctx.route}: ${duration}ms - ${ctx.success ? 'success' : 'error'}`);
    return { next: true };
  },
});
```

### Lifecycle Hook with Cleanup Only

Example: audit logging

```typescript
import { defineHook } from '../core/shared/hooks';

export const auditHook = defineHook({
  name: 'audit',
  cleanup: async (ctx) => {
    const logEntry = {
      timestamp: Date.now(),
      route: ctx.route,
      userId: ctx.context.userId || 'anonymous',
      success: ctx.success,
      error: ctx.error?.message,
    };
    
    // Always runs, even on errors
    try {
      await saveAuditLog(logEntry);
    } catch (error) {
      console.error('Failed to save audit log:', error);
      // Don't throw - cleanup hooks must not fail the request
    }
    
    return { next: true };
  },
});
```

### Lifecycle Hook with All Phases

Example: comprehensive request lifecycle management

```typescript
import { defineHook } from '../core/shared/hooks';

export const comprehensiveHook = defineHook({
  name: 'comprehensive',
  setup: (config: { logLevel: string }) => {
    return { logLevel: config.logLevel };
  },
  before: (ctx, state) => {
    console.log(`[${state.logLevel}] Starting ${ctx.route}`);
    ctx.context.__startTime = Date.now();
    return { next: true };
  },
  after: (ctx, state) => {
    console.log(`[${state.logLevel}] Handler completed`);
    // Could transform response here
    return { next: true };
  },
  cleanup: (ctx, state) => {
    const duration = Date.now() - ctx.context.__startTime;
    console.log(`[${state.logLevel}] Finished in ${duration}ms - ${ctx.success ? 'success' : 'error'}`);
    return { next: true };
  },
});
```

### Best Practices

- Prefer small, focused hooks
- Use lifecycle phases appropriately:
  - **Before**: Authentication, validation, caching checks
  - **After**: Response transformation, caching storage
  - **Cleanup**: Metrics, logging, resource cleanup
- Only place data in `ctx.context` that handlers actually use
- Use `ctx.req` for normalized request details; use `ctx.platform` for native features
- Cleanup hooks should never throw errors - wrap in try-catch
- Share state across lifecycle phases using `ctx.context` or closure state

## Platform Access Examples

Example: use native platform for authentication

```
import { defineHook } from '../core/shared/hooks';

export const authGuard = defineHook({
  name: 'auth-guard',
  handler: async (ctx) => {
    if (ctx.platform.type === 'hono') {
      // Access native Hono Context
      const headers = ctx.platform.c.req.raw.headers;
      // e.g., better-auth: await auth.api.getSession({ headers })
    } else {
      // Express native req/res
      const { req } = ctx.platform;
      const authHeader = Array.isArray(req.headers.authorization)
        ? req.headers.authorization[0]
        : req.headers.authorization;
      // e.g., verify token via req headers
    }
    return { next: true };
  },
});
```

## Early Returns and Errors

- Hooks can short-circuit by returning an error result (`{ next: false, status, error }`) or a success result (`{ next: true, response }`).
- When a hook short-circuits, remaining hooks and the handler are skipped.

## Testing Hooks

- Unit test by simulating a minimal `HookContext` and asserting mutations to `ctx.context` or short-circuit behavior.
- Integration test via calling actual endpoints and verifying status codes and response shapes.

## Performance Tips

- Keep hook logic O(1) per request where possible.
- Cache expensive computations and reuse across the hook chain using `ctx.context`.
- Rate limiting per IP should use efficient maps; reset windows periodically.

## Output Schema Validation and After Hooks

Output schema validation occurs **after** all after hooks complete. This allows after hooks to transform responses before validation.

### Pattern 1: Schema-Aware Transformation

Design your output schema to include any fields added by after hooks:

```typescript
// Route with schema that includes wrapper fields
const route = defineRoute({
  output: z.object({
    data: z.object({ id: z.string(), name: z.string() }),
    timestamp: z.number(),
  }),
  hooks: [wrapperHook],
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
    },
  }),
});
```

### Pattern 2: Disable Validation for Wrapped Responses

If you can't modify the schema, disable validation:

```typescript
setupBridge(routes, {
  validateResponses: false, // Disable for all routes
  hooks: [wrapperHook],
});
```

### Pattern 3: Conditional Transformation

Only transform responses when appropriate:

```typescript
const smartWrapperHook = defineHook({
  name: 'smart-wrapper',
  after: (ctx) => {
    // Check if route has output schema
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

## Migration Guide

### Existing Hooks

All existing hooks continue to work without changes. They are treated as before hooks:

```typescript
// This still works exactly as before
const authHook = defineHook({
  name: 'auth',
  handler: async (ctx) => {
    // ... auth logic
    return { next: true };
  },
});
```

### Upgrading to Lifecycle Hooks

To add after or cleanup phases to existing hooks:

**Before (legacy):**
```typescript
const cacheHook = defineHook({
  name: 'cache',
  handler: async (ctx) => {
    // Check cache
    const cached = getFromCache(ctx.route);
    if (cached) return { next: true, response: cached };
    
    // Store key for later (but can't actually cache response)
    ctx.context.__cacheKey = ctx.route;
    return { next: true };
  },
});
```

**After (lifecycle):**
```typescript
const cacheHook = defineHook({
  name: 'cache',
  before: async (ctx) => {
    // Check cache
    const cached = getFromCache(ctx.route);
    if (cached) return { next: true, response: cached };
    
    ctx.context.__cacheKey = ctx.route;
    return { next: true };
  },
  after: async (ctx) => {
    // Now we can actually cache the response!
    const key = ctx.context.__cacheKey;
    if (key) {
      storeInCache(key, ctx.response);
    }
    return { next: true };
  },
});
```

## Best Practices

- Prefer hooks over in-handler logic for cross-cutting concerns and proper status codes
- Use lifecycle phases appropriately for their intended purposes
- Keep `context` fields documented and stable
- Avoid storing large request bodies or headers in `context`; copy only needed fields
- Ensure hooks are deterministic and do not depend on mutable global state
- Cleanup hooks should never throw errors - always wrap in try-catch
- Use after hooks for response transformation, but be mindful of output schema validation

---

See `docs/07-context.md` next for how to type and consume the `context` object in handlers.