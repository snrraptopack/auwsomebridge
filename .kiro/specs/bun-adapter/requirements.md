# Requirements Document: Bun Adapter

## Introduction

This document specifies the requirements for adding a Bun runtime adapter to the bridge. Currently, the bridge supports Express and Hono runtimes. This feature will add native Bun support, allowing developers to use Bun's built-in HTTP server with the bridge's validation, hooks, and type-safety features. This enables zero-dependency fullstack applications with Bun's native performance.

## Glossary

- **Bun**: A fast JavaScript runtime with built-in HTTP server, bundler, and transpiler
- **Bun Adapter**: The runtime adapter that integrates the bridge with Bun's native HTTP server
- **Fetch Handler**: A function that receives a `Request` and returns a `Response` (Web API standard)
- **Runtime Adapter**: Platform-specific code that integrates the bridge with a server framework
- **HookExecutor**: The shared execution engine for lifecycle hooks
- **NormalizedRequest**: Platform-agnostic request representation used by the bridge
- **Web API**: Standard browser APIs (Request, Response, Headers) that Bun implements natively

## Requirements

### Requirement 1

**User Story:** As a developer, I want to use the bridge with Bun's native HTTP server, so that I can build fullstack applications without Express or Hono dependencies.

#### Acceptance Criteria

1. WHEN a developer specifies `runtime: 'bun'` in setupBridge, THE bridge SHALL create a Bun-compatible fetch handler
2. WHEN the Bun adapter is used, THE bridge SHALL use Bun's native Request and Response objects
3. THE Bun adapter SHALL support all HTTP methods (GET, POST, PUT, PATCH, DELETE)
4. THE Bun adapter SHALL work with Bun.serve() without additional configuration
5. THE Bun adapter SHALL have zero external dependencies (no Express or Hono required)

### Requirement 2

**User Story:** As a developer, I want the Bun adapter to support all lifecycle hooks, so that I can use before/after/cleanup hooks with Bun just like Express and Hono.

#### Acceptance Criteria

1. THE Bun adapter SHALL use the same HookExecutor as Express and Hono adapters
2. WHEN lifecycle hooks are configured, THE Bun adapter SHALL execute before hooks before the handler
3. WHEN lifecycle hooks are configured, THE Bun adapter SHALL execute after hooks after successful handler execution
4. WHEN lifecycle hooks are configured, THE Bun adapter SHALL always execute cleanup hooks
5. THE Bun adapter SHALL provide the same HookContext to hooks as other adapters

### Requirement 3

**User Story:** As a developer, I want the Bun adapter to support input and output validation, so that I can validate requests and responses with Zod schemas.

#### Acceptance Criteria

1. WHEN a route has an input schema, THE Bun adapter SHALL validate the request input
2. WHEN input validation fails, THE Bun adapter SHALL return a 400 error with validation details
3. WHEN a route has an output schema and validateResponses is enabled, THE Bun adapter SHALL validate the handler response
4. WHEN output validation fails, THE Bun adapter SHALL return a 500 error
5. THE Bun adapter SHALL validate output after all after hooks complete

### Requirement 4

**User Story:** As a developer, I want the Bun adapter to normalize Bun's Request object, so that hooks and handlers work identically across all runtimes.

#### Acceptance Criteria

1. THE Bun adapter SHALL convert Bun's Request to NormalizedRequest
2. THE NormalizedRequest SHALL include method, headers, body, query, params, ip, and url
3. THE Bun adapter SHALL parse JSON bodies for POST/PUT/PATCH requests
4. THE Bun adapter SHALL parse query parameters for GET requests
5. THE Bun adapter SHALL extract route parameters from the URL path

### Requirement 5

**User Story:** As a developer, I want the Bun adapter to provide platform context, so that hooks can access Bun-specific features when needed.

#### Acceptance Criteria

1. THE Bun adapter SHALL provide a platform context with type 'bun'
2. THE platform context SHALL include the native Bun Request object
3. THE platform context SHALL be accessible via ctx.platform in hooks
4. THE platform context SHALL be accessible via context.platform in handlers
5. THE Bun adapter SHALL maintain the same platform context structure as Express and Hono

### Requirement 6

**User Story:** As a developer, I want the Bun adapter to return standard Response objects, so that it works seamlessly with Bun.serve().

#### Acceptance Criteria

1. THE Bun adapter SHALL return native Response objects (Web API standard)
2. WHEN a request succeeds, THE Bun adapter SHALL return a Response with status 200 and JSON body
3. WHEN a request fails, THE Bun adapter SHALL return a Response with appropriate error status and JSON body
4. THE Response SHALL use the same ApiSuccess and ApiError formats as other adapters
5. THE Bun adapter SHALL set appropriate Content-Type headers for JSON responses

### Requirement 7

**User Story:** As a developer, I want the Bun adapter to support the same configuration options as other adapters, so that I have a consistent API across runtimes.

#### Acceptance Criteria

1. THE Bun adapter SHALL support the prefix configuration option
2. THE Bun adapter SHALL support the validateResponses configuration option
3. THE Bun adapter SHALL support the logRequests configuration option
4. THE Bun adapter SHALL support global hooks configuration
5. THE Bun adapter SHALL support per-route hooks

### Requirement 8

**User Story:** As a developer, I want setupBridge to detect Bun runtime automatically, so that I don't need to specify it explicitly when using Bun.

#### Acceptance Criteria

1. WHEN setupBridge is called in a Bun environment without runtime specified, THE bridge SHALL detect Bun automatically
2. WHEN runtime: 'bun' is explicitly specified, THE bridge SHALL use the Bun adapter
3. THE runtime detection SHALL check for Bun-specific globals or environment variables
4. THE bridge SHALL throw a clear error if Bun runtime is requested but not available
5. THE bridge SHALL maintain backward compatibility with Express and Hono detection

### Requirement 9

**User Story:** As a developer, I want the Bun adapter to handle errors gracefully, so that my application doesn't crash on unexpected errors.

#### Acceptance Criteria

1. WHEN an unexpected error occurs in the adapter, THE Bun adapter SHALL catch it and return a 500 error
2. WHEN a hook throws an error, THE Bun adapter SHALL handle it according to lifecycle rules
3. WHEN a handler throws an error, THE Bun adapter SHALL return a 500 error with the error message
4. THE Bun adapter SHALL log errors to the console for debugging
5. THE Bun adapter SHALL ensure cleanup hooks run even when errors occur

### Requirement 10

**User Story:** As a developer, I want the Bun adapter to work with the type-safe client API, so that I get full autocomplete and type checking.

#### Acceptance Criteria

1. THE setupBridge function SHALL generate a type-safe $api client when using Bun runtime
2. THE $api client SHALL work with Bun's native fetch implementation
3. THE $api client SHALL have the same API as Express and Hono clients
4. THE $api client SHALL provide full TypeScript autocomplete for routes
5. THE $api client SHALL handle errors consistently with other runtimes
