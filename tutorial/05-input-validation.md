# Tutorial 05: Input Validation

Let's make our routes safe by validating input.

## Using Zod for Validation

auwsomebridge uses [Zod](https://zod.dev) for validation. It's simple and type-safe.

First, install Zod:

```bash
npm install zod
```

## Basic Validation

Add an `input` schema to your route:

```typescript
import { defineRoute } from 'auwsomebridge';
import { z } from 'zod';

export const userRoutes = {
  createUser: defineRoute({
    method: 'POST',
    input: z.object({
      name: z.string(),
      email: z.string().email()
    }),
    handler: async (input) => {
      // input is now validated and typed!
      return {
        id: '123',
        name: input.name,
        email: input.email
      };
    }
  })
};
```

## What Happens Now?

### Valid Input ✅

```bash
curl -X POST http://localhost:3000/api/createUser \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com"}'
```

Response:
```json
{
  "status": "success",
  "data": {
    "id": "123",
    "name": "Alice",
    "email": "alice@example.com"
  }
}
```

### Invalid Input ❌

```bash
curl -X POST http://localhost:3000/api/createUser \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"not-an-email"}'
```

Response:
```json
{
  "status": "error",
  "error": "Invalid input",
  "code": "VALIDATION_ERROR",
  "details": {
    "issues": [
      {
        "path": ["email"],
        "message": "Invalid email"
      }
    ]
  }
}
```

The handler never runs - validation happens first!

## Common Validation Rules

### Strings

```typescript
z.string()                    // Any string
z.string().min(3)            // At least 3 characters
z.string().max(100)          // At most 100 characters
z.string().email()           // Must be valid email
z.string().url()             // Must be valid URL
z.string().uuid()            // Must be valid UUID
```

### Numbers

```typescript
z.number()                   // Any number
z.number().min(0)           // At least 0
z.number().max(100)         // At most 100
z.number().int()            // Must be integer
z.number().positive()       // Must be positive
```

### Booleans

```typescript
z.boolean()                  // true or false
```

### Optional Fields

```typescript
z.object({
  name: z.string(),
  age: z.number().optional()  // age is optional
})
```

### Default Values

```typescript
z.object({
  name: z.string(),
  role: z.string().default('user')  // Defaults to 'user'
})
```

## Complete Example

```typescript
export const taskRoutes = {
  createTask: defineRoute({
    method: 'POST',
    input: z.object({
      title: z.string().min(1).max(100),
      description: z.string().optional(),
      priority: z.enum(['low', 'medium', 'high']).default('medium'),
      dueDate: z.number().optional()
    }),
    handler: async (input) => {
      return {
        id: '123',
        title: input.title,
        description: input.description,
        priority: input.priority,
        dueDate: input.dueDate,
        completed: false,
        createdAt: Date.now()
      };
    }
  })
};
```

## TypeScript Benefits

With validation, TypeScript knows your input types:

```typescript
handler: async (input) => {
  input.title      // TypeScript knows this is a string
  input.priority   // TypeScript knows this is 'low' | 'medium' | 'high'
  input.dueDate    // TypeScript knows this is number | undefined
}
```

## What's Next?

Now you can validate input. Let's learn about validating output too!

---

**Next:** [06-output-validation.md](./06-output-validation.md)
