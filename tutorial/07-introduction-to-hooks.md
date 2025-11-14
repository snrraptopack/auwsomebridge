# Tutorial 07: Introduction to Hooks

Hooks let you add functionality to your routes without changing the handler code.

## What Are Hooks?

Hooks are functions that run **before** or **after** your handler.

Think of them as middleware that can:
- Check authentication
- Log requests
- Rate limit users
- Add data to context
- Transform responses

## Why Use Hooks?

**Without hooks:**
```typescript
handler: async (input) => {
  // Check auth
  if (!isAuthenticated()) {
    throw new Error('Unauthorized');
  }
  
  // Log request
  console.log('Request received');
  
  // Rate limit
  if (tooManyRequests()) {
    throw new Error('Too many requests');
  }
  
  // Finally, your actual logic
  return { data: 'response' };
}
```

**With hooks:**
```typescript
// Clean handler - just business logic
handler: async (input) => {
  return { data: 'response' };
}

// Hooks handle the rest
hooks: [authHook, loggerHook, rateLimitHook]
```

## A Simple Hook

Here's a basic logging hook:

```typescript
import { defineHook } from 'auwsomebridge';

const loggerHook = defineHook({
  name: 'logger',
  before: async (ctx) => {
    console.log(`Request to ${ctx.route}`);
    return { next: true };
  }
});
```

This hook runs **before** every handler and logs the route name.

## Using Hooks

Add hooks to your bridge setup:

```typescript
setupBridge(routes, {
  runtime: 'bun',
  prefix: '/api',
  hooks: [loggerHook]  // Applies to all routes
});
```

Now every request gets logged automatically!

## Hook Lifecycle

Hooks can run at different times:

1. **Before** - Runs before the handler
2. **After** - Runs after the handler
3. **Cleanup** - Always runs at the end

We'll explore each in the next tutorials.

## What's Next?

Let's learn about "before" hooks and how they can stop requests.

---

**Next:** [08-before-hooks.md](./08-before-hooks.md)
