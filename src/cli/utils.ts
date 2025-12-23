/**
 * Shared CLI utilities for common patterns across commands
 */

import path from 'path';

/**
 * Exit codes for CLI commands
 */
export const ExitCode = {
  SUCCESS: 0,
  ERROR: 1,
  INVALID_ARGS: 2,
  INTERRUPTED: 130,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

/**
 * Configuration for integer parsing
 */
interface ParseIntConfig {
  min?: number;
  max?: number;
  default?: number;
}

/**
 * Parse an integer option with validation
 * @param value The string value to parse
 * @param name The option name (for error messages)
 * @param config Optional min/max bounds and default
 * @returns The parsed integer or throws an error
 */
export function parseIntOption(value: string | undefined, name: string, config: ParseIntConfig = {}): number {
  if (value === undefined || value === '') {
    if (config.default !== undefined) {
      return config.default;
    }
    throw new Error(`Missing required option: ${name}`);
  }

  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid ${name}: expected a number, got "${value}"`);
  }
  if (config.min !== undefined && parsed < config.min) {
    throw new Error(`${name} must be at least ${config.min}, got ${parsed}`);
  }
  if (config.max !== undefined && parsed > config.max) {
    throw new Error(`${name} must be at most ${config.max}, got ${parsed}`);
  }
  return parsed;
}

/**
 * Parse a float option with validation
 * @param value The string value to parse
 * @param name The option name (for error messages)
 * @param config Optional min/max bounds and default
 * @returns The parsed float or throws an error
 */
export function parseFloatOption(value: string | undefined, name: string, config: ParseIntConfig = {}): number {
  if (value === undefined || value === '') {
    if (config.default !== undefined) {
      return config.default;
    }
    throw new Error(`Missing required option: ${name}`);
  }

  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    throw new Error(`Invalid ${name}: expected a number, got "${value}"`);
  }
  if (config.min !== undefined && parsed < config.min) {
    throw new Error(`${name} must be at least ${config.min}, got ${parsed}`);
  }
  if (config.max !== undefined && parsed > config.max) {
    throw new Error(`${name} must be at most ${config.max}, got ${parsed}`);
  }
  return parsed;
}

/**
 * Resolve project path from command options
 * @param options Commander options object
 * @param positionalPath Optional positional path argument
 * @returns Resolved absolute path
 */
export function resolveProjectPath(
  options: { project?: string; directory?: string },
  positionalPath?: string
): string {
  const rawPath = options.project || options.directory || positionalPath || '.';
  return path.resolve(rawPath);
}

/**
 * Wrapper for long-running commands that ensures cleanup on signals
 * @param action The async action to run
 * @param cleanup Cleanup function to call on interrupt
 * @returns Promise that resolves when action completes
 */
export async function withGracefulShutdown<T>(
  action: () => Promise<T>,
  cleanup: () => void | Promise<void>
): Promise<T> {
  const handleSignal = (): void => {
    void Promise.resolve(cleanup()).finally(() => {
      process.exit(ExitCode.INTERRUPTED);
    });
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  try {
    return await action();
  } finally {
    process.off('SIGINT', handleSignal);
    process.off('SIGTERM', handleSignal);
  }
}
