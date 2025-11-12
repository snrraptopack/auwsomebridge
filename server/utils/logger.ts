import type { HookContext, AfterHookContext, CleanupHookContext } from '../core/bridge';

/**
 * Safely logs hook context without browser console noise.
 * Only logs the essential fields, avoiding circular references and platform objects.
 */
export function logContext(ctx: HookContext | AfterHookContext | CleanupHookContext, label?: string) {
  const clean = {
    method: ctx.method,
    route: ctx.route,
    input: ctx.input,
    ip: ctx.req.ip,
    url: ctx.req.url,
    // Add response if it's an AfterHookContext
    ...('response' in ctx ? { response: ctx.response } : {}),
    // Add success/error if it's a CleanupHookContext
    ...('success' in ctx ? { 
      success: ctx.success,
      error: ctx.error 
    } : {}),
  };
  
  if (label) {
    console.log(`[${label}]`, clean);
  } else {
    console.log(clean);
  }
}

/**
 * Creates a simple request logger that doesn't cause browser noise.
 */
export function createRequestLogger(prefix = '→') {
  return (ctx: HookContext) => {
    console.log(`${prefix} [${ctx.method}] ${ctx.route}`, ctx.input);
  };
}

/**
 * Creates a simple response logger that doesn't cause browser noise.
 */
export function createResponseLogger(prefix = '←') {
  return (ctx: AfterHookContext) => {
    console.log(`${prefix} [${ctx.method}] ${ctx.route}`, 'Success');
  };
}

/**
 * Safely stringify context for debugging (removes circular refs and platform objects).
 */
export function stringifyContext(ctx: HookContext | AfterHookContext | CleanupHookContext): string {
  const clean = {
    method: ctx.method,
    route: ctx.route,
    input: ctx.input,
    headers: ctx.req.headers,
    query: ctx.req.query,
    ip: ctx.req.ip,
    ...('response' in ctx ? { response: ctx.response } : {}),
    ...('success' in ctx ? { success: ctx.success, error: ctx.error } : {}),
  };
  
  return JSON.stringify(clean, null, 2);
}
