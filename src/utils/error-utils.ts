/**
 * Utility functions for safe error handling with proper TypeScript types
 */

// Helper type for error-like objects
export interface ErrorLike {
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
  response?: unknown;
  error?: unknown;
  [key: string]: unknown;
}

export function isErrorLike(value: unknown): value is ErrorLike {
  return typeof value === 'object' && value !== null;
}

export function getErrorMessage(error: unknown): string {
  if (isErrorLike(error) && typeof error.message === 'string') {
    return error.message;
  }
  return String(error);
}

export function getErrorStatus(error: unknown): number | undefined {
  if (!isErrorLike(error)) return undefined;
  if (typeof error.status === 'number') return error.status;
  if (typeof error.statusCode === 'number') return error.statusCode;
  return undefined;
}

export function getErrorProperty(error: unknown, key: string): unknown {
  if (isErrorLike(error) && key in error) {
    return error[key];
  }
  return undefined;
}

/**
 * Safely access a property from an unknown object
 */
export function safeGetProperty(obj: unknown, key: string): unknown {
  if (obj && typeof obj === 'object' && key in obj) {
    return (obj as Record<string, unknown>)[key];
  }
  return undefined;
}

/**
 * Safely get a string property from an unknown object
 */
export function safeGetString(obj: unknown, key: string): string | undefined {
  const value = safeGetProperty(obj, key);
  return typeof value === 'string' ? value : undefined;
}

/**
 * Safely get a number property from an unknown object
 */
export function safeGetNumber(obj: unknown, key: string): number | undefined {
  const value = safeGetProperty(obj, key);
  return typeof value === 'number' ? value : undefined;
}

/**
 * Safely get a boolean property from an unknown object
 */
export function safeGetBoolean(obj: unknown, key: string): boolean | undefined {
  const value = safeGetProperty(obj, key);
  return typeof value === 'boolean' ? value : undefined;
}
