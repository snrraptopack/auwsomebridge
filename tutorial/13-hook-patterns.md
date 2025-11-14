# Tutorial 13: Common Hook Patterns

Let's explore practical, real-world hook patterns you can use in your applications.

## Pattern 1: JWT Authentication

Validate JWT tokens and populate user context:

```typescript
import jwt from 'jsonwebtoken';

const authHook = defineHook({
  name: 'auth',
  before: async (ctx) => {
    const token = ctx.req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return {
        next: false,
        status: 401,
        error: 'No token provided'
      };
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
        userId: string;
        email: string;
        role: string;
      };
      
      // Populate context for handler
      ctx.context.userId = decoded.userId;
      ctx.context.email = decoded.email;
      ctx.context.role = decoded.role;
      
      return { next: true };
    } catch (error) {
      return {
        next: false,
        status: 401,
        error: 'Invalid token'
      };
    }
  }
});

// Use in routes
const routes = {
  getProfile: defineRoute({
    hooks: [authHook],
    handler: async (_, context) => {
      // context.userId is available
      return {
        userId: context.userId,
        email: context.email
      };
    }
  })
};
```

## Pattern 2: Role-Based Access Control (RBAC)

Check user permissions before allowing access:

```typescript
const createRoleHook = (allowedRoles: string[]) => {
  return defineHook({
    name: 'roleCheck',
    before: async (ctx) => {
      const userRole = ctx.context.role;
      
      if (!userRole) {
        return {
          next: false,
          status: 401,
          error: 'Authentication required'
        };
      }
      
      if (!allowedRoles.includes(userRole)) {
        return {
          next: false,
          status: 403,
          error: 'Insufficient permissions'
        };
      }
      
      return { next: true };
    }
  });
};

// Create role-specific hooks
const adminOnly = createRoleHook(['admin']);
const adminOrModerator = createRoleHook(['admin', 'moderator']);

const routes = {
  deleteUser: defineRoute({
    hooks: [authHook, adminOnly],
    handler: async ({ userId }) => {
      // Only admins can reach here
      await deleteUser(userId);
      return { success: true };
    }
  }),
  
  banUser: defineRoute({
    hooks: [authHook, adminOrModerator],
    handler: async ({ userId }) => {
      // Admins or moderators can reach here
      await banUser(userId);
      return { success: true };
    }
  })
};
```

## Pattern 3: Rate Limiting

Prevent abuse with configurable rate limits:

```typescript
const createRateLimitHook = defineHook({
  name: 'rateLimit',
  setup: (config: { maxRequests: number; windowMs: number }) => {
    const requests = new Map<string, number[]>();
    
    // Cleanup old entries periodically
    setInterval(() => {
      const now = Date.now();
      for (const [key, timestamps] of requests.entries()) {
        const valid = timestamps.filter(t => now - t < config.windowMs);
        if (valid.length === 0) {
          requests.delete(key);
        } else {
          requests.set(key, valid);
        }
      }
    }, config.windowMs);
    
    return { requests, maxRequests: config.maxRequests, windowMs: config.windowMs };
  },
  before: (ctx, state) => {
    // Use IP or userId as key
    const key = ctx.context.userId || ctx.req.ip || 'unknown';
    const now = Date.now();
    
    // Get request timestamps
    const timestamps = state.requests.get(key) || [];
    
    // Remove old timestamps
    const validTimestamps = timestamps.filter(
      t => now - t < state.windowMs
    );
    
    // Check limit
    if (validTimestamps.length >= state.maxRequests) {
      const oldestTimestamp = Math.min(...validTimestamps);
      const resetTime = oldestTimestamp + state.windowMs;
      const waitSeconds = Math.ceil((resetTime - now) / 1000);
      
      return {
        next: false,
        status: 429,
        error: `Too many requests. Try again in ${waitSeconds} seconds`
      };
    }
    
    // Add current timestamp
    validTimestamps.push(now);
    state.requests.set(key, validTimestamps);
    
    return { next: true };
  }
});

// Different limits for different routes
const strictLimit = createRateLimitHook({ maxRequests: 10, windowMs: 60000 });
const relaxedLimit = createRateLimitHook({ maxRequests: 100, windowMs: 60000 });

const routes = {
  login: defineRoute({
    hooks: [strictLimit],  // 10 requests per minute
    handler: async ({ email, password }) => { /* ... */ }
  }),
  
  search: defineRoute({
    hooks: [authHook, relaxedLimit],  // 100 requests per minute
    handler: async ({ query }) => { /* ... */ }
  })
};
```

