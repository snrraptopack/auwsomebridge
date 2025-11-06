import { z } from 'zod';
import { defineRoute } from '../core/bridge';

export const healthRoutes = {
  ping: defineRoute({
    method: 'GET',
    output: z.object({ ok: z.boolean() }),
    description: 'Health check',
    tags: ['health'],
    handler: async () => ({ ok: true }),
  }),
};