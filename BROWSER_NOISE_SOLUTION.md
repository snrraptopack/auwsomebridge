# How to Avoid Browser Console Noise

## The Problem

When you do `console.log(ctx)` in a hook, the browser's dev tools try to serialize the entire context object, which includes:
- Circular references (platform objects)
- Native Request/Response objects
- Large nested structures

This causes:
- Browser console to freeze or show errors
- Massive output that's hard to read
- Performance issues

## Solution 1: Use the Logger Utility

```typescript
import { logContext } from './utils/logger';
import { defineHook } from 'auwsomebridge';

const myHook = defineHook({
  name: 'my-hook',
  before: (ctx) => {
    // ✅ Clean, readable output
    logContext(ctx, 'BEFORE');
    
    return { next: true };
  }
});
```

**Output:**
```
[BEFORE] {
  method: 'GET',
  route: 'getUser',
  input: { id: '123' },
  ip: '127.0.0.1',
  url: 'http://localhost:3000/api/getUser?id=123'
}
```

## Solution 2: Log Only What You Need

```typescript
const myHook = defineHook({
  name: 'my-hook',
  before: (ctx) => {
    // ✅ Log specific fields
    console.log({
      method: ctx.method,
      route: ctx.route,
      input: ctx.input,
    });
    
    return { next: true };
  }
});
```

## Solution 3: Use String Formatting

```typescript
import { defineHook } from 'auwsomebridge';

const myHook = defineHook({
  name: 'my-hook',
  before: (ctx) => {
    // ✅ Simple string format
    console.log(`[${ctx.method}] ${ctx.route}`, JSON.stringify(ctx.input));
    
    return { next: true };
  }
});
```

## Solution 4: Create a Reusable Logger Hook

```typescript
import { defineHook } from 'auwsomebridge';

export const loggerHook = defineHook({
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
    const duration = Date.now() - (ctx.context.startTime || Date.now());
    if (ctx.success) {
      console.log(`✓ [${ctx.method}] ${ctx.route} (${duration}ms)`);
    } else {
      console.error(`✗ [${ctx.method}] ${ctx.route}`, ctx.error);
    }
    return { next: true };
  }
});

// Use it globally
const { middleware } = setupBridge(routes, {
  hooks: [loggerHook], // Applied to all routes
});
```

## Solution 5: Conditional Logging (Development Only)

```typescript
const isDev = process.env.NODE_ENV === 'development';

const debugHook = defineHook({
  name: 'debug',
  before: (ctx) => {
    if (isDev) {
      console.log(`[${ctx.method}] ${ctx.route}`, {
        input: ctx.input,
        ip: ctx.req.ip,
      });
    }
    return { next: true };
  }
});
```

## Solution 6: Use a Proper Logger Library

For production, use a proper logger like `pino` or `winston`:

```typescript
import pino from 'pino';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

const loggerHook = defineHook({
  name: 'logger',
  before: (ctx) => {
    logger.info({
      method: ctx.method,
      route: ctx.route,
      input: ctx.input,
      ip: ctx.req.ip,
    }, 'Request received');
    
    return { next: true };
  }
});
```

## Complete Example

```typescript
// server/hooks/logger.ts
import { defineHook } from 'auwsomebridge';

export const requestLogger = defineHook({
  name: 'request-logger',
  before: (ctx) => {
    // Store start time for duration calculation
    ctx.context.startTime = Date.now();
    
    // Clean log output
    console.log(`→ [${ctx.method}] ${ctx.route}`, {
      input: ctx.input,
      ip: ctx.req.ip,
    });
    
    return { next: true };
  },
  after: (ctx) => {
    const duration = Date.now() - ctx.context.startTime;
    console.log(`← [${ctx.method}] ${ctx.route}`, {
      duration: `${duration}ms`,
      status: 'success',
    });
    
    return { next: true };
  },
  cleanup: (ctx) => {
    if (!ctx.success && ctx.error) {
      console.error(`✗ [${ctx.method}] ${ctx.route}`, {
        error: ctx.error.message,
        status: ctx.error.status,
      });
    }
    
    return { next: true };
  }
});

// server/app-bun.ts
import { setupBridge } from 'auwsomebridge';
import { requestLogger } from './hooks/logger';
import { routes } from './routes';

const { middleware } = setupBridge(routes, {
  runtime: 'bun',
  hooks: [requestLogger], // No more browser noise!
});

Bun.serve({
  port: 3000,
  fetch: middleware,
});
```

## Summary

**Don't do this:**
```typescript
console.log(ctx); // ❌ Causes browser noise
```

**Do this instead:**
```typescript
// ✅ Option 1: Use utility
logContext(ctx);

// ✅ Option 2: Log specific fields
console.log({ method: ctx.method, route: ctx.route, input: ctx.input });

// ✅ Option 3: String format
console.log(`[${ctx.method}] ${ctx.route}`, ctx.input);
```
