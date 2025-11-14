# Tutorial 01: Introduction to auwsomebridge

Welcome! This tutorial will teach you how to build APIs with auwsomebridge, step by step.

## What is auwsomebridge?

auwsomebridge is a library that helps you build APIs that work on multiple server frameworks:

- **Express** (Node.js)
- **Hono** (Node.js, Cloudflare Workers, Bun)
- **Bun** (Native)

**The key idea:** Write your API once, run it anywhere.

## Why Use It?

### 1. Write Once, Run Anywhere

```typescript
// Write your API
export const myRoutes = {
  hello: defineRoute({
    method: 'GET',
    handler: async () => ({ message: 'Hello!' })
  })
};

// Works on Express, Hono, or Bun - no changes needed
```

### 2. Type-Safe

- Automatic input validation
- TypeScript support
- Catch errors before runtime

### 3. Simple and Clean

- No boilerplate
- Clear structure
- Easy to test

## What You'll Learn

This tutorial series covers:

1. **Introduction** (this file) - What is auwsomebridge
2. **Your First Route** - Create a simple route
3. **Route Definition** - Understanding routes in depth
4. **Validation** - Input and output validation
5. **Hooks** - Add authentication, logging, etc.
6. **SSE** - Real-time streaming
7. **WebSockets** - Bidirectional communication
8. **Deployment** - Run on different platforms

## Installation

```bash
# Install the library
npm install auwsomebridge zod

# Choose your runtime (pick one)
npm install express  # For Express
npm install hono     # For Hono
# Or use Bun (built-in)
```

## What's Next?

In the next tutorial, we'll create your first route and see it working.

---

**Next:** [02-your-first-route.md](./02-your-first-route.md)
