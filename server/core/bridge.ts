import { z } from 'zod';

// Re-export shared types
export type {
  HttpMethod,
  RouteHook,
  HookContext,
  HookResult,
  HookDefinition,
  NormalizedRequest,
  RouteHandler,
  RouteDefinition,
  RoutesCollection,
  RouteMetadata,
  BridgeConfig,
  Runtime,
  SetupBridgeOptions,
  ApiSuccess,
  ApiError,
  ApiResponse,
} from './shared/types';



// Re-export hook utilities
export { defineHook, composeHooks } from './shared/hooks';

// ============================================================================
// RUNTIME DETECTION
// ============================================================================

/**
 * Detects which runtime is available (Express, Hono, or Bun).
 * 
 * Checks for installed packages in order:
 * 1. Bun (via global Bun object)
 * 2. Express
 * 3. Hono
 * 
 * @returns Runtime type or null if none is detected
 * 
 * @example
 * ```typescript
 * const runtime = detectRuntime();
 * if (runtime === 'bun') {
 *   console.log('Using Bun');
 * } else if (runtime === 'express') {
 *   console.log('Using Express');
 * } else if (runtime === 'hono') {
 *   console.log('Using Hono');
 * }
 * ```
 */
export function detectRuntime(): 'express' | 'hono' | 'bun' | null {
  // ESM-safe runtime detection
  // Prefer explicit configuration via env or options; avoid CommonJS require.
  const envRuntime = (typeof process !== 'undefined'
    ? (process.env?.BRIDGE_RUNTIME as 'express' | 'hono' | 'bun' | undefined)
    : undefined);

  if (envRuntime === 'express' || envRuntime === 'hono' || envRuntime === 'bun') {
    return envRuntime;
  }

  // Detect Bun runtime
  if (typeof Bun !== 'undefined') {
    return 'bun';
  }

  // Heuristic fallback: default to 'hono' to support ESM/SSR and Workers environments.
  // For Express/Node usage, pass options.runtime: 'express' or set BRIDGE_RUNTIME=express.
  return 'hono';
}

// ============================================================================
// LEGACY TYPES (for backward compatibility)
// ============================================================================

import type { ApiSuccess, ApiError, ApiResponse, HttpMethod, RouteHandler as SharedRouteHandler, RouteMetadata as SharedRouteMetadata } from './shared/types';

// Conditional Express types - only used by legacy FullStackBridge
type ExpressRequest = any;
type ExpressResponse = any;
type ExpressNextFunction = any;

// Legacy middleware types (only used by old FullStackBridge class)
export type Middleware = (
  req: ExpressRequest,
  res: ExpressResponse,
  next: ExpressNextFunction
) => Promise<void> | void;

export type RouteMiddleware = (
  req: ExpressRequest,
  input: unknown
) => Promise<{ authorized: boolean; context?: Record<string, unknown> }>;

type RouteHandler<
  Input = unknown,
  Output = unknown,
  Context = unknown
> = SharedRouteHandler<Input, Output, Context>;

type InputParams<I extends z.ZodTypeAny | undefined> = I extends z.ZodTypeAny
  ? z.input<I>
  : never;
type ParsedInput<I extends z.ZodTypeAny | undefined> = I extends z.ZodTypeAny
  ? z.output<I>
  : never;
type OutputData<O extends z.ZodTypeAny | undefined> = O extends z.ZodTypeAny
  ? z.output<O>
  : unknown;

// Legacy route definition (kept for backward compatibility)
export interface LegacyRouteDefinition<
  I extends z.ZodTypeAny | undefined = undefined,
  O extends z.ZodTypeAny | undefined = undefined,
  C = unknown
> {
  method?: HttpMethod;
  input?: I;
  output?: O;
  handler: RouteHandler<ParsedInput<I>, OutputData<O>, C>;
  auth?: boolean;
  middleware?: RouteMiddleware[];
  description?: string;
  tags?: string[];
  hooks?: any[]; // Added for new hook system
}

