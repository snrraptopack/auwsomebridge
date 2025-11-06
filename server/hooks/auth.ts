import { defineHook } from '../core/shared/hooks';

// ============================================================================
// AUTHENTICATION HOOK EXAMPLE
// ============================================================================

/**
 * Example authentication hook that validates tokens and adds user context.
 * 
 * This hook:
 * - Extracts token from Authorization header
 * - Validates the token (mock validation in this example)
 * - Adds userId and role to context for subsequent hooks and handler
 * 
 * @example
 * ```typescript
 * // Use in routes
 * export const userRoutes = {
 *   getProfile: defineRoute({
 *     method: 'GET',
 *     hooks: [authHook],
 *     handler: async (input, context) => {
 *       // context.userId and context.role are available
 *       return { userId: context.userId, role: context.role };
 *     }
 *   })
 * };
 * ```
 * 
 * @example
 * ```typescript
 * // Use globally
 * setupBridge(routes, {
 *   hooks: [authHook] // All routes require authentication
 * });
 * ```
 */
export const authHook = defineHook({
  name: 'auth',
  handler: async (ctx) => {
    // Extract token from Authorization header
    const authHeader = ctx.req.headers.authorization;
    
    if (!authHeader) {
      return {
        next: false,
        status: 401,
        error: 'Authorization header missing',
      };
    }

    // Handle array or string header
    const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    
    if (!headerValue) {
      return {
        next: false,
        status: 401,
        error: 'Authorization header missing',
      };
    }

    // Extract Bearer token
    const parts = headerValue.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return {
        next: false,
        status: 401,
        error: 'Invalid authorization format. Expected: Bearer <token>',
      };
    }

    const token = parts[1];

    // Validate token (mock implementation)
    // In production, validate JWT, check database, etc.
    try {
      const user = await validateToken(token);
      
      // Add user info to context for subsequent hooks and handler
      ctx.context.userId = user.id;
      ctx.context.role = user.role;
      ctx.context.email = user.email;

      return { next: true };
    } catch (error) {
      return {
        next: false,
        status: 401,
        error: error instanceof Error ? error.message : 'Invalid token',
      };
    }
  },
});

/**
 * Mock token validation function.
 * In production, replace with actual JWT validation or database lookup.
 * 
 * @param token - JWT token or API key
 * @returns User object
 * @throws Error if token is invalid
 */
async function validateToken(token: string): Promise<{
  id: string;
  email: string;
  role: 'admin' | 'user';
}> {
  // Mock validation - replace with real implementation
  if (token === 'invalid') {
    throw new Error('Invalid token');
  }

  // Simulate async validation
  await new Promise((resolve) => setTimeout(resolve, 10));

  // Return mock user
  return {
    id: 'user-123',
    email: 'user@example.com',
    role: token.includes('admin') ? 'admin' : 'user',
  };
}
