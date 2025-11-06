import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

// ============================================================================
// SHARED TYPES
// ============================================================================

export interface ApiSuccess<T> {
  status: 'success';
  data: T;
  timestamp: number;
}

export interface ApiError {
  status: 'error';
  error: string;
  code: string;
  details?: Record<string, unknown>;
  timestamp: number;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type Middleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void> | void;

export type RouteMiddleware = (
  req: Request,
  input: unknown
) => Promise<{ authorized: boolean; context?: Record<string, unknown> }>;

export type RouteHandler<
  Input = unknown,
  Output = unknown,
  Context = unknown
> = (input: Input, context?: Context) => Promise<Output> | Output;

type InputParams<I extends z.ZodTypeAny | undefined> = I extends z.ZodTypeAny
  ? z.input<I>
  : never;
type ParsedInput<I extends z.ZodTypeAny | undefined> = I extends z.ZodTypeAny
  ? z.output<I>
  : never;
type OutputData<O extends z.ZodTypeAny | undefined> = O extends z.ZodTypeAny
  ? z.output<O>
  : never;

export interface RouteDefinition<
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
}

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
  description?: string;
  tags?: string[];
}): RouteDefinition<I, O, C> {
  return def as RouteDefinition<I, O, C>;
}

export type RoutesCollection = Record<string, RouteDefinition<any, any, any>>;

export type ExtractRoutes<T extends RoutesCollection> = {
  [K in keyof T]: T[K] extends RouteDefinition<
    infer I extends z.ZodTypeAny | undefined,
    infer O extends z.ZodTypeAny | undefined
  >
    ? I extends z.ZodTypeAny
      ? (input: InputParams<I>) => Promise<OutputData<O>>
      : () => Promise<OutputData<O>>
    : never;
};

export interface RouteMetadata {
  path: string;
  method: HttpMethod;
  description?: string;
  tags?: string[];
  requires_auth: boolean;
  input_schema?: z.ZodTypeAny;
  output_schema?: z.ZodTypeAny;
}

// ============================================================================
// COMPOSE ROUTES - Simple merging of route collections
// ============================================================================

export function composeRoutes<A extends RoutesCollection, B extends RoutesCollection>(
  a: A,
  b: B
): A & B;
export function composeRoutes<
  A extends RoutesCollection,
  B extends RoutesCollection,
  C extends RoutesCollection
>(a: A, b: B, c: C): A & B & C;
export function composeRoutes<
  A extends RoutesCollection,
  B extends RoutesCollection,
  C extends RoutesCollection,
  D extends RoutesCollection
>(a: A, b: B, c: C, d: D): A & B & C & D;
export function composeRoutes<
  A extends RoutesCollection,
  B extends RoutesCollection,
  C extends RoutesCollection,
  D extends RoutesCollection,
  E extends RoutesCollection
>(a: A, b: B, c: C, d: D, e: E): A & B & C & D & E;
export function composeRoutes(...collections: RoutesCollection[]): RoutesCollection {
  return Object.assign({}, ...collections);
}

// ============================================================================
// INTERNAL BRIDGE (hidden from developers)
// ============================================================================

export interface BridgeConfig {
  prefix?: string;
  validateResponses?: boolean;
  logRequests?: boolean;
  globalMiddleware?: Middleware[];
  defaultAuthMiddleware?: RouteMiddleware;
}

export class FullStackBridge {
  private routes: Map<string, RouteDefinition<any, any, any>> = new Map();
  private routeMetadata: Map<string, RouteMetadata> = new Map();
  private prefix: string;
  private validateResponses: boolean;
  private logRequests: boolean;
  private globalMiddleware: Middleware[];
  private defaultAuthMiddleware?: RouteMiddleware;

  constructor(config: BridgeConfig = {}) {
    this.prefix = config.prefix ?? '/api';
    this.validateResponses = config.validateResponses ?? true;
    this.logRequests = config.logRequests ?? false;
    this.globalMiddleware = config.globalMiddleware ?? [];
    this.defaultAuthMiddleware = config.defaultAuthMiddleware;
  }

  defineRoutes<T extends RoutesCollection>(routeDefs: T): T & { __routes: T } {
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
    return async (req: Request, res: Response, next: NextFunction) => {
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

  createClient<T extends RoutesCollection>(
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

  private sendSuccess(res: Response, statusCode: number, data: unknown) {
    const response: ApiSuccess<unknown> = {
      status: 'success',
      data,
      timestamp: Date.now(),
    };
    return res.status(statusCode).json(response);
  }

  private sendError(
    res: Response,
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

export interface SetupBridgeOptions extends BridgeConfig {
  baseUrl?: string;
  clientOptions?: { onError?: (error: ApiError) => void };
}

export function setupBridge<T extends RoutesCollection>(
  routes: T,
  options?: SetupBridgeOptions
) {
  const bridge = new FullStackBridge(options);
  const defined = bridge.defineRoutes(routes);

  return {
    // For backend Express setup
    middleware: bridge.createMiddleware(),
    metadata: () => bridge.getMetadata(),

    // For frontend
    $api: bridge.createClient(defined.__routes, {
      baseUrl: options?.baseUrl ?? options?.prefix ?? '/api',
      onError: options?.clientOptions?.onError,
    }),
  };
}