/**
 * Defines a route with type-safe input/output validation and hooks support.
 * 
 * @template I - Input Zod schema type
 * @template O - Output Zod schema type
 * @template C - Context type
 * @param def - Route definition
 * @returns Typed route definition
 * 
 * @example
 * ```typescript
 * export const userRoutes = {
 *   getUser: defineRoute({
 *     method: 'GET',
 *     input: z.object({ id: z.string() }),
 *     output: z.object({ id: z.string(), name: z.string() }),
 *     hooks: [authHook, loggerHook],
 *     handler: async ({ id }, context) => {
 *       return { id, name: 'John Doe' };
 *     }
 *   })
 * };
 * ```
 */
export function defineRoute<
  I extends z.ZodTypeAny | undefined = undefined,
  O extends z.ZodTypeAny | undefined = undefined,
  C = unknown
>(def: {
  method?: HttpMethod;
  input?: I;
  output?: O;
  handler: RouteHandler<ParsedInput<I>, OutputData<O>, C>;
  auth?: boolean;
  middleware?: RouteMiddleware[];
  hooks?: any[];
  description?: string;
  tags?: string[];
}): LegacyRouteDefinition<I, O, C> {
  return def as LegacyRouteDefinition<I, O, C>;
}

export type LegacyRoutesCollection = Record<string, LegacyRouteDefinition<any, any, any>>;

export type ExtractRoutes<T extends LegacyRoutesCollection> = {
  [K in keyof T]: T[K] extends LegacyRouteDefinition<
    infer I extends z.ZodTypeAny | undefined,
    infer O extends z.ZodTypeAny | undefined
  >
    ? I extends z.ZodTypeAny
      ? (input: InputParams<I>) => Promise<OutputData<O>>
      : () => Promise<OutputData<O>>
    : never;
};

type RouteMetadata = SharedRouteMetadata;

// ============================================================================
// COMPOSE ROUTES - Simple merging of route collections
// Supports any number of collections with accurate intersection typing
// ============================================================================

type MergeCollections<T extends readonly LegacyRoutesCollection[]> =
  T extends [infer H extends LegacyRoutesCollection, ...infer R extends LegacyRoutesCollection[]]
    ? H & MergeCollections<R>
    : {};

export function composeRoutes<T extends readonly LegacyRoutesCollection[]>(
  ...collections: T
): MergeCollections<T> {
  return Object.assign({}, ...collections) as MergeCollections<T>;
}

// ============================================================================
// INTERNAL BRIDGE (hidden from developers)
// ============================================================================

// Legacy BridgeConfig (kept for backward compatibility)
interface LegacyBridgeConfig {
  prefix?: string;
  validateResponses?: boolean;
  logRequests?: boolean;
  globalMiddleware?: Middleware[];
  defaultAuthMiddleware?: RouteMiddleware;
}

export class FullStackBridge {
  private routes: Map<string, LegacyRouteDefinition<any, any, any>> = new Map();
  private routeMetadata: Map<string, RouteMetadata> = new Map();
  private prefix: string;
  private validateResponses: boolean;
  private logRequests: boolean;
  private globalMiddleware: Middleware[];
  private defaultAuthMiddleware?: RouteMiddleware;

  constructor(config: LegacyBridgeConfig = {}) {
    this.prefix = config.prefix ?? '/api';
    this.validateResponses = config.validateResponses ?? true;
    this.logRequests = config.logRequests ?? false;
    this.globalMiddleware = config.globalMiddleware ?? [];
    this.defaultAuthMiddleware = config.defaultAuthMiddleware;
  }

  defineRoutes<T extends LegacyRoutesCollection>(routeDefs: T): T & { __routes: T } {
    for (const [name, def] of Object.entries(routeDefs)) {
      this.routes.set(name, {
        method: def.method ?? 'POST',
        input: def.input,
        output: def.output,
        handler: def.handler,
        auth: def.auth ?? false,
        middleware: def.middleware ?? [],
        description: def.description,
        tags: def.tags ?? [],
      });

      this.routeMetadata.set(name, {
        path: `${this.prefix}/${name}`,
        method: def.method ?? 'POST',
        description: def.description,
        tags: def.tags,
        requires_auth: !!def.auth,
        input_schema: def.input,
        output_schema: def.output,
      });
    }
    return { ...(routeDefs as T), __routes: routeDefs };
  }

  getMetadata(): RouteMetadata[] {
    return Array.from(this.routeMetadata.values());
  }

