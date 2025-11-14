# Tutorial 11: Stateful Hooks

Hooks can maintain state and accept configuration using the `setup` function. This makes them reusable with different settings.

## Why Stateful Hooks?

Sometimes you need hooks that:
- Accept configuration (like cache TTL, rate limits)
- Maintain internal state (like cache storage, counters)
- Can be reused with different settings

## The Setup Function

The `setup` function runs once when you create a hook instance:

```typescript
const createCacheHook = defineHook({
  name: 'cache',
  setup: (config: { ttl: number }) => {
    // Initialize state
    const cache = new Map();
    return { cache, ttl: config.ttl };
  },
  before: (ctx, state) => {
    // Access state
    const cached = state.cache.get(ctx.route);
    if (cached) {
      return { next: true, response: cached };
    }
    return { next: true };
  }
});

// Create instances with different configs
const shortCache = createCacheHook({ ttl: 60 });
const longCache = createCacheHook({ ttl: 3600 });
```

## Basic Example: Rate Limiter

```typescript
const createRateLimitHook = defineHook({
  name: 'rateLimit',
  setup: (config: { maxRequests: number; windowMs: number }) => {
    const requests = new Map<string, number[]>();
    return { requests, maxRequests: config.maxRequests, windowMs: config.windowMs };
  },
  before: (ctx, state) => {
    const ip = ctx.req.ip || 'unknown';
    const now = Date.now();
    
    // Get request timestamps for this IP
    const timestamps = state.requests.get(ip) || [];
    
    // Remove old timestamps outside the window
    const validTimestamps = timestamps.filter(
      t => now - t < state.windowMs
    );
    
    // Check if limit exceeded
    if (validTimestamps.length >= state.maxRequests) {
      return {
        next: false,
        status: 429,
        error: 'Too many requests'
      };
    }
    
    // Add current timestamp
    validTimestamps.push(now);
    state.requests.set(ip, validTimestamps);
    
    return { next: true };
  }
});

// Create different rate limiters
const strictLimit = createRateLimitHook({ maxRequests: 10, windowMs: 60000 });
const relaxedLimit = createRateLimitHook({ maxRequests: 100, windowMs: 60000 });
```

## Example: Configurable Cache

```typescript
const createCacheHook = defineHook({
  name: 'cache',
  setup: (config: { ttl: number }) => {
    const cache = new Map<string, { data: any; expires: number }>();
    return { cache, ttl: config.ttl };
  },
  before: (ctx, state) => {
    const key = `${ctx.route}:${JSON.stringify(ctx.input)}`;
    const cached = state.cache.get(key);
    
    if (cached && cached.expires > Date.now()) {
      console.log(`Cache hit: ${key}`);
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
        expires: Date.now() + state.ttl * 1000
      });
      console.log(`Cached: ${key}`);
    }
    return { next: true };
  }
});

// Different cache durations
const shortCache = createCacheHook({ ttl: 60 });      // 1 minute
const mediumCache = createCacheHook({ ttl: 300 });    // 5 minutes
const longCache = createCacheHook({ ttl: 3600 });     // 1 hour

const routes = {
  getWeather: defineRoute({
    hooks: [shortCache],  // Weather changes frequently
    handler: async () => { /* ... */ }
  }),
  
  getNews: defineRoute({
    hooks: [mediumCache],  // News updates moderately
    handler: async () => { /* ... */ }
  }),
  
  getStaticContent: defineRoute({
    hooks: [longCache],  // Static content rarely changes
    handler: async () => { /* ... */ }
  })
};
```

## Example: Metrics Collector

```typescript
const createMetricsHook = defineHook({
  name: 'metrics',
  setup: (config: { serviceName: string }) => {
    const metrics = {
      requests: 0,
      errors: 0,
      totalDuration: 0
    };
    return { metrics, serviceName: config.serviceName };
  },
  before: (ctx, state) => {
    ctx.context.startTime = Date.now();
    state.metrics.requests++;
    return { next: true };
  },
  cleanup: (ctx, state) => {
    const duration = Date.now() - ctx.context.startTime;
    state.metrics.totalDuration += duration;
    
    if (!ctx.success) {
      state.metrics.errors++;
    }
    
    // Log metrics periodically
    if (state.metrics.requests % 100 === 0) {
      const avgDuration = state.metrics.totalDuration / state.metrics.requests;
      console.log(`[${state.serviceName}] Metrics:`, {
        requests: state.metrics.requests,
        errors: state.metrics.errors,
        avgDuration: avgDuration.toFixed(2) + 'ms'
      });
    }
    
    return { next: true };
  }
});

const userMetrics = createMetricsHook({ serviceName: 'user-service' });
const orderMetrics = createMetricsHook({ serviceName: 'order-service' });
```

## State is Private

Each hook instance has its own state:

```typescript
const cache1 = createCacheHook({ ttl: 60 });
const cache2 = createCacheHook({ ttl: 300 });

// cache1 and cache2 have separate state
// They don't share the same cache Map
```

## Hooks Without Setup

If you don't need configuration or state, skip the `setup` function:

```typescript
// Simple hook without setup
const loggerHook = defineHook({
  name: 'logger',
  before: (ctx) => {
    console.log(`${ctx.method} ${ctx.route}`);
    return { next: true };
  }
});

// Use directly (no function call needed)
const routes = {
  getUser: defineRoute({
    hooks: [loggerHook],  // Not loggerHook()
    handler: async () => { /* ... */ }
  })
};
```

## Setup vs No Setup

```typescript
// WITH setup - returns a factory function
const createCacheHook = defineHook({
  name: 'cache',
  setup: (config) => ({ cache: new Map(), ttl: config.ttl }),
  before: (ctx, state) => { /* ... */ }
});

const cache = createCacheHook({ ttl: 60 });  // Call to create instance
// Use: hooks: [cache]

// WITHOUT setup - returns a hook directly
const loggerHook = defineHook({
  name: 'logger',
  before: (ctx) => { /* ... */ }
});

// Use directly: hooks: [loggerHook]
```

## When to Use Setup

Use `setup` when you need:
- ✅ Configuration (TTL, limits, API keys)
- ✅ Stateful data (caches, counters, connections)
- ✅ Multiple instances with different configs
- ✅ Initialization logic (connect to DB, load config)

Don't use `setup` when:
- ❌ Hook is stateless
- ❌ No configuration needed
- ❌ Hook is used only once

## What's Next?

Now that you understand stateful hooks, let's learn how to compose hooks for even more reusability!

---

**Next:** [12-hook-composition.md](./12-hook-composition.md)
