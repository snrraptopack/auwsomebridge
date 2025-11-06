/**
 * Express adapter for the bridge.
 * 
 * This module provides Express-specific functionality for the bridge,
 * including request normalization, middleware creation, and response handling.
 * 
 * @module express
 * 
 * @example
 * ```typescript
 * import { createExpressMiddleware } from './core/express';
 * 
 * const middleware = createExpressMiddleware(routes, config);
 * app.use('/api/:route', middleware);
 * ```
 */

export { normalizeExpressRequest } from './normalize';
export { createExpressMiddleware, sendExpressSuccess, sendExpressError } from './adapter';
