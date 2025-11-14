/**
 * Cloudflare Workers / Hono environment bindings.
 * 
 * Extend this interface with your actual bindings when deploying to Cloudflare Workers.
 * This keeps your handlers type-safe when accessing `context.env`.
 * 
 * @example
 * ```typescript
 * export interface EnvBindings {
 *   // D1 Database
 *   DB: D1Database;
 *   
 *   // KV Namespace
 *   MY_KV: KVNamespace;
 *   
 *   // R2 Bucket
 *   MY_BUCKET: R2Bucket;
 *   
 *   // Durable Object
 *   MY_DO: DurableObjectNamespace;
 *   
 *   // Queue
 *   MY_QUEUE: Queue;
 *   
 *   // Environment variables
 *   API_KEY: string;
 *   ENVIRONMENT: 'development' | 'staging' | 'production';
 * }
 * ```
 * 
 * Then access in your handlers:
 * ```typescript
 * handler: async (input, context) => {
 *   const db = context?.env?.DB;
 *   const result = await db.prepare('SELECT * FROM users').all();
 *   return result;
 * }
 * ```
 */
export interface EnvBindings {
  // Add your Cloudflare Workers bindings here
  // Leave empty if not using Cloudflare Workers
}
