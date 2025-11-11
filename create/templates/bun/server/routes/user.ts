import { z } from 'zod';
import { defineRoute } from 'auwsomebridge';

export const userRoutes = {
  getUser: defineRoute({
    method: 'GET',
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string(), name: z.string() }),
    handler: async ({ id }) => ({ id, name: 'Jane' }),
  }),
  
  createUser: defineRoute({
    method: 'POST',
    input: z.object({
      name: z.string().min(1),
      email: z.string().email(),
    }),
    output: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    }),
    handler: async ({ name, email }) => ({
      id: crypto.randomUUID(),
      name,
      email,
    }),
  }),
};