  createMiddleware() {
    return async (req: ExpressRequest, res: ExpressResponse, next: ExpressNextFunction) => {
      for (const mw of this.globalMiddleware) {
        await new Promise<void>((resolve, reject) => {
          mw(req, res, (err?: any) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      // Prefer Express route param when mounted as `/api/:route`,
      // fall back to deriving from originalUrl/url.
      const derived = new URL(
        (req as any).originalUrl ?? (req as any).url,
        `http://${req.headers.host}`
      ).pathname
        .replace(this.prefix + '/', '')
        .replace(/^\//, '');

      const routeName = (req as any).params?.route ?? derived;

      const routeDef = this.routes.get(routeName);
      if (!routeDef) {
        return this.sendError(res, 404, 'route_not_found', `Route ${routeName} not found`);
      }

      try {
        const method = (req.method as HttpMethod) || 'POST';
        const expectedMethod = routeDef.method ?? 'POST';
        if (method !== expectedMethod) {
          return this.sendError(
            res,
            405,
            'method_not_allowed',
            `Expected ${expectedMethod}, got ${method}`
          );
        }

        let input: unknown;
        if (expectedMethod === 'GET') {
          const original = (req as any).originalUrl ?? (req as any).url;
          const urlObj = new URL(original, `http://${req.headers.host}`);
          const queryObj: Record<string, unknown> = {};
          for (const [k, v] of urlObj.searchParams.entries()) {
            queryObj[k] = v;
          }
          input = queryObj;
        } else {
          input = (req as any).body;
        }

        if (this.logRequests) {
          console.log(`[${expectedMethod}] ${routeName}`, input ?? {});
        }
        if (routeDef.input) {
          const validation = routeDef.input.safeParse(input);
          if (!validation.success) {
            return this.sendError(res, 400, 'validation_error', 'Invalid input', {
              issues: validation.error.issues,
            });
          }
          input = validation.data;
        }

        let context: Record<string, unknown> = {};
        if (routeDef.auth || routeDef.middleware?.length) {
          const authMw = routeDef.middleware?.[0] || this.defaultAuthMiddleware;
          if (authMw) {
            const authResult = await authMw(req, input);
            if (!authResult.authorized) {
              return this.sendError(res, 401, 'unauthorized', 'Unauthorized access');
            }
            context = authResult.context ?? {};
          } else if (routeDef.auth) {
            return this.sendError(res, 401, 'unauthorized', 'Route requires authentication');
          }
        }

        const result = await routeDef.handler(input, context);

        if (routeDef.output && this.validateResponses) {
          const validation = routeDef.output.safeParse(result);
          if (!validation.success) {
            console.error('Output validation failed:', validation.error);
            return this.sendError(
              res,
              500,
              'internal_error',
              'Output validation failed (server bug)',
              { issues: validation.error.issues }
            );
          }
        }

        return this.sendSuccess(res, 200, result);
      } catch (error) {
        console.error('Route error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return this.sendError(res, 500, 'internal_error', message);
      }
    };
  }

  createClient<T extends LegacyRoutesCollection>(
    routeDefs: T,
    options?: { baseUrl?: string; onError?: (error: ApiError) => void }
  ): ExtractRoutes<T> {
    const client = {} as ExtractRoutes<T>;
    const baseUrl = options?.baseUrl ?? this.prefix;

    (Object.keys(routeDefs) as Array<keyof T>).forEach((routeName) => {
      const routeDef = routeDefs[routeName];
      (client[routeName] as any) = async (input?: unknown) => {
        const method = routeDef.method ?? 'POST';
        let url = `${baseUrl}/${String(routeName)}`;

        if (method === 'GET' && input && typeof input === 'object') {
          const params = new URLSearchParams();
          for (const [k, v] of Object.entries(input as Record<string, any>)) {
            if (v === undefined || v === null) continue;
            params.append(k, String(v));
          }
          const qs = params.toString();
          if (qs) url += `?${qs}`;
        }

        try {
          const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: method === 'GET' ? undefined : JSON.stringify(input ?? {}),
          });

          const data = (await response.json()) as ApiResponse<unknown>;

          if (data.status === 'error') {
            options?.onError?.(data);
            throw new Error(`[${data.code}] ${data.error}`);
          }

          return (data as ApiSuccess<unknown>).data;
        } catch (error) {
          console.error(`API call failed: ${url}`, error);
          throw error;
        }
      };
    });

    return client;
  }

  private sendSuccess(res: ExpressResponse, statusCode: number, data: unknown) {
    const response: ApiSuccess<unknown> = {
      status: 'success',
      data,
      timestamp: Date.now(),
    };
    return res.status(statusCode).json(response);
  }

  private sendError(
    res: ExpressResponse,
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    const response: ApiError = {
      status: 'error',
      error: message,
      code,
      details,
      timestamp: Date.now(),
    };
    return res.status(statusCode).json(response);
  }
}

// ============================================================================
// PUBLIC SETUP API - setupBridge for server initialization
// ============================================================================

import type { BridgeConfig as NewBridgeConfig, SetupBridgeOptions as NewSetupBridgeOptions, RoutesCollection as NewRoutesCollection } from './shared/types';
import { createExpressMiddleware } from './express';
import { createHonoMiddleware } from './hono';
import { createBunMiddleware } from './bun';

/**
 * Sets up the bridge with automatic runtime detection and hooks support.
 * 
 * This function:
 * - Detects available runtime (Express or Hono)
 * - Creates appropriate middleware adapter
 * - Supports global and route-specific hooks
 * - Generates type-safe client API
 * 
 * @template T - Routes collection type
 * @param routes - Route definitions
 * @param options - Bridge configuration options
 * @returns Object with middleware, metadata, and client API
 * 
 * @example
 * ```typescript
 * // With Express (auto-detected)
 * const { middleware, $api } = setupBridge(routes, {
 *   prefix: '/api',
 *   hooks: [rateLimitHook, loggerHook]
 * });
 * 
 * app.use('/api/:route', middleware);
 * ```
 * 
 * @example
 * ```typescript
 * // With Hono (auto-detected)
 * const { middleware, $api } = setupBridge(routes, {
 *   prefix: '/api',
 *   hooks: [rateLimitHook, loggerHook]
 * });
 * 
 * app.use('/api/:route', middleware);
 * ```
 * 
 * @example
 * ```typescript
 * // Explicitly specify runtime
 * const { middleware, $api } = setupBridge(routes, {
 *   runtime: 'hono',
 *   hooks: [rateLimitHook]
 * });
 * ```
 */
export function setupBridge<T extends LegacyRoutesCollection>(
  routes: T,
  options?: NewSetupBridgeOptions
) {
  // Detect runtime
  const runtime = options?.runtime ?? detectRuntime();

  if (!runtime) {
    throw new Error(
      'No runtime detected. Please install either express or hono:\n' +
      '  npm install express\n' +
      '  or\n' +
      '  npm install hono'
    );
  }

  // Convert routes to Map
  const routesMap = new Map(Object.entries(routes));

  // Create bridge config
  const config: NewBridgeConfig = {
    prefix: options?.prefix,
    validateResponses: options?.validateResponses,
    logRequests: options?.logRequests,
    hooks: options?.hooks,
  };

  // Load appropriate adapter
  let middleware: any;
  if (runtime === 'express') {
    middleware = createExpressMiddleware(routesMap, config);
  } else if (runtime === 'hono') {
    middleware = createHonoMiddleware(routesMap, config);
  } else if (runtime === 'bun') {
    middleware = createBunMiddleware(routesMap, config);
  }

  // Create metadata function
  const metadata = () => {
    const prefix = config.prefix ?? '/api';
    return Array.from(routesMap.entries()).map(([name, def]) => ({
      path: `${prefix}/${name}`,
      method: def.method ?? 'POST',
      description: def.description,
      tags: def.tags,
      requires_auth: false, // Deprecated, use hooks instead
      input_schema: def.input,
      output_schema: def.output,
    }));
  };

  // Create client API (runtime-agnostic, uses legacy bridge for now)
  let $api: ExtractRoutes<T>;
  try {
    const bridge = new FullStackBridge(options);
    const defined = bridge.defineRoutes(routes);
    $api = bridge.createClient(defined.__routes, {
      baseUrl: options?.baseUrl ?? options?.prefix ?? '/api',
      onError: options?.clientOptions?.onError,
    });
  } catch (error) {
    // If FullStackBridge fails (missing Express types), create a simple client
    console.warn('Client API creation failed, using fallback');
    $api = {} as ExtractRoutes<T>;
  }

  return {
    middleware,
    metadata,
    $api,
  };
}