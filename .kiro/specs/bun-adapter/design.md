# Design Document: Bun Adapter

## Overview

This design adds a third runtime adapter to the bridge, enabling native Bun HTTP server support alongside Express and Hono. The Bun adapter leverages Bun's native Web API implementation (Request/Response) and integrates with the existing hook execution engine, providing the same DX as other runtimes with zero external dependencies.

### Key Design Principles

1. **Web API Standard**: Use native Request/Response objects (no framework abstractions)
2. **Zero Dependencies**: No Express or Hono required
3. **Shared Execution**: Reuse HookExecutor and validation logic
4. **Consistent DX**: Same API as Express/Hono adapters
5. **Native Performance**: Leverage Bun's speed without overhead

## Architecture

### Current Architecture

```
setupBridge() → detectRuntime() → {
  'express' → createExpressMiddleware()
  'hono' → createHonoMiddleware()
}
```

### New Architecture

```
setupBridge() → detectRuntime() → {
  'express' → createExpressMiddleware()
  'hono' → createHonoMiddleware()
  'bun' → createBunMiddleware()  // NEW!
}
```

### Bun Adapter Flow

```
Bun.serve({ fetch: handler })
  ↓
Request (Web API)
  ↓
createBunMiddleware()
  ↓
normalizeBunRequest()
  ↓
HookExecutor.execute()
  ↓
[Before Hooks] → Handler → [After Hooks] → [Cleanup Hooks]
  ↓
Response (Web API)
```

## Components and Interfaces

### 1. Directory Structure

```
server/core/bun/
├── adapter.ts       - Main Bun adapter (creates fetch handler)
├── normalize.ts     - Normalize Bun Request to NormalizedRequest
└── index.ts         - Export adapter functions
```

### 2. Bun Adapter (adapter.ts)

```typescript
// server/core/bun/adapter.ts

import type { RouteDefinition, BridgeConfig, HookContext } from '../shared/types';
import { HookExecutor } from '../shared/executor';
import { validateInput, validateOutput } from '../shared/validation';
import {
  formatSuccessResponse,
  formatErrorResponse,
  formatValidationErrorResponse,
} from '../shared/response';
import { HttpStatus, ErrorCode } from '../shared/error';
import { normalizeBunRequest } from './normalize';

/**
 * Creates a Bun fetch handler from bridge configuration.
 * 
 * @param routes - Map of route definitions
 * @param config - Bridge configuration
 * @returns Fetch handler compatible with Bun.serve()
 */
export function createBunMiddleware(
  routes: Map<string, RouteDefinition>,
  config: BridgeConfig
): (req: Request) => Promise<Response> {
  const executor = new HookExecutor();
  const globalHooks = config.hooks || [];

  return async (req: Request): Promise<Response> => {
    try {
      // Extract route name from URL
      const url = new URL(req.url);
      const routeName = extractRouteFromUrl(url.pathname, config.prefix);

      if (!routeName) {
        return sendBunError(HttpStatus.NOT_FOUND, ErrorCode.ROUTE_NOT_FOUND, 'Route not found');
      }

      const routeDef = routes.get(routeName);
      if (!routeDef) {
        return sendBunError(
          HttpStatus.NOT_FOUND,
          ErrorCode.ROUTE_NOT_FOUND,
          `Route ${routeName} not found`
        );
      }

      // Validate HTTP method
      const expectedMethod = routeDef.method || 'POST';
      if (req.method !== expectedMethod) {
        return sendBunError(
          HttpStatus.METHOD_NOT_ALLOWED,
          ErrorCode.METHOD_NOT_ALLOWED,
          `Expected ${expectedMethod}, got ${req.method}`
        );
      }

      // Extract input based on method
      let input: unknown;
      if (expectedMethod === 'GET') {
        // Parse query parameters
        const query: Record<string, string | string[]> = {};
        url.searchParams.forEach((value, key) => {
          const existing = query[key];
          if (existing) {
            if (Array.isArray(existing)) {
              existing.push(value);
            } else {
              query[key] = [existing, value];
            }
          } else {
            query[key] = value;
          }
        });
        input = query;
      } else {
        // Parse JSON body
        try {
          input = await req.json();
        } catch {
          input = {};
        }
      }

      // Log request if enabled
      if (config.logRequests) {
        console.log(`[${expectedMethod}] ${routeName}`, input || {});
      }

      // Validate input
      if (routeDef.input) {
        const validation = validateInput(routeDef.input, input);
        if (!validation.success) {
          const errorResponse = formatValidationErrorResponse(validation.errors!);
          return Response.json(errorResponse, { status: HttpStatus.BAD_REQUEST });
        }
        input = validation.data;
      }

      // Normalize request
      const normalizedReq = await normalizeBunRequest(req, url, input);

      // Create platform context (native Bun Request)
      const platform = { type: 'bun' as const, req };
      const hookContext: HookContext = {
        req: normalizedReq,
        platform,
        method: expectedMethod,
        route: routeName,
        input,
        context: { platform },
      };

      // Combine global and route hooks
      const allHooks = executor.combineHooks(globalHooks, routeDef.hooks);

      // Execute hooks and handler
      const result = await executor.execute(allHooks, routeDef.handler as any, hookContext);

      // Handle execution result
      if (!result.success) {
        const errorResponse = formatErrorResponse(
          ErrorCode.INTERNAL_ERROR,
          result.error,
          { status: result.status }
        );
        return Response.json(errorResponse, { status: result.status });
      }

      // Validate output if enabled
      if (routeDef.output && config.validateResponses) {
        const validation = validateOutput(routeDef.output, result.data);
        if (!validation.success) {
          console.error('Output validation failed:', validation.errors);
          const errorResponse = formatErrorResponse(
            ErrorCode.INTERNAL_ERROR,
            'Output validation failed (server bug)',
            { issues: validation.errors }
          );
          return Response.json(errorResponse, { status: HttpStatus.INTERNAL_SERVER_ERROR });
        }
      }

      // Send success response
      return sendBunSuccess(result.data);
    } catch (error) {
      console.error('Bun adapter error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return sendBunError(HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_ERROR, message);
    }
  };
}

/**
 * Sends success response in Bun format (native Response).
 */
function sendBunSuccess(data: any): Response {
  const response = formatSuccessResponse(data);
  return Response.json(response, { status: HttpStatus.OK });
}

/**
 * Sends error response in Bun format (native Response).
 */
function sendBunError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
): Response {
  const response = formatErrorResponse(code, message, details);
  return Response.json(response, { status });
}

/**
 * Extracts route name from URL path.
 */
function extractRouteFromUrl(pathname: string, prefix?: string): string | null {
  const cleanPrefix = prefix || '/api';
  const prefixPattern = cleanPrefix.replace(/\//g, '\\/');
  const match = pathname.match(new RegExp(`${prefixPattern}/([^/]+)`));
  return match ? match[1] : null;
}
```

