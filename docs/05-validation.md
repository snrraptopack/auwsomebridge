# Validation

Validation ensures requests are parsed and verified against Zod schemas, and optionally that handler outputs match expected shapes. This yields consistent `400` errors for bad inputs and catches server-side bugs with output validation.

## Input Validation

- Define `input` with a Zod schema in your route. The adapter will validate `req.query` for `GET` and `req.body` for other methods.
- On success, the validated data is passed to your handler as `input`.
- On failure, a standardized `400` `validation_error` response is returned.

Example:
```
import { z } from 'zod';
import { defineRoute } from '../core/bridge';

export const userRoutes = {
  getUserById: defineRoute({
    method: 'GET',
    input: z.object({ id: z.string().uuid() }),
    handler: async ({ id }) => ({ id, name: 'John Doe' }),
  }),
};
```

Error shape on invalid input:
```
{
  "status": "error",
  "error": "Validation error",
  "code": "validation_error",
  "details": [
    { "path": ["id"], "message": "Invalid uuid", "code": "invalid_string" }
  ],
  "timestamp": 1712345678901
}
```

## Output Validation

- Optional: enable response validation by setting `validateResponses: true` in `setupBridge` config.
- If the route defines `output`, the adapters validate the handler’s result and return a `500 internal_error` if it doesn’t match the schema.

Example:
```
export const userRoutes = {
  getUserById: defineRoute({
    method: 'GET',
    input: z.object({ id: z.string().uuid() }),
    output: z.object({ id: z.string(), name: z.string() }),
    handler: async ({ id }) => ({ id, name: 'John Doe' }),
  }),
};
```

On mismatch (e.g., missing `name`):
```
{
  "status": "error",
  "error": "Output validation failed (server bug)",
  "code": "internal_error",
  "details": { "issues": [ { "path": ["name"], "message": "Required", "code": "invalid_type" } ] },
  "timestamp": 1712345678901
}
```

## How It Works

- `validateInput(schema, input)` runs `schema.safeParse` and either passes `data` forward or returns a `validation_error`.
- `validateOutput(schema, output)` runs `safeParse` and flags a server bug when validation fails (kept as a developer-facing safeguard).
- Adapters handle mapping:
  - Express: `req.query` for `GET`, `req.body` for `POST/PUT/PATCH/DELETE`.
  - Hono: similar, with normalized context via `normalizeHonoContext`.

## Zod Patterns

- Common shapes:
```
z.object({
  id: z.string().uuid(),
  page: z.number().int().min(1).default(1),
  q: z.string().max(100).optional(),
})
```

- Arrays and nested objects:
```
z.object({
  items: z.array(z.object({ id: z.string(), qty: z.number().min(1) }))
})
```

- Unions and literals:
```
z.object({
  type: z.union([z.literal('a'), z.literal('b')]),
})
```

- Refinements and transforms:
```
z.object({
  email: z.string().email(),
  age: z.number().refine(n => n >= 18, 'Must be 18+'),
  slug: z.string().transform(s => s.toLowerCase()),
})
```

## Handler Typing via Zod

- Handler input type is inferred from `input`:
```
handler: async (input /* typed from z.input<typeof inputSchema> */) => { ... }
```

- Output type is inferred when `output` is defined.
- For context, keep the second parameter optional and type only fields you use.

## Best Practices

- Always specify `input` for public endpoints; avoid untyped request bodies.
- Keep `output` schemas for critical routes to catch regressions; enable `validateResponses` in bridge config during development/staging.
- Use `default()` and `.optional()` for flexible query handling.
- Prefer `.uuid()`, `.email()`, `.int()`, `.min()`, `.max()` for strong contracts.
- Avoid heavy transforms that obscure original inputs; keep schemas readable.

## Troubleshooting

- Getting `validation_error` on GET: ensure you pass query params and they match the schema.
- Seeing `internal_error` on output: check handler return shape against the `output` schema or temporarily disable `validateResponses`.
- Unexpected types in handler: verify Zod schema matches intended input source.