/**
 * Structured logging utility for CodeVault
 *
 * Provides consistent logging with levels, structured metadata, and
 * environment-based configuration.
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

interface LogMetadata {
  [key: string]: any;
}

class Logger {
  private level: LogLevel;
  private quiet: boolean;

  constructor() {
    this.quiet = process.env.CODEVAULT_QUIET === 'true';
    this.level = this.parseLogLevel(process.env.CODEVAULT_LOG_LEVEL);
  }

  private parseLogLevel(level?: string): LogLevel {
    if (!level) return this.quiet ? LogLevel.ERROR : LogLevel.INFO;

    switch (level.toLowerCase()) {
      case 'debug':
        return LogLevel.DEBUG;
      case 'info':
        return LogLevel.INFO;
      case 'warn':
        return LogLevel.WARN;
      case 'error':
        return LogLevel.ERROR;
      case 'silent':
        return LogLevel.SILENT;
      default:
        return LogLevel.INFO;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatMessage(level: string, message: string, meta?: LogMetadata): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}]`;

    if (meta && Object.keys(meta).length > 0) {
      const metaStr = JSON.stringify(meta);
      return `${prefix} ${message} ${metaStr}`;
    }

    return `${prefix} ${message}`;
  }

  debug(message: string, meta?: LogMetadata): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    console.log(this.formatMessage('DEBUG', message, meta));
  }

  info(message: string, meta?: LogMetadata): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    console.log(this.formatMessage('INFO', message, meta));
  }

  warn(message: string, meta?: LogMetadata): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    console.warn(this.formatMessage('WARN', message, meta));
  }

  error(message: string, error?: Error | any, meta?: LogMetadata): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;

    const errorMeta = {
      ...meta,
      ...(error instanceof Error
        ? {
            errorMessage: error.message,
            errorStack: error.stack,
            errorName: error.name,
          }
        : { error: String(error) }),
    };

    console.error(this.formatMessage('ERROR', message, errorMeta));
  }

  /**
   * Check if quiet mode is enabled
   */
  isQuiet(): boolean {
    return this.quiet;
  }

  /**
   * Set quiet mode (suppresses INFO and DEBUG)
   */
  setQuiet(quiet: boolean): void {
    this.quiet = quiet;
    if (quiet && this.level < LogLevel.WARN) {
      this.level = LogLevel.WARN;
    }
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }
}

// Export singleton instance
export const logger = new Logger();

// Export convenience functions
export const log = {
  debug: (message: string, meta?: LogMetadata) => logger.debug(message, meta),
  info: (message: string, meta?: LogMetadata) => logger.info(message, meta),
  warn: (message: string, meta?: LogMetadata) => logger.warn(message, meta),
  error: (message: string, error?: Error | any, meta?: LogMetadata) =>
    logger.error(message, error, meta),
  isQuiet: () => logger.isQuiet(),
};
