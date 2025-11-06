import { defineHook } from '../core/shared/hooks';

// ============================================================================
// PERMISSION CHECKING HOOK EXAMPLE
// ============================================================================

/**
 * Creates a permission checking hook that requires specific role.
 * 
 * This hook:
 * - Checks if user is authenticated (requires authHook to run first)
 * - Verifies user has required role
 * - Returns 403 if user lacks permission
 * - Allows admin role to bypass checks
 * 
 * @example
 * ```typescript
 * // Create permission hooks for different roles
 * const requireAdmin = createRequireRoleHook({ role: 'admin' });
 * const requireModerator = createRequireRoleHook({ role: 'moderator' });
 * 
 * // Use in routes (authHook must run first)
 * export const adminRoutes = {
 *   deleteUser: defineRoute({
 *     method: 'DELETE',
 *     hooks: [authHook, requireAdmin],
 *     handler: async ({ id }) => {
 *       // Only admins can reach here
 *       return { success: true };
 *     }
 *   })
 * };
 * ```
 */
export const createRequireRoleHook = defineHook({
  name: 'requireRole',
  setup: (config: { role: string }) => config,
  handler: (ctx, state) => {
    // Check if user is authenticated
    const userRole = ctx.context.role;
    
    if (!userRole) {
      return {
        next: false,
        status: 401,
        error: 'Authentication required',
      };
    }
    
    // Admin can access everything
    if (userRole === 'admin') {
      return { next: true };
    }
    
    // Check if user has required role
    if (userRole !== state.role) {
      return {
        next: false,
        status: 403,
        error: `Insufficient permissions. Required role: ${state.role}`,
      };
    }
    
    return { next: true };
  },
});

/**
 * Pre-configured permission hooks
 */

/**
 * Requires admin role
 */
export const requireAdmin = createRequireRoleHook({ role: 'admin' });

/**
 * Requires moderator role (or admin)
 */
export const requireModerator = createRequireRoleHook({ role: 'moderator' });

/**
 * Requires user role (or higher)
 */
export const requireUser = createRequireRoleHook({ role: 'user' });

/**
 * Permission hook that checks if user owns the resource.
 * 
 * This hook:
 * - Checks if userId in context matches userId in input
 * - Allows admin to bypass ownership check
 * - Returns 403 if user doesn't own resource
 * 
 * @example
 * ```typescript
 * export const userRoutes = {
 *   updateProfile: defineRoute({
 *     method: 'PATCH',
 *     input: z.object({ userId: z.string(), data: z.object({}) }),
 *     hooks: [authHook, requireOwnership],
 *     handler: async ({ userId, data }) => {
 *       // User can only update their own profile
 *       return { success: true };
 *     }
 *   })
 * };
 * ```
 */
export const requireOwnership = defineHook({
  name: 'requireOwnership',
  handler: (ctx) => {
    const authenticatedUserId = ctx.context.userId;
    const userRole = ctx.context.role;
    
    if (!authenticatedUserId) {
      return {
        next: false,
        status: 401,
        error: 'Authentication required',
      };
    }
    
    // Admin can access any resource
    if (userRole === 'admin') {
      return { next: true };
    }
    
    // Check if input contains userId
    const input = ctx.input as any;
    const resourceUserId = input?.userId || input?.id;
    
    if (!resourceUserId) {
      // No userId in input, can't verify ownership
      return { next: true };
    }
    
    // Check ownership
    if (authenticatedUserId !== resourceUserId) {
      return {
        next: false,
        status: 403,
        error: 'You can only access your own resources',
      };
    }
    
    return { next: true };
  },
});

/**
 * Permission hook that checks multiple allowed roles.
 * 
 * @example
 * ```typescript
 * const requireModeratorOrAdmin = createRequireAnyRoleHook({
 *   roles: ['moderator', 'admin']
 * });
 * 
 * export const moderationRoutes = {
 *   banUser: defineRoute({
 *     hooks: [authHook, requireModeratorOrAdmin],
 *     handler: async ({ userId }) => {
 *       return { success: true };
 *     }
 *   })
 * };
 * ```
 */
export const createRequireAnyRoleHook = defineHook({
  name: 'requireAnyRole',
  setup: (config: { roles: string[] }) => config,
  handler: (ctx, state) => {
    const userRole = ctx.context.role;
    
    if (!userRole) {
      return {
        next: false,
        status: 401,
        error: 'Authentication required',
      };
    }
    
    // Check if user has any of the allowed roles
    if (!state.roles.includes(userRole)) {
      return {
        next: false,
        status: 403,
        error: `Insufficient permissions. Required roles: ${state.roles.join(', ')}`,
      };
    }
    
    return { next: true };
  },
});

/**
 * Requires moderator or admin role
 */
export const requireModeratorOrAdmin = createRequireAnyRoleHook({
  roles: ['moderator', 'admin'],
});
