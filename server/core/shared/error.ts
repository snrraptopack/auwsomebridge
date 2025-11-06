// ============================================================================
// ERROR HANDLING UTILITIES
// ============================================================================

/**
 * HTTP status codes commonly used in the bridge
 */
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const;

/**
 * Standard error codes used throughout the bridge
 */
export const ErrorCode = {
  VALIDATION_ERROR: 'validation_error',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  METHOD_NOT_ALLOWED: 'method_not_allowed',
  ROUTE_NOT_FOUND: 'route_not_found',
  INTERNAL_ERROR: 'internal_error',
  TOO_MANY_REQUESTS: 'too_many_requests',
} as const;

/**
 * Bridge error class for structured error handling.
 * 
 * @example
 * ```typescript
 * throw new BridgeError(
 *   HttpStatus.UNAUTHORIZED,
 *   ErrorCode.UNAUTHORIZED,
 *   'Invalid token'
 * );
 * ```
 */
export class BridgeError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'BridgeError';
  }
}

/**
 * Checks if an error is a BridgeError.
 * 
 * @param error - Error to check
 * @returns True if error is a BridgeError
 * 
 * @example
 * ```typescript
 * try {
 *   // ... some code
 * } catch (error) {
 *   if (isBridgeError(error)) {
 *     console.log(error.status, error.code);
 *   }
 * }
 * ```
 */
export function isBridgeError(error: unknown): error is BridgeError {
  return error instanceof BridgeError;
}

/**
 * Converts any error to a structured error object.
 * 
 * @param error - Error to convert
 * @returns Structured error object with status, code, and message
 * 
 * @example
 * ```typescript
 * try {
 *   // ... some code
 * } catch (error) {
 *   const structured = toStructuredError(error);
 *   console.log(structured.status, structured.code, structured.message);
 * }
 * ```
 */
export function toStructuredError(error: unknown): {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
} {
  if (isBridgeError(error)) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: error.message,
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: ErrorCode.INTERNAL_ERROR,
    message: 'Unknown error',
  };
}

/**
 * Logs an error with context information.
 * 
 * @param error - Error to log
 * @param context - Additional context information
 * 
 * @example
 * ```typescript
 * try {
 *   // ... some code
 * } catch (error) {
 *   logError(error, { route: 'getUser', userId: '123' });
 * }
 * ```
 */
export function logError(error: unknown, context?: Record<string, unknown>): void {
  const structured = toStructuredError(error);
  console.error('[Bridge Error]', {
    ...structured,
    context,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Creates a validation error.
 * 
 * @param message - Error message
 * @param details - Validation error details
 * @returns BridgeError instance
 * 
 * @example
 * ```typescript
 * throw createValidationError('Invalid input', {
 *   issues: [{ path: ['email'], message: 'Invalid email' }]
 * });
 * ```
 */
export function createValidationError(
  message: string,
  details?: Record<string, unknown>
): BridgeError {
  return new BridgeError(
    HttpStatus.BAD_REQUEST,
    ErrorCode.VALIDATION_ERROR,
    message,
    details
  );
}

/**
 * Creates an unauthorized error.
 * 
 * @param message - Error message (defaults to 'Unauthorized')
 * @returns BridgeError instance
 * 
 * @example
 * ```typescript
 * throw createUnauthorizedError('Invalid token');
 * ```
 */
export function createUnauthorizedError(message?: string): BridgeError {
  return new BridgeError(
    HttpStatus.UNAUTHORIZED,
    ErrorCode.UNAUTHORIZED,
    message || 'Unauthorized'
  );
}

/**
 * Creates a forbidden error.
 * 
 * @param message - Error message (defaults to 'Forbidden')
 * @returns BridgeError instance
 * 
 * @example
 * ```typescript
 * throw createForbiddenError('Admin access required');
 * ```
 */
export function createForbiddenError(message?: string): BridgeError {
  return new BridgeError(
    HttpStatus.FORBIDDEN,
    ErrorCode.FORBIDDEN,
    message || 'Forbidden'
  );
}

/**
 * Creates a not found error.
 * 
 * @param resource - Name of the resource that was not found
 * @returns BridgeError instance
 * 
 * @example
 * ```typescript
 * throw createNotFoundError('User');
 * ```
 */
export function createNotFoundError(resource: string): BridgeError {
  return new BridgeError(
    HttpStatus.NOT_FOUND,
    ErrorCode.NOT_FOUND,
    `${resource} not found`
  );
}

/**
 * Creates an internal server error.
 * 
 * @param message - Error message (defaults to 'Internal server error')
 * @returns BridgeError instance
 * 
 * @example
 * ```typescript
 * throw createInternalError('Database connection failed');
 * ```
 */
export function createInternalError(message?: string): BridgeError {
  return new BridgeError(
    HttpStatus.INTERNAL_SERVER_ERROR,
    ErrorCode.INTERNAL_ERROR,
    message || 'Internal server error'
  );
}
