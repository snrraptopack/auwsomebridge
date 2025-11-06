/**
 * Hono adapter for the bridge.
 * 
 * This module provides Hono-specific functionality for the bridge,
 * including context normalization, middleware creation, and response handling.
 * 
 * @module hono
 * 
 * @example
 * ```typescript
 * import { createHonoMiddleware } from './core/hono';
 * 
 * const middleware = createHonoMiddleware(routes, config);
 * app.use('/api/:route', middleware);
 * ```
 */

export { normalizeHonoContext } from './normalize';
export { createHonoMiddleware, sendHonoSuccess, sendHonoError } from './adapter';
