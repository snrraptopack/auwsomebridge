# Tutorial 06: Output Validation

You can also validate what your handler returns. This catches bugs before they reach users.

## Why Validate Output?

Output validation helps you:
- Catch bugs in your code
- Ensure consistent API responses
- Document what your API returns
- Get TypeScript type safety

## Adding Output Validation

Add an `output` schema:

```typescript
import { defineRoute } from 'auwsomebridge';
import { z } from 'zod';

export const userRoutes = {
  getUser: defineRoute({
    method: 'GET',
    input: z.object({
      id: z.string()
    }),
    output: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string().email()
    }),
    handler: async (input) => {
      return {
        id: input.id,
        name: 'Alice',
        email: 'alice@example.com'
      };
    }
  })
};
```

## What Happens?

### Valid Output ✅

If your handler returns the correct shape, everything works:

```typescript
handler: async (input) => {
  return {
    id: '123',
    name: 'Alice',
    email: 'alice@example.com'
  };
  // ✅ Matches the output schema
}
```

### Invalid Output ❌

If your handler returns wrong data, users get an error:

```typescript
handler: async (input) => {
  return {
    id: '123',
    name: 'Alice'
    // ❌ Missing email!
  };
}
```

Response:
```json
{
  "status": "error",
  "error": "Output validation failed (server bug)",
  "code": "INTERNAL_ERROR"
}
```

This prevents bad data from reaching users!

## Enabling Output Validation

Output validation is **optional** and disabled by default. Enable it in setup:

```typescript
setupBridge(routes, {
  runtime: 'bun',
  prefix: '/api',
  validateResponses: true  // Enable output validation
});
```

## When to Use Output Validation

**Use it when:**
- Building a public API
- Working in a team
- You want extra safety
- Documenting your API

**Skip it when:**
- Prototyping quickly
- You trust your code
- Performance is critical

## Complete Example

```typescript
export const taskRoutes = {
  getTask: defineRoute({
    method: 'GET',
    input: z.object({
      id: z.string().uuid()
    }),
    output: z.object({
      id: z.string().uuid(),
      title: z.string(),
      completed: z.boolean(),
      createdAt: z.number()
    }),
    handler: async (input) => {
      // Fetch task from database
      const task = await db.getTask(input.id);
      
      // Return must match output schema
      return {
        id: task.id,
        title: task.title,
        completed: task.completed,
        createdAt: task.createdAt
      };
    }
  })
};
```

## TypeScript Benefits

TypeScript knows what you should return:

```typescript
handler: async (input) => {
  return {
    id: '123',
    title: 'My Task',
    completed: false,
    createdAt: Date.now()
  };
  // TypeScript checks this matches your output schema!
}
```

## What's Next?

You now know how to validate input and output. Let's learn about hooks - a powerful way to add features without changing your handlers!

---

**Next:** [07-introduction-to-hooks.md](./07-introduction-to-hooks.md)
