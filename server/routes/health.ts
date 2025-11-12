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
  pingSse: defineRoute({
    method: 'GET',
    kind: 'sse',
    description: 'Health SSE stream',
    tags: ['health'],
    handler: async () => {
      async function* gen() {
        for (let i = 0; i < 5; i++) {
          yield { ok: true, seq: i + 1, ts: Date.now() };
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      return gen();
    },
  }),
};