## Pattern 4: Request Logging & Metrics

Track all requests with timing and outcome:

```typescript
const requestLoggerHook = defineHook({
  name: 'requestLogger',
  before: (ctx) => {
    ctx.context.startTime = Date.now();
    ctx.context.requestId = crypto.randomUUID();
    
    console.log(`[${ctx.context.requestId}] → ${ctx.method} ${ctx.route}`, {
      input: ctx.input,
      userId: ctx.context.userId || 'anonymous',
      ip: ctx.req.ip
    });
    
    return { next: true };
  },
  after: (ctx) => {
    const duration = Date.now() - ctx.context.startTime;
    
    console.log(`[${ctx.context.requestId}] ✓ ${ctx.method} ${ctx.route}`, {
      duration: `${duration}ms`,
      userId: ctx.context.userId || 'anonymous'
    });
    
    return { next: true };
  },
  cleanup: (ctx) => {
    const duration = Date.now() - ctx.context.startTime;
    
    if (!ctx.success) {
      console.error(`[${ctx.context.requestId}] ✗ ${ctx.method} ${ctx.route}`, {
        duration: `${duration}ms`,
        error: ctx.error?.message,
        userId: ctx.context.userId || 'anonymous'
      });
    }
    
    // Send to monitoring service
    sendMetrics({
      route: ctx.route,
      method: ctx.method,
      duration,
      success: ctx.success,
      userId: ctx.context.userId
    });
    
    return { next: true };
  }
});

// Use globally
setupBridge(routes, {
  hooks: [requestLoggerHook]
});
```

## Pattern 5: Request ID & Correlation

Add unique IDs to track requests across services:

```typescript
const requestIdHook = defineHook({
  name: 'requestId',
  before: (ctx) => {
    // Use existing request ID or generate new one
    const requestId = ctx.req.headers['x-request-id'] as string || 
                      crypto.randomUUID();
    
    ctx.context.requestId = requestId;
    return { next: true };
  },
  after: (ctx) => {
    // Add request ID to response
    return {
      next: true,
      response: {
        ...ctx.response,
        _meta: {
          requestId: ctx.context.requestId,
          timestamp: Date.now()
        }
      }
    };
  }
});

// Combine with logging
const routes = {
  getUser: defineRoute({
    hooks: [requestIdHook, requestLoggerHook],
    handler: async ({ id }, context) => {
      // Use requestId in logs
      console.log(`[${context.requestId}] Fetching user ${id}`);
      
      return { id, name: 'John' };
    }
  })
};

// Response includes request ID:
// {
//   "id": "123",
//   "name": "John",
//   "_meta": {
//     "requestId": "550e8400-e29b-41d4-a716-446655440000",
//     "timestamp": 1234567890
//   }
// }
```

## Combining Patterns

Use multiple patterns together:

```typescript
// Create a standard protection stack
const protectedRoute = composeHooks(
  requestIdHook,
  requestLoggerHook,
  createRateLimitHook({ maxRequests: 100, windowMs: 60000 }),
  authHook
);

const adminRoute = composeHooks(
  protectedRoute,
  adminOnly
);

const routes = {
  // Public route - just logging
  getPublicData: defineRoute({
    hooks: [requestIdHook, requestLoggerHook],
    handler: async () => { /* ... */ }
  }),
  
  // Protected route - auth required
  getProfile: defineRoute({
    hooks: [protectedRoute],
    handler: async (_, ctx) => { /* ... */ }
  }),
  
  // Admin route - admin only
  deleteUser: defineRoute({
    hooks: [adminRoute],
    handler: async ({ userId }) => { /* ... */ }
  })
};
```

## What's Next?

You've learned the core concepts of hooks! These patterns should cover most common use cases. Now let's move on to other topics in the framework.

---

**Next:** Continue exploring other framework features!
