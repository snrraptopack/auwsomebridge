# Implementation Plan

- [x] 1. Extend shared types for WebSocket support


  - Add WebSocket-specific types to `server/core/shared/types.ts`
  - Define `WebSocketConnection` interface
  - Define `WebSocketHandler` interface with lifecycle methods
  - Define `WebSocketMessageHandler` type
  - Update `RouteDefinition` to support `kind: 'ws'`
  - Update `RouteHandler` type to accept `WebSocketHandler`
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.4_

- [x] 2. Create WebSocket connection wrapper



  - [x] 2.1 Create `server/core/shared/websocket.ts`


    - Implement `WebSocketConnectionImpl` class
    - Implement `send()` method with compression support
    - Implement `close()` method
    - Store connection metadata (id, ip, headers, context)
    - Expose `raw` property for platform-specific features
    - _Requirements: 2.2, 2.3, 2.4, 3.4_
  

  - [ ] 2.2 Add connection ID generation utility
    - Create unique ID generator for connections





    - Use crypto.randomUUID() or fallback
    - _Requirements: 2.4_

- [ ] 3. Implement Express WebSocket adapter
  - [x] 3.1 Add ws library integration to Express adapter

    - Import `ws` library types
    - Create WebSocket server instance
    - Handle upgrade in `createExpressMiddleware`
    - Check for `kind: 'ws'` in route definition
    - _Requirements: 1.1, 3.1, 3.4_
  
  - [ ] 3.2 Implement Express WebSocket lifecycle
    - Execute before hooks during handshake

    - Validate query parameters with input schema
    - Call `server.upgrade()` on success
    - Wrap ws.WebSocket in WebSocketConnectionImpl




    - Wire up message, close, error handlers
    - Execute cleanup hooks on connection close
    - _Requirements: 2.1, 2.5, 2.6, 2.7, 5.1, 5.2, 5.3, 5.4, 7.1, 7.2, 7.3_
  

  - [ ] 3.3 Implement Express message validation
    - Validate incoming messages against input schema
    - Send error message on validation failure
    - Pass validated data to user handler
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 4. Implement Hono WebSocket adapter



  - [x] 4.1 Add Hono WebSocket integration


    - Import `upgradeWebSocket` from hono/websocket
    - Handle WebSocket routes in `createHonoMiddleware`
    - Check for `kind: 'ws'` in route definition
    - _Requirements: 1.1, 3.2, 3.4_



  
  - [x] 4.2 Implement Hono WebSocket lifecycle

    - Execute before hooks during handshake
    - Validate query parameters with input schema

    - Return WebSocket handler from `upgradeWebSocket()`
    - Wrap Hono WebSocket in WebSocketConnectionImpl
    - Wire up message, close, error, open handlers
    - Execute cleanup hooks on connection close
    - _Requirements: 2.1, 2.5, 2.6, 2.7, 5.1, 5.2, 5.3, 5.4, 7.1, 7.2, 7.3_
  

  - [x] 4.3 Implement Hono message validation

    - Validate incoming messages against input schema
    - Send error message on validation failure
    - Pass validated data to user handler
    - _Requirements: 4.1, 4.2, 4.3, 4.4_


- [x] 5. Implement Bun WebSocket adapter


  - [x] 5.1 Restructure Bun adapter for WebSocket support


    - Modify `createBunMiddleware` to return both fetch handler and websocket config

    - Update `setupBridge` to handle Bun's dual return value
    - Store routes map in closure for websocket handler access
    - _Requirements: 1.1, 3.3, 3.4_
  

  - [x] 5.2 Implement Bun WebSocket handshake

    - Check for `kind: 'ws'` in fetch handler
    - Execute before hooks during handshake
    - Validate query parameters with input schema
    - Call `server.upgrade(req, { data })` with connection metadata
    - Store route definition, user handlers, and context in `data`
    - _Requirements: 2.1, 5.1, 5.2, 5.3, 7.1, 7.2, 7.3, 7.4_
  
  - [x] 5.3 Implement Bun WebSocket lifecycle handlers

    - Create single shared handler object for all connections
    - Implement `open(ws)` handler that dispatches to user's onOpen
    - Implement `message(ws, message)` handler with validation
    - Implement `close(ws, code, reason)` handler with cleanup hooks
    - Implement `error(ws, error)` handler that dispatches to user's onError
    - Wrap ServerWebSocket in WebSocketConnectionImpl for each callback
    - _Requirements: 2.1, 2.5, 2.6, 2.7, 5.4, 5.5_
  
  - [x] 5.4 Implement Bun message validation

    - Validate incoming messages against input schema in message handler
    - Send error message on validation failure
    - Pass validated data to user handler
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  
  - [x] 5.5 Update Bun server setup


    - Modify `server/app-bun.ts` to use websocket config
    - Pass websocket handler to `Bun.serve()`
    - Export server instance for pub/sub access




    - _Requirements: 3.3, 3.4, 3.5_

