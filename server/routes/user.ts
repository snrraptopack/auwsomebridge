import { z } from 'zod';
import { defineRoute } from '../core/bridge';

export const userRoutes = {
  getUserById: defineRoute({
    method: 'GET',
    input: z.object({ id: z.string().uuid() }),
    output: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string().email(),
    }),
    auth: true,
    description: 'Fetch a user by ID',
    tags: ['users'],
    handler: async ({ id }, context) => ({
      id,
      name: 'John Doe',
      email: 'john@example.com',
    }),
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
    description: 'Create a new user',
    tags: ['users'],
    handler: async ({ name, email }) => ({
      id: crypto.randomUUID(),
      name,
      email,
    }),
  }),

  updateUser: defineRoute({
    method: 'PATCH',
    input: z.object({
      id: z.string().uuid(),
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
    }),
    output: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    }),
    auth: true,
    handler: async ({ id, name, email }) => ({
      id,
      name: name || 'John Doe',
      email: email || 'john@example.com',
    }),
  }),

  deleteUser: defineRoute({
    method: 'DELETE',
    input: z.object({ id: z.string().uuid() }),
    output: z.object({ success: z.boolean() }),
    auth: true,
    handler: async ({ id }) => ({ success: true }),
  }),
};