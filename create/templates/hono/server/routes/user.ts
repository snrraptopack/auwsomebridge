import { z } from 'zod';
import { defineRoute } from 'auwsomebridge';

export const userRoutes = {
  getUser: defineRoute({
    method: 'GET',
    input: z.object({ id: z.string() }),
    handler: async ({ id }) => ({ id, name: 'Jane' }),
  }),
};