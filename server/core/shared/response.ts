import type { ApiSuccess, ApiError } from './types';

// ============================================================================
// RESPONSE FORMATTING UTILITIES
// ============================================================================

/**
 * Creates a successful API response.
 * 
 * @template T - Type of the response data
 * @param data - Response data
 * @returns Formatted success response
 * 
 * @example
 * ```typescript
 * const response = formatSuccessResponse({ id: '123', name: 'John' });
 * // {
 * //   status: 'success',
 * //   data: { id: '123', name: 'John' },
 * //   timestamp: 1234567890
 * // }
 * ```
 */
export function formatSuccessResponse<T>(data: T): ApiSuccess<T> {
  return {
    status: 'success',
    data,
    timestamp: Date.now(),
  };
}

/**
 * Creates an error API response.
 * 
 * @param code - Machine-readable error code (e.g., 'validation_error', 'unauthorized')
 * @param message - Human-readable error message
 * @param details - Optional additional error details
 * @returns Formatted error response
 * 
 * @example
 * ```typescript
 * const response = formatErrorResponse(
 *   'validation_error',
 *   'Invalid input data',
 *   { field: 'email', reason: 'Invalid format' }
 * );
 * // {
 * //   status: 'error',
 * //   error: 'Invalid input data',
 * //   code: 'validation_error',
 * //   details: { field: 'email', reason: 'Invalid format' },
 * //   timestamp: 1234567890
 * // }
 * ```
 */
export function formatErrorResponse(
  code: string,
  message: string,
  details?: Record<string, unknown>
): ApiError {
  return {
    status: 'error',
    error: message,
    code,
    details,
    timestamp: Date.now(),
  };
}

/**
 * Creates a validation error response.
 * 
 * @param errors - Array of validation errors
 * @returns Formatted validation error response
 * 
 * @example
 * ```typescript
 * const response = formatValidationErrorResponse([
 *   { path: ['email'], message: 'Invalid email', code: 'invalid_string' },
 *   { path: ['age'], message: 'Must be at least 18', code: 'too_small' }
 * ]);
 * // {
 * //   status: 'error',
 * //   error: 'Validation failed',
 * //   code: 'validation_error',
 * //   details: { issues: [...] },
 * //   timestamp: 1234567890
 * // }
 * ```
 */
export function formatValidationErrorResponse(
  errors: Array<{ path: (string | number)[]; message: string; code: string }>
): ApiError {
  return {
    status: 'error',
    error: 'Validation failed',
    code: 'validation_error',
    details: { issues: errors },
    timestamp: Date.now(),
  };
}

/**
 * Creates a not found error response.
 * 
 * @param resource - Name of the resource that was not found
 * @returns Formatted not found error response
 * 
 * @example
 * ```typescript
 * const response = formatNotFoundResponse('User');
 * // {
 * //   status: 'error',
 * //   error: 'User not found',
 * //   code: 'not_found',
 * //   timestamp: 1234567890
 * // }
 * ```
 */
export function formatNotFoundResponse(resource: string): ApiError {
  return {
    status: 'error',
    error: `${resource} not found`,
    code: 'not_found',
    timestamp: Date.now(),
  };
}

/**
 * Creates an unauthorized error response.
 * 
 * @param message - Optional custom error message
 * @returns Formatted unauthorized error response
 * 
 * @example
 * ```typescript
 * const response = formatUnauthorizedResponse();
 * // {
 * //   status: 'error',
 * //   error: 'Unauthorized',
 * //   code: 'unauthorized',
 * //   timestamp: 1234567890
 * // }
 * ```
 */
export function formatUnauthorizedResponse(message?: string): ApiError {
  return {
    status: 'error',
    error: message || 'Unauthorized',
    code: 'unauthorized',
    timestamp: Date.now(),
  };
}

/**
 * Creates a forbidden error response.
 * 
 * @param message - Optional custom error message
 * @returns Formatted forbidden error response
 * 
 * @example
 * ```typescript
 * const response = formatForbiddenResponse('Admin access required');
 * // {
 * //   status: 'error',
 * //   error: 'Admin access required',
 * //   code: 'forbidden',
 * //   timestamp: 1234567890
 * // }
 * ```
 */
export function formatForbiddenResponse(message?: string): ApiError {
  return {
    status: 'error',
    error: message || 'Forbidden',
    code: 'forbidden',
    timestamp: Date.now(),
  };
}

/**
 * Creates an internal server error response.
 * 
 * @param message - Optional custom error message
 * @returns Formatted internal error response
 * 
 * @example
 * ```typescript
 * const response = formatInternalErrorResponse('Database connection failed');
 * // {
 * //   status: 'error',
 * //   error: 'Database connection failed',
 * //   code: 'internal_error',
 * //   timestamp: 1234567890
 * // }
 * ```
 */
export function formatInternalErrorResponse(message?: string): ApiError {
  return {
    status: 'error',
    error: message || 'Internal server error',
    code: 'internal_error',
    timestamp: Date.now(),
  };
}