### 3. Request Normalization (normalize.ts)

```typescript
// server/core/bun/normalize.ts

import type { NormalizedRequest, HttpMethod } from '../shared/types';

/**
 * Normalizes Bun's Request to NormalizedRequest.
 * 
 * @param req - Native Bun Request object
 * @param url - Parsed URL object
 * @param body - Parsed body (if applicable)
 * @returns Normalized request object
 */
export async function normalizeBunRequest(
  req: Request,
  url: URL,
  body: unknown
): Promise<NormalizedRequest> {
  // Convert Headers to plain object
  const headers: Record<string, string | string[] | undefined> = {};
  req.headers.forEach((value, key) => {
    const existing = headers[key];
    if (existing) {
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        headers[key] = [existing, value];
      }
    } else {
      headers[key] = value;
    }
  });

  // Parse query parameters
  const query: Record<string, string | string[]> = {};
  url.searchParams.forEach((value, key) => {
    const existing = query[key];
    if (existing) {
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        query[key] = [existing, value];
      }
    } else {
      query[key] = value;
    }
  });

  // Extract path parameters (if route pattern matching is needed)
  // For now, params are empty as we use simple route names
  const params: Record<string, string> = {};

  // Get client IP (Bun-specific)
  // Note: Bun doesn't expose IP directly in Request, would need server context
  const ip = headers['x-forwarded-for'] as string | undefined || 
             headers['x-real-ip'] as string | undefined;

  return {
    method: req.method as HttpMethod,
    headers,
    body,
    query,
    params,
    ip,
    url: url.href,
  };
}
```

### 4. Platform Context Type

```typescript
// server/core/shared/types.ts (update)

export type PlatformContext =
  | {
      type: 'hono';
      c: HonoContext;
    }
  | {
      type: 'express';
      req: ExpressRequest;
      res: ExpressResponse;
    }
  | {
      type: 'bun';  // NEW!
      req: Request;  // Native Web API Request
    };
```

