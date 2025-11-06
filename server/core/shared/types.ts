import { z } from 'zod';

// ============================================================================
// HTTP TYPES
// ============================================================================

/**
 * HTTP methods supported by the bridge
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Normalized request object that abstracts Express/Hono differences.
 * This allows hooks and handlers to work identically across runtimes.
 */
export interface NormalizedRequest {
  /** HTTP method of the request */
  method: HttpMethod;
  /** Request headers */
  headers: Record<string, string | string[] | undefined>;
  /** Request body (already parsed) */
  body: unknown;
  /** Query string parameters */
  query: Record<string, string | string[]>;
  /** URL path parameters */
  params: Record<string, string>;
  /** Client IP address (if available) */
  ip?: string;
  /** Full request URL */
  url: string;
}

/**
 * Successful API response structure
 * @template T - Type of the response data
 */
export interface ApiSuccess<T> {
  /** Response status indicator */
  status: 'success';
  /** Response data */
  data: T;
  /** Unix timestamp when response was created */
  timestamp: number;
}

/**
 * Error API response structure
 */
export interface ApiError {
  /** Response status indicator */
  status: 'error';
  /** Human-readable error message */
  error: string;
  /** Machine-readable error code */
  code: string;
  /** Additional error details (e.g., validation errors) */
  details?: Record<string, unknown>;
  /** Unix timestamp when error occurred */
  timestamp: number;
}

/**
 * Union type for all possible API responses
 * @template T - Type of the success response data
 */
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ============================================================================
// HOOK TYPES
// ============================================================================

/**
 * Result returned by hooks to control execution flow.
 * 
 * Hooks can:
 * - Continue to next hook: `{ next: true }`
 * - Skip handler and return response: `{ next: true, response: data }`
 * - Stop with error: `{ next: false, status: 401, error: 'Unauthorized' }`
 */
export type HookResult =
  | { next: true }
  | { next: true; response: any }
  | { next: false; status: number; error: string };

/**
 * Context object passed to hooks containing request info and mutable state.
 * 
 * @template TContext - Type of the context object (defaults to Record<string, any>)
 * 
 * @example
 * ```typescript
 * const authHook = defineHook({
 *   name: 'auth',
 *   handler: async (ctx) => {
 *     // Access request info
 *     const token = ctx.req.headers.authorization;
 *     
 *     // Modify context for next hooks/handler
 *     ctx.context.userId = 'user-123';
 *     
 *     return { next: true };
 *   }
 * });
 * ```
 */
export interface HookContext<TContext = Record<string, any>> {
  /** Normalized request object */
  req: NormalizedRequest;
  /** HTTP method */
  method: HttpMethod;
  /** Route name (e.g., 'getUserById') */
  route: string;
  /** Validated input data from request */
  input: unknown;
  /** Mutable context object shared across hooks and handler */
  context: TContext;
}

/**
 * Hook function signature.
 * 
 * A hook receives context and returns a result that controls execution flow.
 * 
 * @param ctx - Hook context containing request info and mutable state
 * @returns Hook result indicating whether to continue, stop, or return early
 * 
 * @example
 * ```typescript
 * const myHook: RouteHook = async (ctx) => {
 *   if (!ctx.req.headers.authorization) {
 *     return { next: false, status: 401, error: 'Unauthorized' };
 *   }
 *   return { next: true };
 * };
 * ```
 */
export type RouteHook = (ctx: HookContext) => HookResult | Promise<HookResult>;

/**
 * Hook definition configuration.
 * 
 * @template TConfig - Configuration type for the hook (void if no config needed)
 * @template TState - State type returned by setup function
 * 
 * @example
 * ```typescript
 * // Hook without config
 * const loggerDef: HookDefinition = {
 *   name: 'logger',
 *   handler: (ctx) => {
 *     console.log(ctx.route);
 *     return { next: true };
 *   }
 * };
 * 
 * // Hook with config and state
 * const rateLimitDef: HookDefinition<{ max: number }> = {
 *   name: 'rateLimit',
 *   setup: (config) => ({ counter: 0, max: config.max }),
 *   handler: (ctx, state) => {
 *     state.counter++;
 *     if (state.counter > state.max) {
 *       return { next: false, status: 429, error: 'Too many requests' };
 *     }
 *     return { next: true };
 *   }
 * };
 * ```
 */
export type HookDefinition<TConfig = void, TState = any> =
  | {
      /** Hook name for debugging and logging */
      name: string;
      /** Setup function to initialize state (called once per hook instance) */
      setup: (config: TConfig) => TState;
      /** Hook handler function that processes requests with state */
      handler: (ctx: HookContext, state: TState) => HookResult | Promise<HookResult>;
    }
  | {
      /** Hook name for debugging and logging */
      name: string;
      /** No setup function */
      setup?: never;
      /** Hook handler function that processes requests without state */
      handler: (ctx: HookContext) => HookResult | Promise<HookResult>;
    };

