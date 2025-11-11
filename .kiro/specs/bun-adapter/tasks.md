# Implementation Plan: Bun Adapter

## Task List

- [x] 1. Create Bun adapter directory structure


  - Create `server/core/bun/` directory
  - Create `server/core/bun/adapter.ts` file
  - Create `server/core/bun/normalize.ts` file
  - Create `server/core/bun/index.ts` file
  - _Requirements: 1.1, 1.4_

- [x] 2. Implement request normalization


  - [x] 2.1 Create `normalizeBunRequest` function

    - Accept Bun Request, URL, and parsed body
    - Convert Headers object to plain object
    - Parse query parameters from URL
    - Extract path parameters (empty for now)
    - Get client IP from headers (x-forwarded-for or x-real-ip)
    - Return NormalizedRequest object
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 3. Implement Bun adapter

  - [x] 3.1 Create `createBunMiddleware` function
    - Accept routes Map and BridgeConfig
    - Return async fetch handler function
    - Initialize HookExecutor
    - _Requirements: 1.1, 1.2, 7.1, 7.2, 7.3, 7.4, 7.5_

  
  - [x] 3.2 Implement request parsing
    - Extract route name from URL pathname
    - Validate route exists
    - Validate HTTP method matches
    - Parse input based on method (GET: query, POST/PUT/PATCH: JSON body)
    - Handle JSON parsing errors gracefully

    - _Requirements: 1.3, 4.3, 4.4_
  
  - [x] 3.3 Implement input validation
    - Validate input against route schema if present
    - Return 400 error with validation details on failure

    - Use parsed/validated input for handler
    - _Requirements: 3.1, 3.2_
  
  - [x] 3.4 Implement hook execution
    - Create HookContext with normalized request
    - Create platform context with type 'bun' and native Request

    - Combine global and route hooks
    - Execute hooks and handler via HookExecutor
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [x] 3.5 Implement output validation

    - Validate handler result against output schema if present
    - Validate after all after hooks complete
    - Return 500 error on validation failure
    - _Requirements: 3.3, 3.4, 3.5_
  
  - [x] 3.6 Implement response formatting
    - Create `sendBunSuccess` helper function

    - Create `sendBunError` helper function
    - Return native Response objects with JSON body
    - Use formatSuccessResponse and formatErrorResponse
    - Set appropriate status codes
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  

  - [x] 3.7 Implement error handling
    - Wrap adapter logic in try-catch
    - Handle unexpected errors gracefully
    - Return 500 error for unhandled exceptions
    - Log errors to console
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_
  
  - [x] 3.8 Implement helper functions
    - Create `extractRouteFromUrl` function
    - Handle route prefix configuration
    - Return null if route not found
    - _Requirements: 7.1_

- [x] 4. Update platform context types



  - [x] 4.1 Add Bun platform context to PlatformContext union

    - Add `{ type: 'bun'; req: Request }` to union type
    - Update type exports
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 5. Update runtime detection



  - [x] 5.1 Add Bun detection to `detectRuntime` function

    - Check for `typeof Bun !== 'undefined'`
    - Return 'bun' when detected
    - Support BRIDGE_RUNTIME='bun' environment variable
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 6. Integrate Bun adapter with setupBridge



  - [x] 6.1 Import Bun adapter in bridge.ts

    - Add import for `createBunMiddleware`
    - _Requirements: 1.1_
  

  - [x] 6.2 Add Bun runtime handling to setupBridge

    - Add condition for `runtime === 'bun'`
    - Call `createBunMiddleware` with routes and config
    - Assign to middleware variable
    - _Requirements: 1.1, 8.1, 8.2, 8.5_
  

  - [x] 6.3 Update Runtime type


    - Add 'bun' to Runtime union type
    - Update type exports
    - _Requirements: 8.1, 8.2_

- [x] 7. Export Bun adapter
  - [x] 7.1 Create index.ts exports
    - Export `createBunMiddleware` from adapter.ts
    - Export `normalizeBunRequest` from normalize.ts
    - _Requirements: 1.1_

- [ ] 8. Update documentation
  - [ ] 8.1 Add Bun adapter section to main docs
    - Document Bun adapter usage
    - Add examples with Bun.serve()
    - Document platform context access
    - Add migration guide from Express/Hono
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  
  - [ ] 8.2 Add Bun-specific examples
    - Example with lifecycle hooks
    - Example with static file serving
    - Example with type-safe client
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 9. Create example application
  - [ ] 9.1 Create Bun example in test-apps
    - Create `test-apps/bun-example` directory
    - Add package.json with Bun scripts
    - Add example routes with validation
    - Add example with lifecycle hooks
    - Add server.ts using Bun adapter
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 10. Add tests
  - [ ] 10.1 Unit tests for normalizeBunRequest
    - Test header conversion
    - Test query parameter parsing
    - Test IP extraction
    - Test with various Request objects
  
  - [ ] 10.2 Unit tests for Bun adapter
    - Test route extraction
    - Test method validation
    - Test input parsing (GET vs POST)
    - Test error response formatting
  
  - [ ] 10.3 Integration tests
    - Test full request/response cycle
    - Test with lifecycle hooks
    - Test input validation
    - Test output validation
    - Test error handling
  
  - [ ] 10.4 Compatibility tests
    - Test same behavior as Express adapter
    - Test same behavior as Hono adapter
    - Test with existing hook implementations
  
  - [ ] 10.5 End-to-end tests
    - Test with actual Bun.serve()
    - Test with type-safe client
    - Test with static file serving
