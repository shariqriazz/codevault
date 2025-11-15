/**
 * Utility functions for path resolution and normalization
 */

/**
 * Resolves the project root path from various input options
 * Supports multiple parameter names for backwards compatibility (project, directory, path)
 * 
 * @param input - Object containing potential path parameters
 * @returns Normalized path string, defaults to '.' if no path provided
 */
export function resolveProjectRoot(input?: {
  project?: string;
  directory?: string;
  path?: string;
}): string {
  if (!input) {
    return '.';
  }
  
  const rawPath = input.project || input.directory || input.path || '.';
  const trimmed = typeof rawPath === 'string' ? rawPath.trim() : '.';
  
  return trimmed.length > 0 ? trimmed : '.';
}

/**
 * Wraps a function execution with quiet logging mode enabled
 * Automatically restores previous environment state after execution
 * 
 * @param fn - Async function to execute with quiet logging
 * @param opts - Options for additional environment flags
 * @returns Result of the wrapped function
 */
export async function withQuietLogs<T>(
  fn: () => Promise<T>,
  opts?: { cacheModelProfile?: boolean }
): Promise<T> {
  const prevQuiet = process.env.CODEVAULT_QUIET;
  const prevCache = process.env.CODEVAULT_MODEL_PROFILE_CACHED;
  
  process.env.CODEVAULT_QUIET = 'true';
  if (opts?.cacheModelProfile) {
    process.env.CODEVAULT_MODEL_PROFILE_CACHED = 'true';
  }
  
  try {
    return await fn();
  } finally {
    // Restore previous state
    if (prevQuiet === undefined) {
      delete process.env.CODEVAULT_QUIET;
    } else {
      process.env.CODEVAULT_QUIET = prevQuiet;
    }
    
    if (opts?.cacheModelProfile) {
      if (prevCache === undefined) {
        delete process.env.CODEVAULT_MODEL_PROFILE_CACHED;
      } else {
        process.env.CODEVAULT_MODEL_PROFILE_CACHED = prevCache;
      }
    }
  }
}
