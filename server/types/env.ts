// Minimal Cloudflare Workers bindings interface.
// Extend this with only the bindings you actually use.
// If you don’t use a given service, remove it to keep types tight.

export interface EnvBindings {
  // KV example
  // MY_KV: KVNamespace;

  // R2 example
  // MY_BUCKET: R2Bucket;

  // Durable Objects example
  // MY_DO: DurableObjectNamespace;

  // Queues example
  // MY_QUEUE: Queue;

  // D1 example
  // DB: D1Database;
}