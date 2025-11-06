import type { Context } from 'hono';
import type { NormalizedRequest, HttpMethod } from '../shared/types';

// ============================================================================
// HONO CONTEXT NORMALIZATION
// ============================================================================

/**
 * Normalizes Hono context to common format.
 * 
 * This function converts Hono-specific context objects into a normalized
 * format that can be used by the shared hook execution engine. This allows
 * hooks to work identically across Express and Hono runtimes.
 * 
 * @param c - Hono context object
 * @returns Normalized request object
 * 
 * @example
 * ```typescript
 * app.use(async (c, next) => {
 *   const normalized = normalizeHonoContext(c);
 *   console.log(normalized.method, normalized.url);
 *   await next();
 * });
 * ```
 */
export function normalizeHonoContext(c: Context): NormalizedRequest {
  // Extract headers
  const headers: Record<string, string | string[] | undefined> = {};
  // Use native Headers from the underlying Request
  c.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });

  // Extract query parameters
  const query: Record<string, string | string[]> = {};
  const url = new URL(c.req.url);
  url.searchParams.forEach((value, key) => {
    const existing = query[key];
    if (existing) {
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        query[key] = [existing, value];
      }
    } else {
      query[key] = value;
    }
  });

  // Extract path parameters
  const params: Record<string, string> = {};
  const paramEntries = c.req.param();
  for (const [key, value] of Object.entries(paramEntries)) {
    if (typeof value === 'string') {
      params[key] = value;
    }
  }

  // Get body (will be parsed by adapter)
  let body: unknown;
  try {
    // Hono's body might already be parsed
    body = (c.req as any).bodyCache?.data;
  } catch {
    body = undefined;
  }

  return {
    method: c.req.method as HttpMethod,
    headers,
    body,
    query,
    params,
    ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
    url: c.req.url,
  };
}
