# Tutorial 12: Hook Composition

Hooks become powerful when you combine them. Let's learn how to compose hooks for reusability and cleaner code.

## Why Compose Hooks?

Instead of repeating the same hooks on every route:

```typescript
// ❌ Repetitive
const routes = {
  getUser: defineRoute({
    hooks: [rateLimitHook, authHook, loggerHook],
    handler: async ({ id }) => { /* ... */ }
  }),
  updateUser: defineRoute({
    hooks: [rateLimitHook, authHook, loggerHook],
    handler: async ({ id, name }) => { /* ... */ }
  }),
  deleteUser: defineRoute({
    hooks: [rateLimitHook, authHook, loggerHook],
    handler: async ({ id }) => { /* ... */ }
  })
};
```

You can compose them once and reuse:

```typescript
// ✅ Reusable
const protectedRoute = composeHooks(
  rateLimitHook,
  authHook,
  loggerHook
);

const routes = {
  getUser: defineRoute({
    hooks: [protectedRoute],
    handler: async ({ id }) => { /* ... */ }
  }),
  updateUser: defineRoute({
    hooks: [protectedRoute],
    handler: async ({ id, name }) => { /* ... */ }
  }),
  deleteUser: defineRoute({
    hooks: [protectedRoute],
    handler: async ({ id }) => { /* ... */ }
  })
};
```

## Using composeHooks

The `composeHooks` function combines multiple hooks into one:

```typescript
import { composeHooks, defineHook } from './server/core/bridge';

const baseProtection = composeHooks(
  rateLimitHook,
  authHook
);

// Use it like any other hook
const routes = {
  getUser: defineRoute({
    hooks: [baseProtection, loggerHook],
    handler: async ({ id }, context) => {
      // context.userId available from authHook
      return { id, name: 'John' };
    }
  })
};
```

## Execution Order

Composed hooks execute in the order you provide them:

```typescript
const myHooks = composeHooks(
  firstHook,   // Runs first
  secondHook,  // Runs second
  thirdHook    // Runs third
);
```

If any hook stops execution, the remaining hooks are skipped.

## Building Hook Hierarchies

Create different protection levels:

```typescript
// Base protection for all routes
const baseProtection = composeHooks(
  rateLimitHook,
  authHook
);

// Admin protection adds admin check
const adminProtection = composeHooks(
  baseProtection,
  adminOnlyHook
);

// Super admin protection adds even more
const superAdminProtection = composeHooks(
  adminProtection,
  superAdminOnlyHook
);

const routes = {
  getProfile: defineRoute({
    hooks: [baseProtection],  // Any authenticated user
    handler: async (_, ctx) => { /* ... */ }
  }),

  deleteUser: defineRoute({
    hooks: [adminProtection],  // Admin only
    handler: async ({ id }) => { /* ... */ }
  }),

  deleteAllUsers: defineRoute({
    hooks: [superAdminProtection],  // Super admin only
    handler: async () => { /* ... */ }
  })
};
```

## Conditional Composition

Create hooks dynamically based on conditions:

```typescript
const createProtectedRoute = (requireAdmin: boolean) => {
  const hooks = [rateLimitHook, authHook];

  if (requireAdmin) {
    hooks.push(adminOnlyHook);
  }

  return composeHooks(...hooks);
};

// Use it
const userRoute = createProtectedRoute(false);
const adminRoute = createProtectedRoute(true);

const routes = {
  getProfile: defineRoute({
    hooks: [userRoute],
    handler: async () => { /* ... */ }
  }),

  deleteUser: defineRoute({
    hooks: [adminRoute],
    handler: async () => { /* ... */ }
  })
};
```

## Mixing Composed and Individual Hooks

You can mix composed hooks with individual hooks:

```typescript
const baseProtection = composeHooks(rateLimitHook, authHook);

const routes = {
  getUser: defineRoute({
    hooks: [
      baseProtection,      // Composed hook
      cacheHook,           // Individual hook
      metricsHook          // Individual hook
    ],
    handler: async ({ id }) => { /* ... */ }
  })
};
```

Execution order: `rateLimitHook` → `authHook` → `cacheHook` → `metricsHook`

## Important Note: Before Hooks Only

`composeHooks` only composes **before hooks**. If you need full lifecycle support (before, after, cleanup), use hooks directly:

```typescript
// ❌ Won't work as expected - after/cleanup are ignored
const composed = composeHooks(
  lifecycleHook1,  // Only before method is used
  lifecycleHook2   // Only before method is used
);

// ✅ Use hooks directly for full lifecycle
const routes = {
  getUser: defineRoute({
    hooks: [lifecycleHook1, lifecycleHook2],  // All phases work
    handler: async ({ id }) => { /* ... */ }
  })
};
```

## Global Hooks vs Composed Hooks

Global hooks apply to all routes:

```typescript
setupBridge(routes, {
  hooks: [rateLimitHook, loggerHook]  // Applied to ALL routes
});
```

Composed hooks are reusable but explicit:

```typescript
const protectedRoute = composeHooks(authHook, loggerHook);

const routes = {
  publicRoute: defineRoute({
    // No hooks - public
    handler: async () => { /* ... */ }
  }),

  privateRoute: defineRoute({
    hooks: [protectedRoute],  // Explicitly protected
    handler: async () => { /* ... */ }
  })
};
```

## What's Next?

You've learned how to compose hooks for reusability. Next, let's explore practical hook patterns and examples!

---

**Next:** [13-hook-patterns.md](./13-hook-patterns.md)