// ============================================================================
// ROUTE TYPES
// ============================================================================

/**
 * Route handler function signature.
 * 
 * @template Input - Type of the validated input
 * @template Output - Type of the handler output
 * @template Context - Type of the context object (populated by hooks)
 * 
 * @param input - Validated input data
 * @param context - Context object populated by hooks
 * @returns Handler output (will be validated against output schema if provided)
 */
export type RouteHandler<
  Input = unknown,
  Output = unknown,
  Context = unknown
> = (input: Input, context?: Context) => Promise<Output> | Output;

/**
 * Helper type to extract input parameters from Zod schema
 */
export type InputParams<I extends z.ZodTypeAny | undefined> = I extends z.ZodTypeAny
  ? z.input<I>
  : never;

/**
 * Helper type to extract parsed input from Zod schema
 */
export type ParsedInput<I extends z.ZodTypeAny | undefined> = I extends z.ZodTypeAny
  ? z.output<I>
  : never;

/**
 * Helper type to extract output data from Zod schema
 */
export type OutputData<O extends z.ZodTypeAny | undefined> = O extends z.ZodTypeAny
  ? z.output<O>
  : unknown;

/**
 * Route definition with hooks support.
 * 
 * @template I - Input Zod schema type (undefined if no input validation)
 * @template O - Output Zod schema type (undefined if no output validation)
 * @template C - Context type
 * 
 * @example
 * ```typescript
 * const getUserRoute: RouteDefinition = {
 *   method: 'GET',
 *   input: z.object({ id: z.string() }),
 *   output: z.object({ id: z.string(), name: z.string() }),
 *   hooks: [authHook, loggerHook],
 *   handler: async ({ id }, context) => {
 *     return { id, name: 'John Doe' };
 *   }
 * };
 * ```
 */
export interface RouteDefinition<
  I extends z.ZodTypeAny | undefined = undefined,
  O extends z.ZodTypeAny | undefined = undefined,
  C = unknown
> {
  /** HTTP method (defaults to POST) */
  method?: HttpMethod;
  /** Input validation schema */
  input?: I;
  /** Output validation schema */
  output?: O;
  /** Route handler function */
  handler: RouteHandler<ParsedInput<I>, OutputData<O>, C>;
  /** Route-specific hooks (executed after global hooks) */
  hooks?: RouteHook[];
  /** Route description for documentation */
  description?: string;
  /** Tags for grouping routes */
  tags?: string[];
}

/**
 * Collection of route definitions.
 * 
 * @example
 * ```typescript
 * const userRoutes: RoutesCollection = {
 *   getUser: defineRoute({ ... }),
 *   createUser: defineRoute({ ... }),
 *   updateUser: defineRoute({ ... })
 * };
 * ```
 */
export type RoutesCollection = Record<string, RouteDefinition<any, any, any>>;

/**
 * Extracts client API types from route definitions.
 * 
 * @template T - Routes collection type
 */
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

/**
 * Route metadata for documentation and introspection.
 */
export interface RouteMetadata {
  /** Full route path including prefix */
  path: string;
  /** HTTP method */
  method: HttpMethod;
  /** Route description */
  description?: string;
  /** Route tags */
  tags?: string[];
  /** Whether route requires authentication (deprecated, use hooks instead) */
  requires_auth: boolean;
  /** Input validation schema */
  input_schema?: z.ZodTypeAny;
  /** Output validation schema */
  output_schema?: z.ZodTypeAny;
}

// ============================================================================
// BRIDGE CONFIGURATION TYPES
// ============================================================================

/**
 * Bridge configuration options.
 * 
 * @example
 * ```typescript
 * const config: BridgeConfig = {
 *   prefix: '/api',
 *   validateResponses: true,
 *   logRequests: true,
 *   hooks: [rateLimitHook, loggerHook]
 * };
 * ```
 */
export interface BridgeConfig {
  /** API route prefix (e.g., '/api') */
  prefix?: string;
  /** Whether to validate handler outputs against schemas */
  validateResponses?: boolean;
  /** Whether to log all requests */
  logRequests?: boolean;
  /** Global hooks applied to all routes */
  hooks?: RouteHook[];
}

/**
 * Runtime type for the bridge.
 * Determines which server framework to use.
 */
export type Runtime = 'express' | 'hono';

/**
 * Extended bridge configuration with runtime options.
 */
export interface SetupBridgeOptions extends BridgeConfig {
  /** Base URL for client API calls */
  baseUrl?: string;
  /** Client-specific options */
  clientOptions?: { 
    /** Error handler for client API calls */
    onError?: (error: ApiError) => void 
  };
  /** Explicitly specify runtime (auto-detected if not provided) */
  runtime?: Runtime;
}
