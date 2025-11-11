import type { NormalizedRequest, HttpMethod } from '../shared/types';

// ============================================================================
// BUN REQUEST NORMALIZATION
// ============================================================================

/**
 * Normalizes Bun's Request to NormalizedRequest.
 * 
 * This function converts Bun-specific Request objects into a normalized
 * format that can be used by the shared hook execution engine. This allows
 * hooks to work identically across Express, Hono, and Bun runtimes.
 * 
 * @param req - Native Bun Request object
 * @param url - Parsed URL object
 * @param body - Parsed body (if applicable)
 * @returns Normalized request object
 * 
 * @example
 * ```typescript
 * const req = new Request('http://localhost:3000/api/getUser?id=123');
 * const url = new URL(req.url);
 * const normalized = await normalizeBunRequest(req, url, {});
 * console.log(normalized.method, normalized.query);
 * ```
 */
export async function normalizeBunRequest(
  req: Request,
  url: URL,
  body: unknown
): Promise<NormalizedRequest> {
  // Convert Headers to plain object
  const headers: Record<string, string | string[] | undefined> = {};
  req.headers.forEach((value, key) => {
    const existing = headers[key];
    if (existing) {
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        headers[key] = [existing, value];
      }
    } else {
      headers[key] = value;
    }
  });

  // Parse query parameters
  const query: Record<string, string | string[]> = {};
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

  // Extract path parameters (if route pattern matching is needed)
  // For now, params are empty as we use simple route names
  const params: Record<string, string> = {};

  // Get client IP (Bun-specific)
  // Note: Bun doesn't expose IP directly in Request, would need server context
  const ip = headers['x-forwarded-for'] as string | undefined || 
             headers['x-real-ip'] as string | undefined;

  return {
    method: req.method as HttpMethod,
    headers,
    body,
    query,
    params,
    ip,
    url: url.href,
  };
}
