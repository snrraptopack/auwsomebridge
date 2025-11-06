import type { Request } from 'express';
import type { NormalizedRequest, HttpMethod } from '../shared/types';

// ============================================================================
// EXPRESS REQUEST NORMALIZATION
// ============================================================================

/**
 * Normalizes Express request to common format.
 * 
 * This function converts Express-specific request objects into a normalized
 * format that can be used by the shared hook execution engine. This allows
 * hooks to work identically across Express and Hono runtimes.
 * 
 * @param req - Express request object
 * @returns Normalized request object
 * 
 * @example
 * ```typescript
 * app.use((req, res, next) => {
 *   const normalized = normalizeExpressRequest(req);
 *   console.log(normalized.method, normalized.url);
 * });
 * ```
 */
export function normalizeExpressRequest(req: Request): NormalizedRequest {
  // Extract headers
  const headers: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    headers[key] = value;
  }

  // Extract query parameters
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === 'string') {
      query[key] = value;
    } else if (Array.isArray(value)) {
      query[key] = value.filter((v): v is string => typeof v === 'string');
    }
  }

  // Extract path parameters
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.params)) {
    if (typeof value === 'string') {
      params[key] = value;
    }
  }

  return {
    method: req.method as HttpMethod,
    headers,
    body: req.body,
    query,
    params,
    ip: req.ip,
    url: req.originalUrl || req.url,
  };
}
