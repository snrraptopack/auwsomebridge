import { defineHook } from '../core/shared/hooks';

// ============================================================================
// AUDIT HOOK EXAMPLE
// ============================================================================

/**
 * Audit hook that logs all request outcomes for compliance and security.
 * 
 * This hook uses the cleanup lifecycle phase to ensure audit logs are
 * always recorded, regardless of whether the request succeeded or failed.
 * 
 * Features:
 * - Always executes (even on errors)
 * - Logs request details, user info, and outcome
 * - Never fails the request (errors are caught internally)
 * - Suitable for compliance and security auditing
 * 
 * @example
 * ```typescript
 * // Use globally to audit all requests
 * setupBridge(routes, {
 *   hooks: [auditHook]
 * });
 * ```
 * 
 * @example
 * ```typescript
 * // Use on specific sensitive routes
 * export const adminRoutes = {
 *   deleteUser: defineRoute({
 *     hooks: [authHook, requireAdmin, auditHook],
 *     handler: async ({ id }) => {
 *       await deleteUser(id);
 *       return { success: true };
 *     }
 *   })
 * };
 * ```
 */
export const auditHook = defineHook({
  name: 'audit',
  cleanup: async (ctx) => {
    const logEntry = {
      timestamp: Date.now(),
      date: new Date().toISOString(),
      route: ctx.route,
      method: ctx.method,
      userId: ctx.context.userId || 'anonymous',
      userRole: ctx.context.role || 'unknown',
      success: ctx.success,
      statusCode: ctx.error?.status,
      errorMessage: ctx.error?.message,
      ip: ctx.req.ip,
      userAgent: ctx.req.headers['user-agent'],
      input: ctx.input,
    };
    
    // Log to console (in production, send to audit log service)
    if (ctx.success) {
      console.log('[AUDIT] Request succeeded:', logEntry);
    } else {
      console.warn('[AUDIT] Request failed:', logEntry);
    }
    
    // In production, store in audit log database
    // This should never throw an error that affects the request
    try {
      // await saveAuditLog(logEntry);
      // await sendToAuditService(logEntry);
    } catch (error) {
      // Log error but don't propagate
      console.error('[AUDIT] Failed to save audit log:', error);
    }
    
    return { next: true };
  },
});

/**
 * Detailed audit hook with additional context.
 * 
 * This hook captures more detailed information for high-security routes.
 * 
 * @example
 * ```typescript
 * export const securityRoutes = {
 *   changePassword: defineRoute({
 *     hooks: [authHook, detailedAuditHook],
 *     handler: async ({ oldPassword, newPassword }, context) => {
 *       await changePassword(context.userId, oldPassword, newPassword);
 *       return { success: true };
 *     }
 *   })
 * };
 * ```
 */
export const detailedAuditHook = defineHook({
  name: 'detailed-audit',
  cleanup: async (ctx) => {
    const logEntry = {
      timestamp: Date.now(),
      date: new Date().toISOString(),
      route: ctx.route,
      method: ctx.method,
      userId: ctx.context.userId || 'anonymous',
      userRole: ctx.context.role || 'unknown',
      success: ctx.success,
      statusCode: ctx.error?.status,
      errorMessage: ctx.error?.message,
      ip: ctx.req.ip,
      userAgent: ctx.req.headers['user-agent'],
      referer: ctx.req.headers['referer'],
      origin: ctx.req.headers['origin'],
      input: ctx.input,
      // Additional security context
      sessionId: ctx.context.sessionId,
      requestId: ctx.context.requestId,
      // Response data (be careful with sensitive data)
      responseSize: ctx.response ? JSON.stringify(ctx.response).length : 0,
    };
    
    // Log with appropriate level
    if (ctx.success) {
      console.log('[AUDIT:DETAILED] Request succeeded:', logEntry);
    } else {
      console.error('[AUDIT:DETAILED] Request failed:', logEntry);
    }
    
    // Store in audit log
    try {
      // await saveDetailedAuditLog(logEntry);
    } catch (error) {
      console.error('[AUDIT:DETAILED] Failed to save audit log:', error);
    }
    
    return { next: true };
  },
});

/**
 * Audit hook for sensitive operations only.
 * 
 * This hook only logs failed requests or specific sensitive operations.
 * 
 * @example
 * ```typescript
 * export const paymentRoutes = {
 *   processPayment: defineRoute({
 *     hooks: [authHook, sensitiveAuditHook],
 *     handler: async ({ amount, cardToken }, context) => {
 *       const result = await processPayment(amount, cardToken);
 *       return result;
 *     }
 *   })
 * };
 * ```
 */
export const sensitiveAuditHook = defineHook({
  name: 'sensitive-audit',
  cleanup: async (ctx) => {
    // Only log if request failed or is a sensitive operation
    const isSensitiveRoute = ['deleteUser', 'processPayment', 'changePassword'].includes(ctx.route);
    
    if (!ctx.success || isSensitiveRoute) {
      const logEntry = {
        timestamp: Date.now(),
        date: new Date().toISOString(),
        route: ctx.route,
        method: ctx.method,
        userId: ctx.context.userId || 'anonymous',
        success: ctx.success,
        statusCode: ctx.error?.status,
        errorMessage: ctx.error?.message,
        ip: ctx.req.ip,
        severity: !ctx.success ? 'high' : 'medium',
      };
      
      console.warn('[AUDIT:SENSITIVE]', logEntry);
      
      try {
        // await saveSensitiveAuditLog(logEntry);
        // await alertSecurityTeam(logEntry);
      } catch (error) {
        console.error('[AUDIT:SENSITIVE] Failed to save audit log:', error);
      }
    }
    
    return { next: true };
  },
});


