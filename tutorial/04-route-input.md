# Tutorial 04: Route Input

Let's learn how to accept input from users.

## Accepting Input

Add an `input` parameter to your handler:

```typescript
import { defineRoute } from 'auwsomebridge';

export const myRoutes = {
  greet: defineRoute({
    method: 'GET',
    handler: async (input) => {
      return { 
        message: `Hello, ${input.name}!` 
      };
    }
  })
};
```

Now you can pass data:

```bash
curl http://localhost:3000/api/greet?name=Alice
# Response: { "status": "success", "data": { "message": "Hello, Alice!" } }
```

## Where Input Comes From

### GET Requests
Input comes from **query parameters**:

```bash
GET /api/greet?name=Alice&age=25
```

```typescript
handler: async (input) => {
  // input = { name: 'Alice', age: '25' }
}
```

### POST/PUT/PATCH Requests
Input comes from the **request body**:

```bash
POST /api/createUser
Content-Type: application/json

{
  "name": "Alice",
  "email": "alice@example.com"
}
```

```typescript
handler: async (input) => {
  // input = { name: 'Alice', email: 'alice@example.com' }
}
```

## Example: Creating a User

```typescript
export const userRoutes = {
  createUser: defineRoute({
    method: 'POST',
    handler: async (input) => {
      // input contains the request body
      return {
        id: '123',
        name: input.name,
        email: input.email,
        createdAt: Date.now()
      };
    }
  })
};
```

Test it:

```bash
curl -X POST http://localhost:3000/api/createUser \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com"}'
```

## The Problem

What if someone sends invalid data?

```bash
# Missing name
curl -X POST http://localhost:3000/api/createUser \
  -d '{"email":"alice@example.com"}'

# Invalid email
curl -X POST http://localhost:3000/api/createUser \
  -d '{"name":"Alice","email":"not-an-email"}'
```

Your handler will break! We need validation.

## What's Next?

Let's add input validation to make our routes safe.

---

**Next:** [05-input-validation.md](./05-input-validation.md)
