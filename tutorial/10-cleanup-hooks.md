# Tutorial 10: Cleanup Hooks

Cleanup hooks **always run**, no matter what happens. They're perfect for logging, metrics, and resource cleanup.

## When Cleanup Hooks Run

Cleanup hooks run in **every** scenario:
- ✅ After successful requests
- ✅ After validation failures
- ✅ After before hook rejections
- ✅ After handler errors
- ✅ After after hook errors

They're guaranteed to execute, making them ideal for cleanup tasks.

## The Cleanup Hook Context

Cleanup hooks get the full picture of what happened:

```typescript
cleanup: async (ctx) => {
  ctx.req        // Request object
  ctx.platform   // Platform info
  ctx.method     // HTTP method
  ctx.route      // Route name
  ctx.input      // Validated input (if validation passed)
  ctx.context    // Shared context
  ctx.success    // NEW: Did the request succeed?
  ctx.response   // NEW: Response data (if success)
  ctx.error      // NEW: Error info (if failed)
}
```

## Example: Request Logging

```typescript
const requestLoggerHook = defineHook({
  name: 'requestLogger',
  cleanup: async (ctx) => {
    const duration = Date.now() - ctx.context.startTime;
    
    if (ctx.success) {
      console.log(`✅ ${ctx.route} completed in ${duration}ms`);
    } else {
      console.log(`❌ ${ctx.route} failed: ${ctx.error?.message}`);
    }
  }
});
```

This logs every request, whether it succeeds or fails.

## Example: Metrics Collection

```typescript
const metricsHook = defineHook({
  name: 'metrics',
  before: async (ctx) => {
    ctx.context.startTime = Date.now();
    return { next: true };
  },
  cleanup: async (ctx) => {
    const duration = Date.now() - ctx.context.startTime;
    
    // Send metrics to your monitoring service
    metrics.record({
      route: ctx.route,
      method: ctx.method,
      duration,
      success: ctx.success,
      statusCode: ctx.success ? 200 : ctx.error?.status
    });
  }
});
```

## Example: Database Connection Cleanup

```typescript
const dbHook = defineHook({
  name: 'database',
  before: async (ctx) => {
    ctx.context.db = await getDbConnection();
    return { next: true };
  },
  cleanup: async (ctx) => {
    // Always close the connection, even if request failed
    if (ctx.context.db) {
      await ctx.context.db.close();
    }
  }
});
```

## Cleanup Hooks Never Fail

If a cleanup hook throws an error, it's logged but doesn't affect the response:

```typescript
const buggyCleanupHook = defineHook({
  name: 'buggy',
  cleanup: async (ctx) => {
    throw new Error('Oops!');
    // Error is logged, but user still gets their response
  }
});
```

The user's response is never affected by cleanup hook errors.

## Full Lifecycle Example

Here's a hook using all three lifecycle methods:

```typescript
const fullLifecycleHook = defineHook({
  name: 'fullLifecycle',
  
  before: async (ctx) => {
    // Set up resources
    ctx.context.startTime = Date.now();
    ctx.context.requestId = crypto.randomUUID();
    console.log(`🚀 Starting ${ctx.route}`);
    return { next: true };
  },
  
  after: async (ctx) => {
    // Modify response
    return {
      next: true,
      response: {
        ...ctx.response,
        requestId: ctx.context.requestId
      }
    };
  },
  
  cleanup: async (ctx) => {
    // Always log and clean up
    const duration = Date.now() - ctx.context.startTime;
    console.log(`✨ Finished ${ctx.route} in ${duration}ms`);
    
    // Clean up any resources
    if (ctx.context.tempFile) {
      await fs.unlink(ctx.context.tempFile);
    }
  }
});
```

## When to Use Each Hook Type

- **Before hooks**: Authentication, validation, rate limiting
- **After hooks**: Response formatting, adding metadata
- **Cleanup hooks**: Logging, metrics, resource cleanup

## What's Next?

You've mastered all three hook types! Next, let's learn about stateful hooks with configuration and state management.

---

**Next:** [11-stateful-hooks.md](./11-stateful-hooks.md)
