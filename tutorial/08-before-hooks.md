# Tutorial 08: Before Hooks

Before hooks run **before** your handler. They can stop requests or add data.

## The Hook Context (ctx)

Every hook receives a `ctx` object with information about the request:

```typescript
before: async (ctx) => {
  ctx.req        // Normalized request (headers, body, query, params, ip, url)
  ctx.platform   // Native platform (Express req/res, Hono context, Bun request)
  ctx.method     // HTTP method ('GET', 'POST', etc.)
  ctx.route      // Route name ('getUser', 'createTask', etc.)
  ctx.input      // Validated input data (validation happens BEFORE hooks)
  ctx.context    // Mutable object shared with handler
}
```

**Important:** Input validation happens **before** hooks run. If validation fails, hooks never execute.

## Request Flow

Here's what happens when a request comes in:

1. **Input validation** - Validates against `input` schema
2. **Before hooks** - Run in order (can stop request)
3. **Handler** - Your business logic
4. **After hooks** - Run after handler
5. **Cleanup hooks** - Always run at the end

So by the time your hook runs, `ctx.input` is already validated!

## Accessing Request Data

```typescript
const loggerHook = defineHook({
  name: 'logger',
  before: async (ctx) => {
    console.log(`${ctx.method} ${ctx.route}`);
    console.log('Headers:', ctx.req.headers);
    console.log('IP:', ctx.req.ip);
    console.log('Input:', ctx.input);  // Already validated!
    
    return { next: true };
  }
});
```

## Continuing vs Stopping

Hooks return an object that controls what happens next:

### Continue (Allow Request)

```typescript
before: async (ctx) => {
  // Everything is fine, continue
  return { next: true };
}
```

### Stop (Reject Request)

```typescript
before: async (ctx) => {
  // Something is wrong, stop here
  return { 
    next: false, 
    status: 401,              // REQUIRED: HTTP status code
    error: 'Unauthorized'     // REQUIRED: Error message
  };
}
```

**⚠️ Important:** When returning `next: false`, you **MUST** include both `status` and `error`. If you forget them, you'll get:

```json
{
  "status": "error",
  "error": "Hook returned next: false but did not provide status and error message",
  "code": "HOOK_ERROR"
}
```

## Example: Authentication Hook

```typescript
const authHook = defineHook({
  name: 'auth',
  before: async (ctx) => {
    // Check for authorization header
    const token = ctx.req.headers.authorization;
    
    if (!token) {
      return { 
        next: false, 
        status: 401, 
        error: 'Missing authorization token' 
      };
    }
    
    // Token exists, allow request
    return { next: true };
  }
});
```

Test it:

```bash
# Without token - rejected
curl http://localhost:3000/api/getUser

# With token - allowed
curl http://localhost:3000/api/getUser \
  -H "Authorization: Bearer my-token"
```

## The Context Object

The special `ctx.context` object is shared between hooks and your handler:

```typescript
const authHook = defineHook({
  name: 'auth',
  before: async (ctx) => {
    const token = ctx.req.headers.authorization;
    
    // Add user info to context
    ctx.context.userId = 'user-123';
    ctx.context.role = 'admin';
    
    return { next: true };
  }
});
```

Now your handler can access this data:

```typescript
handler: async (input, context) => {
  // context has the data from hooks!
  console.log(context.userId);  // 'user-123'
  console.log(context.role);    // 'admin'
  
  return { data: 'response' };
}
```

## Multiple Before Hooks

Hooks run in order. If any hook stops, the rest don't run:

```typescript
setupBridge(routes, {
  hooks: [
    rateLimitHook,  // Runs first
    authHook,       // Runs second (if rate limit passes)
    loggerHook      // Runs third (if auth passes)
  ]
});
```

## What's Next?

You've learned how before hooks work and how to use the context object. Let's learn about after hooks!

---

**Next:** [09-after-hooks.md](./09-after-hooks.md)
