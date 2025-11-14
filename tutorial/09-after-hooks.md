# Tutorial 09: After Hooks

After hooks run **after** your handler completes successfully. They can modify responses or perform cleanup.

## When After Hooks Run

After hooks only run if:
- ✅ Input validation passed
- ✅ Before hooks allowed the request
- ✅ Handler completed without errors

If any step fails, after hooks are skipped.

## The After Hook Context

After hooks get additional information:

```typescript
after: async (ctx) => {
  ctx.req        // Same as before hooks
  ctx.platform   // Same as before hooks
  ctx.method     // Same as before hooks
  ctx.route      // Same as before hooks
  ctx.input      // Same as before hooks
  ctx.context    // Same as before hooks
  ctx.response   // NEW: The handler's response
}
```

## Modifying Responses

After hooks can change what gets sent to the user:

```typescript
const timestampHook = defineHook({
  name: 'timestamp',
  after: async (ctx) => {
    // Add timestamp to all responses
    return {
      next: true,
      response: {
        ...ctx.response,
        serverTime: Date.now()
      }
    };
  }
});
```

Now all responses include `serverTime`:

```json
{
  "status": "success",
  "data": {
    "message": "Hello!",
    "serverTime": 1234567890
  }
}
```

## Logging Responses

```typescript
const responseLoggerHook = defineHook({
  name: 'responseLogger',
  after: async (ctx) => {
    console.log(`Response for ${ctx.route}:`, ctx.response);
    
    // Don't modify response, just log
    return { next: true };
  }
});
```

## Stopping After Hooks

After hooks can also stop and return errors:

```typescript
const sensitiveDataHook = defineHook({
  name: 'sensitiveData',
  after: async (ctx) => {
    // Check if response contains sensitive data
    if (ctx.response.password) {
      return {
        next: false,
        status: 500,
        error: 'Handler returned sensitive data (server bug)'
      };
    }
    
    return { next: true };
  }
});
```

**⚠️ Important:** Just like before hooks, when returning `next: false`, you **MUST** include both `status` and `error`.

## Multiple After Hooks

After hooks run in order and can chain modifications:

```typescript
setupBridge(routes, {
  hooks: [
    timestampHook,      // Adds serverTime
    formatHook,         // Formats data
    responseLoggerHook  // Logs final response
  ]
});
```

Each hook sees the response from the previous hook.

## Example: API Versioning

```typescript
const versionHook = defineHook({
  name: 'version',
  after: async (ctx) => {
    return {
      next: true,
      response: {
        ...ctx.response,
        apiVersion: '1.0.0',
        requestId: crypto.randomUUID()
      }
    };
  }
});
```

## What's Next?

You've learned about before and after hooks. Let's learn about cleanup hooks that always run!

---

**Next:** [10-cleanup-hooks.md](./10-cleanup-hooks.md)
