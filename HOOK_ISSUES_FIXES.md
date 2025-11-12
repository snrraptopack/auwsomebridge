# Hook Issues and Fixes

## Issue 1: Hook with `next: false` still executes handler

### Problem
```typescript
const Counter = defineHook({
  name: "counter",
  before: async (ctx) => {
    console.log(ctx);
    return { next: false }; // ❌ Missing status and error!
  }
});
```

### Fix
When returning `next: false`, you MUST include `status` and `error`:

```typescript
const Counter = defineHook({
  name: "counter",
  before: async (ctx) => {
    console.log('Blocking request');
    return { 
      next: false, 
      status: 403,  // Required!
      error: 'Request blocked by counter hook' // Required!
    };
  }
});
```

### Why?
The hook executor needs to know:
1. What HTTP status code to return (401, 403, 500, etc.)
2. What error message to send to the client

Without these, the executor doesn't know how to handle the blocked request.

---

## Issue 2: GET method has both `body` and `query`

### Problem
When logging `ctx` for a GET request, you see:
```javascript
{
  body: { id: "20" },
  query: { id: "20" },
  input: { id: "20" }
}
```

### Explanation
This is by design:
- `ctx.input` - The validated/parsed input (USE THIS!)
- `ctx.req.query` - Raw query parameters
- `ctx.req.body` - Raw body (for GET, this is set to the parsed query for consistency)

### Fix
Always use `ctx.input` in your hooks and handlers:

```typescript
const MyHook = defineHook({
  name: "my-hook",
  before: async (ctx) => {
    // ✅ Correct - use ctx.input
    console.log('Input:', ctx.input);
    
    // ❌ Don't use ctx.req.body or ctx.req.query directly
    // console.log('Body:', ctx.req.body);
    
    return { next: true };
  }
});
```

---

## Issue 3: console.log(ctx) causes browser console noise

### Problem
```typescript
before: async (ctx) => {
  console.log(ctx); // ❌ Logs huge object, causes noise
  return { next: false };
}
```

### Fix
Log only what you need:

```typescript
before: async (ctx) => {
  // ✅ Log specific fields
  console.log(`[${ctx.method}] ${ctx.route}`, ctx.input);
  
  // Or create a clean summary
  console.log({
    method: ctx.method,
    route: ctx.route,
    input: ctx.input,
    ip: ctx.req.ip
  });
  
  return { next: false, status: 403, error: 'Blocked' };
}
```

### Better: Use a logger hook

```typescript
const loggerHook = defineHook({
  name: 'logger',
  before: (ctx) => {
    console.log(`→ [${ctx.method}] ${ctx.route}`, ctx.input);
    return { next: true };
  },
  after: (ctx) => {
    console.log(`← [${ctx.method}] ${ctx.route}`, 'Success');
    return { next: true };
  },
  cleanup: (ctx) => {
    if (!ctx.success) {
      console.error(`✗ [${ctx.method}] ${ctx.route}`, ctx.error);
    }
    return { next: true };
  }
});
```

---

## Complete Working Example

```typescript
import { defineHook, defineRoute } from 'auwsomebridge';
import { z } from 'zod';

// ✅ Correct hook that blocks requests
const counterHook = defineHook({
  name: 'counter',
  setup: () => ({ count: 0, limit: 5 }),
  before: (ctx, state) => {
    state.count++;
    console.log(`Request #${state.count} to ${ctx.route}`);
    
    if (state.count > state.limit) {
      return {
        next: false,
        status: 429,
        error: 'Too many requests'
      };
    }
    
    return { next: true };
  }
});

// ✅ Correct hook that logs cleanly
const loggerHook = defineHook({
  name: 'logger',
  before: (ctx) => {
    console.log(`→ ${ctx.method} ${ctx.route}`, ctx.input);
    return { next: true };
  }
});

// ✅ Route with hooks
export const routes = {
  getUser: defineRoute({
    method: 'GET',
    input: z.object({ id: z.string() }),
    hooks: [loggerHook, counterHook],
    handler: async ({ id }) => {
      return { id, name: 'John' };
    }
  })
};
```

---

## Summary

1. **Always include `status` and `error` when returning `next: false`**
2. **Use `ctx.input` instead of `ctx.req.body` or `ctx.req.query`**
3. **Log specific fields, not the entire `ctx` object**
4. **Use lifecycle hooks (before/after/cleanup) for better logging**
