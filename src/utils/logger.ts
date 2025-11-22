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

export type LogValue = string | number | boolean | null | undefined | LogValue[] | { [key: string]: LogValue };

export interface LogMetadata {
  [key: string]: LogValue;
}

const REDACTION_TEXT = '[REDACTED]';

const SECRET_VALUE_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9]{16,}/g, // OpenAI style keys
  /gh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /xox[baprs]-[A-Za-z0-9-]{12,}/g, // Slack tokens
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, // JWT
  /Bearer\s+[A-Za-z0-9._-]{20,}/gi, // Bearer tokens
  /AKIA[0-9A-Z]{16}/g, // AWS access key id
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, // PEM blocks
  /(?:api|secret|token|password)[\s:=]+[A-Za-z0-9._-]{8,}/gi // generic key=value secrets
];

const DEFAULT_ENV_NAMES = [
  'OPENAI_API_KEY',
  'NPM_TOKEN',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'DATABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
];

const SENSITIVE_TOKEN_SET = new Set([
  'token',
  'secret',
  'password',
  'passwd',
  'pwd',
  'authorization',
  'auth',
  'bearer',
  'session',
  'cookie',
  'apikey',
  'clientsecret'
]);

const SENSITIVE_KEY_NAMES = new Set([
  'api_key',
  'apikey',
  'client_secret',
  'clientsecret',
  'access_token',
  'refresh_token'
]);

const SENSITIVE_COMBINATIONS: Array<[string, string]> = [
  ['api', 'key'],
  ['client', 'secret'],
  ['access', 'token'],
  ['refresh', 'token']
];

interface RedactionContext {
  envNames: string[];
  envNameSet: Set<string>;
  customKeySet: Set<string>;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseConfiguredList(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeKeyName(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function buildRedactionContext(): RedactionContext {
  const customKeys = parseConfiguredList(process.env.CODEVAULT_REDACT_KEYS);
  const customEnvNames = parseConfiguredList(process.env.CODEVAULT_REDACT_ENV_VARS);
  const envNames = [...DEFAULT_ENV_NAMES, ...customEnvNames];

  return {
    envNames,
    envNameSet: new Set(envNames.map((name) => normalizeKeyName(name))),
    customKeySet: new Set(customKeys.map((name) => normalizeKeyName(name)))
  };
}

function shouldRedactKeyName(key: string, context: RedactionContext): boolean {
  const normalized = normalizeKeyName(key);
  const tokens = normalized.split('_').filter(Boolean);

  if (context.customKeySet.has(normalized) || context.envNameSet.has(normalized)) {
    return true;
  }

  if (SENSITIVE_KEY_NAMES.has(normalized)) return true;

  if (SENSITIVE_COMBINATIONS.some(([first, second]) => tokens.includes(first) && tokens.includes(second))) {
    return true;
  }

  return tokens.some((token) => SENSITIVE_TOKEN_SET.has(token));
}

function redactStringValue(value: string, context: RedactionContext, force: boolean = false): string {
  if (force) return REDACTION_TEXT;

  let redacted = value;

  for (const envName of context.envNames) {
    const pattern = new RegExp(`\\b${escapeRegExp(envName)}\\s*=\\s*([^\\s;]+)`, 'gi');
    redacted = redacted.replace(pattern, `${envName}=${REDACTION_TEXT}`);
  }

  for (const pattern of SECRET_VALUE_PATTERNS) {
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, REDACTION_TEXT);
  }

  return redacted;
}

function redactValue(value: LogValue, context: RedactionContext): LogValue {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return redactStringValue(value, context);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, context));
  }

  if (typeof value === 'object') {
    const redactedObj: { [key: string]: LogValue } = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      redactedObj[childKey] = shouldRedactKeyName(childKey, context)
        ? REDACTION_TEXT
        : redactValue(childValue, context);
    }
    return redactedObj;
  }

  return value;
}

function redactMetadata(meta: LogMetadata | undefined, context: RedactionContext): LogMetadata | undefined {
  if (!meta) return undefined;

  const redactedMeta: LogMetadata = {};
  for (const [key, value] of Object.entries(meta)) {
    redactedMeta[key] = shouldRedactKeyName(key, context)
      ? REDACTION_TEXT
      : redactValue(value, context);
  }

  return redactedMeta;
}

export function redactLogData(message: string, meta?: LogMetadata): { message: string; meta?: LogMetadata } {
  const context = buildRedactionContext();
  const safeMessage = redactStringValue(message, context);
  const safeMeta = redactMetadata(meta, context);

  return { message: safeMessage, meta: safeMeta };
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
    const { message: safeMessage, meta: safeMeta } = redactLogData(message, meta);

    if (safeMeta && Object.keys(safeMeta).length > 0) {
      const metaStr = JSON.stringify(safeMeta);
      return `${prefix} ${safeMessage} ${metaStr}`;
    }

    return `${prefix} ${safeMessage}`;
  }

  debug(message: string, meta?: LogMetadata): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    process.stdout.write(`${this.formatMessage('DEBUG', message, meta)}\n`);
  }

  info(message: string, meta?: LogMetadata): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    process.stdout.write(`${this.formatMessage('INFO', message, meta)}\n`);
  }

  warn(message: string, meta?: LogMetadata): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    console.warn(this.formatMessage('WARN', message, meta));
  }

  error(message: string, error?: unknown, meta?: LogMetadata): void {
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

/**
 * Print to stdout without logging metadata
 * Use this for user-facing CLI output
 */
export function print(message: string): void {
  process.stdout.write(`${message}\n`);
}

// Export convenience functions
export const log = {
  debug: (message: string, meta?: LogMetadata) => logger.debug(message, meta),
  info: (message: string, meta?: LogMetadata) => logger.info(message, meta),
  warn: (message: string, meta?: LogMetadata) => logger.warn(message, meta),
  error: (message: string, error?: unknown, meta?: LogMetadata) =>
    logger.error(message, error, meta),
  isQuiet: () => logger.isQuiet(),
  setQuiet: (quiet: boolean) => logger.setQuiet(quiet),
};
