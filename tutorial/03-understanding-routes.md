# Tutorial 03: Understanding Routes

Now let's understand what `defineRoute` can do.

## Basic Route Structure

Every route has two required parts:

```typescript
defineRoute({
  method: 'GET',           // HTTP method
  handler: async () => {   // Your logic
    return { data: 'response' };
  }
})
```

## HTTP Methods

You can use any standard HTTP method:

```typescript
export const myRoutes = {
  // GET - Retrieve data
  getItem: defineRoute({
    method: 'GET',
    handler: async () => ({ item: 'data' })
  }),

  // POST - Create data
  createItem: defineRoute({
    method: 'POST',
    handler: async () => ({ created: true })
  }),

  // PUT - Update (replace) data
  updateItem: defineRoute({
    method: 'PUT',
    handler: async () => ({ updated: true })
  }),

  // PATCH - Update (partial) data
  patchItem: defineRoute({
    method: 'PATCH',
    handler: async () => ({ patched: true })
  }),

  // DELETE - Remove data
  deleteItem: defineRoute({
    method: 'DELETE',
    handler: async () => ({ deleted: true })
  })
};
```

## The Handler Function

The handler is where your logic lives:

```typescript
handler: async () => {
  // Do your work here
  const result = await fetchData();
  
  // Return the data
  return result;
}
```

**Important:** 
- Handlers can be `async` or regular functions
- Always return an object (it will be wrapped automatically)
- Errors are caught and formatted automatically

## Multiple Routes

Group related routes together:

```typescript
export const userRoutes = {
  getUser: defineRoute({
    method: 'GET',
    handler: async () => ({ id: '1', name: 'John' })
  }),

  createUser: defineRoute({
    method: 'POST',
    handler: async () => ({ id: '2', name: 'Jane' })
  }),

  deleteUser: defineRoute({
    method: 'DELETE',
    handler: async () => ({ deleted: true })
  })
};
```

These become:
- `GET /api/getUser`
- `POST /api/createUser`
- `DELETE /api/deleteUser`

## Route Names Matter

The key you use becomes the URL path:

```typescript
export const myRoutes = {
  hello: defineRoute({ ... })      // → /api/hello
  getUserById: defineRoute({ ... }) // → /api/getUserById
  'my-route': defineRoute({ ... })  // → /api/my-route
};
```

## What's Next?

Routes without input are limited. Let's learn how to accept and validate input!

---

**Next:** [04-route-input.md](./04-route-input.md)