- [ ] 6. Implement $ws client helper
  - [x] 6.1 Add $ws generation to setupBridge

    - Iterate through routes and identify `kind: 'ws'` routes
    - Generate $ws object with methods for each WebSocket route
    - Export $ws alongside $api and $sse
    - _Requirements: 6.1, 6.2_
  
  - [ ] 6.2 Implement WebSocket client connection
    - Construct WebSocket URL from baseUrl and route name

    - Support query parameters in connection options
    - Create native WebSocket instance
    - Wire up onOpen, onMessage, onClose, onError handlers
    - Return connection object with send() and close() methods



    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6_
  
  - [ ] 6.3 Add TypeScript types for $ws helper
    - Generate type-safe send() method based on input schema
    - Generate type-safe message handler based on output schema

    - Ensure compatibility with browser and Node/Bun environments
    - _Requirements: 6.4, 6.5_

- [ ] 7. Add error handling and logging
  - [ ] 7.1 Implement WebSocket error formatting
    - Create consistent error message format

    - Include error code, message, and optional details
    - Send error messages to client on validation/handler failures
    - _Requirements: 8.1, 8.2_
  
  - [x] 7.2 Add WebSocket error logging





    - Log handshake failures with route and reason
    - Log message validation errors with connection info
    - Log handler errors with stack traces
    - Respect `logRequests` configuration option


    - _Requirements: 8.1, 8.5_
  
  - [ ] 7.3 Implement handshake error responses
    - Return 400 for validation errors
    - Return 401 for authentication failures
    - Return 404 for route not found
    - Return 500 for internal errors

    - _Requirements: 7.4, 8.3_

- [x] 8. Update bridge exports and documentation


  - [x] 8.1 Update core bridge exports

    - Export WebSocket types from `server/core/bridge.ts`
    - Re-export from shared types
    - Update TypeScript definitions
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [x] 8.2 Create WebSocket documentation

    - Add `docs/websocket.md` with usage examples
    - Document route definition with `kind: 'ws'`
    - Document handler lifecycle methods
    - Document $ws client helper usage
    - Document Bun-specific features (pub/sub, backpressure)

    - Document security best practices
    - _Requirements: All_
  
  - [ ] 8.3 Update existing documentation
    - Update `docs/01-intro.md` to mention WebSocket support
    - Update `docs/03-runtime-adapters.md` with WebSocket sections
    - Update README.md with WebSocket quick start
    - _Requirements: All_

- [ ] 9. Create example WebSocket routes
  - [ ] 9.1 Create chat room example
    - Add `server/routes/chat.ts` with WebSocket route
    - Implement message broadcasting logic
    - Add authentication hook
    - Add input validation
    - _Requirements: 1.1, 2.1, 2.5, 4.1, 5.1_
  
  - [ ] 9.2 Create real-time dashboard example
    - Add `server/routes/dashboard.ts` with WebSocket route
    - Implement periodic data push
    - Demonstrate onOpen and onClose handlers
    - _Requirements: 1.1, 2.1, 2.6, 2.7_
  
  - [ ] 9.3 Create test HTML clients
    - Add `test/express-ws/index.html` for Express testing
    - Add `test/hono-ws/index.html` for Hono testing
    - Add `test/bun-ws/index.html` for Bun testing
    - Include $ws helper usage examples
    - _Requirements: 6.2, 6.3, 6.5_

- [ ] 10. Add comprehensive tests
  - [ ] 10.1 Unit tests for WebSocket connection wrapper
    - Test WebSocketConnectionImpl send() method
    - Test WebSocketConnectionImpl close() method
    - Test connection metadata access
    - _Requirements: 2.2, 2.3, 2.4_
  
  - [ ] 10.2 Integration tests for Express adapter
    - Test WebSocket handshake with hooks
    - Test message validation
    - Test connection lifecycle
    - Test error handling
    - _Requirements: 3.1, 3.4, 3.5, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4_
  
  - [ ] 10.3 Integration tests for Hono adapter
    - Test WebSocket handshake with hooks
    - Test message validation
    - Test connection lifecycle
    - Test error handling
    - _Requirements: 3.2, 3.4, 3.5, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4_
  
  - [ ] 10.4 Integration tests for Bun adapter
    - Test WebSocket handshake with hooks
    - Test message validation
    - Test connection lifecycle
    - Test error handling
    - Test pub/sub functionality
    - Test backpressure handling
    - _Requirements: 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4_
  
  - [ ] 10.5 Cross-runtime compatibility tests
    - Verify identical behavior across Express, Hono, and Bun
    - Test same route definition on all three runtimes
    - Verify error handling consistency
    - _Requirements: 3.4, 3.5_