### 5. Runtime Detection Update

```typescript
// server/core/bridge.ts (update)

export function detectRuntime(): 'express' | 'hono' | 'bun' | null {
  const envRuntime = process.env?.BRIDGE_RUNTIME as 'express' | 'hono' | 'bun' | undefined;

  if (envRuntime === 'express' || envRuntime === 'hono' || envRuntime === 'bun') {
    return envRuntime;
  }

  // Detect Bun
  if (typeof Bun !== 'undefined') {
    return 'bun';
  }

  // Fallback to hono for ESM/SSR environments
  return 'hono';
}
```

### 6. setupBridge Integration

```typescript
// server/core/bridge.ts (update)

import { createBunMiddleware } from './bun';

export function setupBridge<T extends LegacyRoutesCollection>(
  routes: T,
  options?: NewSetupBridgeOptions
) {
  const runtime = options?.runtime ?? detectRuntime();

  if (!runtime) {
    throw new Error('No runtime detected');
  }

  const routesMap = new Map(Object.entries(routes));
  const config: NewBridgeConfig = {
    prefix: options?.prefix,
    validateResponses: options?.validateResponses,
    logRequests: options?.logRequests,
    hooks: options?.hooks,
  };

  let middleware: any;
  if (runtime === 'express') {
    middleware = createExpressMiddleware(routesMap, config);
  } else if (runtime === 'hono') {
    middleware = createHonoMiddleware(routesMap, config);
  } else if (runtime === 'bun') {
    middleware = createBunMiddleware(routesMap, config);  // NEW!
  }

  // ... rest of setup
}
```

## Usage Examples

### Basic Usage

```typescript
import { setupBridge, defineRoute } from 'auwsomebridge';
import { z } from 'zod';

const routes = {
  getUser: defineRoute({
    method: 'GET',
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string(), name: z.string() }),
    handler: async ({ id }) => {
      return { id, name: 'John Doe' };
    },
  }),
};

const { middleware } = setupBridge(routes, {
  runtime: 'bun',  // or auto-detected
  prefix: '/api',
});

Bun.serve({
  port: 3000,
  fetch: middleware,
});
```

### With Lifecycle Hooks

```typescript
import { setupBridge, defineHook } from 'auwsomebridge';

const metricsHook = defineHook({
  name: 'metrics',
  before: (ctx) => {
    ctx.context.startTime = Date.now();
    return { next: true };
  },
  cleanup: (ctx) => {
    const duration = Date.now() - ctx.context.startTime;
    console.log(`${ctx.route}: ${duration}ms`);
    return { next: true };
  },
});

const { middleware } = setupBridge(routes, {
  runtime: 'bun',
  hooks: [metricsHook],
});

Bun.serve({
  port: 3000,
  fetch: middleware,
});
```

### With Static Files

```typescript
const { middleware: apiHandler } = setupBridge(routes, {
  runtime: 'bun',
});

Bun.serve({
  port: 3000,
  fetch: async (req) => {
    const url = new URL(req.url);
    
    // API routes
    if (url.pathname.startsWith('/api/')) {
      return apiHandler(req);
    }
    
    // Static files
    return new Response(Bun.file('./public/index.html'));
  },
});
```

## Testing Strategy

### Unit Tests
- Test `normalizeBunRequest` with various Request objects
- Test `extractRouteFromUrl` with different URL patterns
- Test error response formatting

### Integration Tests
- Test full request/response cycle with Bun adapter
- Test lifecycle hooks execution
- Test input/output validation
- Test error handling

### Compatibility Tests
- Verify same behavior as Express/Hono adapters
- Test with existing hook implementations
- Test with type-safe client API

## Migration Path

### For New Projects
Use Bun adapter directly - zero dependencies needed.

### For Existing Projects
Switch runtime from 'express'/'hono' to 'bun' - hooks and routes work identically.

## Performance Considerations

- Native Request/Response (no serialization overhead)
- Zero framework dependencies
- Bun's native speed for JSON parsing
- Shared HookExecutor (no duplication)

## Benefits Over Express/Hono

1. **Zero Dependencies**: No framework installation needed
2. **Native Performance**: Bun's optimized Request/Response handling
3. **Simpler Stack**: One runtime for everything (server + bundler + transpiler)
4. **Web Standards**: Uses standard Web APIs (portable to other runtimes)
5. **Smaller Bundle**: No framework code in production
