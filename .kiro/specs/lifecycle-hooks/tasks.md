# Implementation Plan: Lifecycle Hooks

## Task List

- [x] 1. Update type definitions for lifecycle hooks


  - Add `AfterHookContext` and `CleanupHookContext` interfaces to `server/core/shared/types.ts`
  - Add `AfterHookResult` and `CleanupHookResult` types
  - Add `BeforeHook`, `AfterHook`, `CleanupHook` function types
  - Add `LifecycleHook` interface with `__hookName`, `__isLifecycleHook`, and optional lifecycle methods
  - Update `HookDefinition` type to support `before`, `after`, `cleanup` methods alongside legacy `handler`
  - Update `RouteHook` type to be union of `BeforeHook | LifecycleHook`
  - _Requirements: 1.1, 1.2, 2.1, 3.1, 4.1, 5.1, 6.1_

- [x] 2. Update defineHook to support lifecycle methods


  - [x] 2.1 Modify `defineHook` function in `server/core/shared/hooks.ts`


    - Detect if definition has lifecycle methods (`before`, `after`, `cleanup`) or legacy `handler`
    - For lifecycle hooks without setup: return `LifecycleHook` object with methods
    - For lifecycle hooks with setup: return factory that creates `LifecycleHook` with state closure
    - For legacy hooks: maintain existing behavior (treat as before hook)
    - Ensure backward compatibility with existing hooks
    - _Requirements: 3.2, 6.2, 6.3_

- [x] 3. Update HookExecutor to handle lifecycle phases





  - [x] 3.1 Add helper method to detect lifecycle hooks








    - Create `isLifecycleHook` method that checks for `__isLifecycleHook` property
    - _Requirements: 3.4_

  

  - [x] 3.2 Add method to extract lifecycle methods from hooks



    - Create `extractLifecycleMethods` method in `HookExecutor` class
    - Iterate through hooks and separate into before/after/cleanup arrays
    - For `LifecycleHook` objects: extract each defined lifecycle method
    - For legacy function hooks: add to before array
    - Return object with `{ before: BeforeHook[], after: AfterHook[], cleanup: CleanupHook[] }`

    - _Requirements: 3.4, 3.5_

  
  - [x] 3.3 Add method to execute before hooks


    - Create `executeBeforeHooks` private method
    - Execute hooks sequentially with error handling

    - Return success, early response, or error result

    - _Requirements: 1.1, 1.4_
  
  - [x] 3.4 Add method to execute after hooks


    - Create `executeAfterHooks` private method
    - Accept current response as parameter
    - Create `AfterHookContext` with response data
    - Execute hooks sequentially, allowing response transformation

    - Chain response modifications through hooks

    - Return final response or error result
    - _Requirements: 1.2, 1.3, 4.1, 4.2, 4.3, 4.4, 4.5_
  
  - [x] 3.5 Add method to execute cleanup hooks


    - Create `executeCleanupHooks` private method
    - Accept outcome object with success/response/error

    - Create `CleanupHookContext` with outcome information
    - Execute all hooks even if one throws error
    - Log errors but don't propagate them
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 5.1, 5.2, 5.3, 5.4, 5.5_
  

  - [x] 3.6 Update main execute method

    - Call `extractLifecycleMethods` to separate hooks




    - Execute before hooks and handle early returns/errors
    - Execute handler if before hooks pass
    - Execute after hooks with handler response
    - Wrap everything in try-finally to ensure cleanup hooks run

    - Execute cleanup hooks in finally block with outcome information

    - _Requirements: 1.5, 2.1, 3.4, 4.5_

- [x] 4. Update adapters to maintain compatibility







  - [x] 4.1 Verify Express adapter works with lifecycle hooks



    - Ensure `createExpressMiddleware` passes hooks correctly to executor
    - Verify output validation occurs after all after hooks complete
    - Test that cleanup hooks execute on errors
    - _Requirements: 6.2, 6.3_

  

  - [x] 4.2 Verify Hono adapter works with lifecycle hooks

    - Ensure `createHonoMiddleware` passes hooks correctly to executor
    - Verify output validation occurs after all after hooks complete
    - Test that cleanup hooks execute on errors
    - _Requirements: 6.2, 6.3_



- [x] 5. Create example lifecycle hooks




  - [x] 5.1 Create full cache hook example


    - Implement `createFullCacheHook` in `server/hooks/cache.ts`
    - Add before method to check cache and return early if hit
    - Add after method to store response in cache
    - Use setup function to create shared cache Map
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [x] 5.2 Create metrics hook example




    - Implement `metricsHook` in `server/hooks/logger.ts`
    - Add before method to record start time
    - Add cleanup method to calculate duration and log metrics
    - Access success/error information in cleanup
    - _Requirements: 2.1, 2.4, 5.1, 5.2, 5.3, 5.5_
  
  - [x] 5.3 Create audit hook example




    - Implement `auditHook` in new file `server/hooks/audit.ts`
    - Add cleanup method to log request outcome
    - Handle errors gracefully (don't fail request)
    - Access final success/error state
    - _Requirements: 2.1, 2.4, 5.1, 5.2, 5.3_





- [x] 6. Update documentation


  - [x] 6.1 Update hooks documentation


    - Update `docs/06-hooks.md` with lifecycle hooks section
    - Add examples of before, after, and cleanup methods

    - Document execution order and guarantees
    - Add migration guide for existing hooks
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [x] 6.2 Add output schema validation guidance






    - Document how after hooks interact with output validation
    - Provide patterns for schema-aware transformations
    - Explain validation timing (after all after hooks)

    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 7. Add tests for lifecycle hooks


  - [x] 7.1 Unit tests for defineHook

    - Test lifecycle hook creation without setup
    - Test lifecycle hook creation with setup
    - Test legacy hook backward compatibility
    - Test state sharing across lifecycle methods
  

  - [x] 7.2 Unit tests for HookExecutor

    - Test `extractLifecycleMethods` correctly separates hooks
    - Test before hook execution and short-circuiting
    - Test after hook execution and response transformation

    - Test cleanup hook execution on success
    - Test cleanup hook execution on before hook error
    - Test cleanup hook execution on handler error
    - Test cleanup hook execution on after hook error

    - Test cleanup hook error isolation
  
  - [x] 7.3 Integration tests for Express adapter

    - Test full lifecycle with Express routes
    - Test response transformation doesn't break output validation
    - Test cleanup hooks execute on errors
  
  - [x] 7.4 Integration tests for Hono adapter

    - Test full lifecycle with Hono routes
    - Test response transformation doesn't break output validation
    - Test cleanup hooks execute on errors
  
  - [x] 7.5 End-to-end tests with example hooks

    - Test cache hook (before + after)
    - Test metrics hook (before + cleanup)
    - Test audit hook (cleanup only)
    - Test combined lifecycle hooks
