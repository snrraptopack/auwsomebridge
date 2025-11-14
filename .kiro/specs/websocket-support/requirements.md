# Requirements Document

## Introduction

This document specifies requirements for adding WebSocket support to auwsomebridge, a multi-runtime API bridge. The implementation must follow the established pattern where a single route definition works identically across Express, Hono, and Bun runtimes. WebSocket support will enable bidirectional, real-time communication between clients and servers, complementing the existing SSE (Server-Sent Events) unidirectional streaming capability.

## Glossary

- **Bridge**: The auwsomebridge library that provides runtime-agnostic API routing
- **Runtime**: The server framework (Express, Hono, or Bun) executing the application
- **Adapter**: Runtime-specific code that normalizes requests and responses for the Bridge
- **Route Definition**: A declarative configuration object defining an API endpoint
- **Handler**: The user-defined function that processes requests and returns responses
- **WebSocket**: A protocol providing full-duplex communication channels over a single TCP connection
- **SSE**: Server-Sent Events, the existing unidirectional streaming implementation
- **$ws Helper**: Type-safe client utility for establishing WebSocket connections
- **Connection Context**: Runtime-agnostic object representing an active WebSocket connection
- **Message Handler**: User-defined function that processes incoming WebSocket messages

## Requirements

### Requirement 1

**User Story:** As a developer using auwsomebridge, I want to define WebSocket routes using the same declarative pattern as HTTP and SSE routes, so that I can maintain consistency across my API definitions.

#### Acceptance Criteria

1. WHEN a developer defines a route with `kind: 'ws'`, THE Bridge SHALL recognize it as a WebSocket route
2. THE Bridge SHALL support WebSocket routes alongside existing HTTP and SSE routes in the same route collection
3. WHEN a WebSocket route is defined without specifying `kind`, THE Bridge SHALL default to HTTP behavior
4. THE Bridge SHALL validate that WebSocket routes use GET method or default to GET if no method is specified
5. THE Bridge SHALL allow developers to define WebSocket routes in any route file alongside other route types

### Requirement 2

**User Story:** As a developer, I want WebSocket handlers to receive connection lifecycle events (open, message, close, error), so that I can implement bidirectional communication logic.

#### Acceptance Criteria

1. WHEN a WebSocket connection is established, THE Bridge SHALL invoke the handler with a connection context object
2. THE connection context object SHALL provide methods for sending messages to the client
3. THE connection context object SHALL provide methods for closing the connection
4. THE connection context object SHALL expose connection metadata including client IP and headers
5. WHEN a client sends a message, THE Bridge SHALL invoke the user-defined message handler with the parsed message data
6. WHEN a connection closes, THE Bridge SHALL invoke the user-defined close handler if provided
7. WHEN a connection error occurs, THE Bridge SHALL invoke the user-defined error handler if provided

### Requirement 3

**User Story:** As a developer, I want WebSocket routes to work identically across Express, Hono, and Bun runtimes, so that I can switch runtimes without changing my application code.

#### Acceptance Criteria

1. WHEN a WebSocket route is defined, THE Express Adapter SHALL handle WebSocket connections using the ws library
2. WHEN a WebSocket route is defined, THE Hono Adapter SHALL handle WebSocket connections using Hono's native WebSocket support
3. WHEN a WebSocket route is defined, THE Bun Adapter SHALL handle WebSocket connections using Bun's native WebSocket support
4. THE Bridge SHALL normalize WebSocket connections across all runtimes into a common Connection Context interface
5. THE Bridge SHALL ensure message sending, receiving, and connection closing work identically across all three runtimes

### Requirement 4

**User Story:** As a developer, I want to validate incoming WebSocket messages using Zod schemas, so that I can ensure type safety and data integrity.

#### Acceptance Criteria

1. WHEN a WebSocket route defines an `input` schema, THE Bridge SHALL validate each incoming message against the schema
2. WHEN message validation fails, THE Bridge SHALL send an error message to the client and not invoke the message handler
3. WHEN message validation succeeds, THE Bridge SHALL pass the validated data to the message handler
4. THE Bridge SHALL support optional input validation where routes without `input` schemas receive raw message data
5. THE Bridge SHALL log validation errors when `logRequests` configuration is enabled

### Requirement 5

**User Story:** As a developer, I want to apply hooks to WebSocket routes for authentication and authorization, so that I can secure WebSocket connections using the same patterns as HTTP routes.

#### Acceptance Criteria

1. WHEN a WebSocket route defines hooks, THE Bridge SHALL execute before hooks during the connection handshake
2. WHEN a before hook returns `{ next: false }`, THE Bridge SHALL reject the WebSocket connection with an appropriate status code
3. WHEN before hooks succeed, THE Bridge SHALL populate the connection context with hook-provided data
4. THE Bridge SHALL execute cleanup hooks when a WebSocket connection closes
5. THE Bridge SHALL not execute after hooks for WebSocket routes since there is no single response

### Requirement 6

**User Story:** As a frontend developer, I want a type-safe `$ws` client helper similar to `$api` and `$sse`, so that I can establish WebSocket connections with full TypeScript support.

#### Acceptance Criteria

1. THE Bridge SHALL export a `$ws` object containing methods for each WebSocket route
2. WHEN a developer calls `$ws.routeName()`, THE Bridge SHALL return a WebSocket connection object
3. THE `$ws` helper SHALL accept connection options including message, close, error, and open handlers
4. THE `$ws` helper SHALL provide a type-safe `send` method that validates outgoing messages against the route's input schema
5. THE `$ws` helper SHALL work in both browser and Node/Bun environments using native WebSocket APIs
6. THE `$ws` helper SHALL construct the correct WebSocket URL from the configured base URL and route name

### Requirement 7

**User Story:** As a developer, I want WebSocket routes to support query parameters for initial connection data, so that I can pass authentication tokens or configuration during the handshake.

#### Acceptance Criteria

1. WHEN a WebSocket route is called with query parameters, THE Bridge SHALL parse and validate them against the route's input schema during handshake
2. THE Bridge SHALL make validated query parameters available to before hooks via the hook context
3. THE Bridge SHALL make validated query parameters available to the connection handler
4. WHEN query parameter validation fails, THE Bridge SHALL reject the WebSocket connection with a 400 status code
5. THE Bridge SHALL support WebSocket routes without query parameters where input validation applies only to messages

### Requirement 8

**User Story:** As a developer, I want clear error messages when WebSocket operations fail, so that I can debug connection and message handling issues.

#### Acceptance Criteria

1. WHEN a WebSocket handler throws an error, THE Bridge SHALL log the error with route and connection information
2. WHEN a WebSocket handler throws an error, THE Bridge SHALL send an error message to the client in a consistent format
3. WHEN a WebSocket connection fails during handshake, THE Bridge SHALL return an appropriate HTTP error response
4. THE Bridge SHALL include error details in development mode and sanitized messages in production
5. THE Bridge SHALL log all WebSocket errors when `logRequests` configuration is enabled
