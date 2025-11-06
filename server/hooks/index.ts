/**
 * Example hooks for the bridge.
 * 
 * This module provides reference implementations of common hooks:
 * - Authentication
 * - Rate limiting
 * - Logging
 * - Caching
 * - Permission checking
 * 
 * These are examples to demonstrate hook patterns. Developers can:
 * - Use these hooks as-is
 * - Customize them for their needs
 * - Create their own hooks following these patterns
 * 
 * @module hooks
 * 
 * @example
 * ```typescript
 * import { authHook, loggerHook, standardRateLimit } from './hooks';
 * import { setupBridge } from './core/bridge';
 * 
 * // Use hooks globally
 * const { middleware, $api } = setupBridge(routes, {
 *   hooks: [standardRateLimit, loggerHook]
 * });
 * 
 * // Or use in specific routes
 * export const userRoutes = {
 *   getProfile: defineRoute({
 *     hooks: [authHook, loggerHook],
 *     handler: async (input, context) => {
 *       return { userId: context.userId };
 *     }
 *   })
 * };
 * ```
 * 
 * @example
 * ```typescript
 * // Compose hooks for reusable patterns
 * import { composeHooks } from './core/bridge';
 * import { authHook, requireAdmin, loggerHook } from './hooks';
 * 
 * const adminRoute = composeHooks(authHook, requireAdmin, loggerHook);
 * 
 * export const adminRoutes = {
 *   deleteUser: defineRoute({
 *     hooks: [adminRoute],
 *     handler: async ({ id }) => ({ success: true })
 *   })
 * };
 * ```
 */

// Authentication
export { authHook } from './auth';

// Rate limiting
export {
  createRateLimitHook,
  strictRateLimit,
  standardRateLimit,
  relaxedRateLimit,
} from './rate-limit';

// Logging
export { loggerHook, detailedLoggerHook, errorLoggerHook } from './logger';

// Caching
export {
  createCacheHook,
  shortCache,
  mediumCache,
  longCache,
  createUserCacheHook,
  userCache,
} from './cache';

// Permissions
export {
  createRequireRoleHook,
  requireAdmin,
  requireModerator,
  requireUser,
  requireOwnership,
  createRequireAnyRoleHook,
  requireModeratorOrAdmin,
} from './permissions';

// Environment bindings guard
export { envGuardHook, createEnvGuardHook } from './env';
