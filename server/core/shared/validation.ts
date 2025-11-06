import { z } from 'zod';

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Result of input validation
 */
export interface ValidationResult<T = unknown> {
  /** Whether validation succeeded */
  success: boolean;
  /** Validated data (only present if success is true) */
  data?: T;
  /** Validation errors (only present if success is false) */
  errors?: Array<{
    path: (string | number)[];
    message: string;
    code: string;
  }>;
}

/**
 * Validates input data against a Zod schema.
 * 
 * @param schema - Zod schema to validate against
 * @param input - Input data to validate
 * @returns Validation result with data or errors
 * 
 * @example
 * ```typescript
 * const schema = z.object({
 *   email: z.string().email(),
 *   age: z.number().min(18)
 * });
 * 
 * const result = validateInput(schema, { email: 'test@example.com', age: 25 });
 * if (result.success) {
 *   console.log(result.data); // { email: 'test@example.com', age: 25 }
 * } else {
 *   console.log(result.errors); // Array of validation errors
 * }
 * ```
 */
export function validateInput<T>(
  schema: z.ZodTypeAny,
  input: unknown
): ValidationResult<T> {
  const result = schema.safeParse(input);

  if (result.success) {
    return {
      success: true,
      data: result.data as T,
    };
  }

  return {
    success: false,
    errors: result.error.issues.map((issue) => ({
      path: issue.path as (string | number)[],
      message: issue.message,
      code: issue.code as string,
    })),
  };
}

/**
 * Validates output data against a Zod schema.
 * 
 * This is used to validate handler outputs to ensure they match the expected schema.
 * Useful for catching bugs where handlers return incorrect data structures.
 * 
 * @param schema - Zod schema to validate against
 * @param output - Output data to validate
 * @returns Validation result with data or errors
 * 
 * @example
 * ```typescript
 * const schema = z.object({
 *   id: z.string(),
 *   name: z.string()
 * });
 * 
 * const result = validateOutput(schema, { id: '123', name: 'John' });
 * if (!result.success) {
 *   console.error('Handler returned invalid data:', result.errors);
 * }
 * ```
 */
export function validateOutput<T>(
  schema: z.ZodTypeAny,
  output: unknown
): ValidationResult<T> {
  const result = schema.safeParse(output);

  if (result.success) {
    return {
      success: true,
      data: result.data as T,
    };
  }

  return {
    success: false,
    errors: result.error.issues.map((issue) => ({
      path: issue.path as (string | number)[],
      message: issue.message,
      code: issue.code as string,
    })),
  };
}

/**
 * Formats validation errors into a human-readable message.
 * 
 * @param errors - Array of validation errors
 * @returns Formatted error message
 * 
 * @example
 * ```typescript
 * const errors = [
 *   { path: ['email'], message: 'Invalid email', code: 'invalid_string' },
 *   { path: ['age'], message: 'Must be at least 18', code: 'too_small' }
 * ];
 * 
 * const message = formatValidationErrors(errors);
 * // "email: Invalid email; age: Must be at least 18"
 * ```
 */
export function formatValidationErrors(
  errors: Array<{ path: (string | number)[]; message: string; code: string }>
): string {
  return errors
    .map((error) => {
      const path = error.path.length > 0 ? error.path.join('.') : 'input';
      return `${path}: ${error.message}`;
    })
    .join('; ');
}
