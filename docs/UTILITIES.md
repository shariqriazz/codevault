# CodeVault Utilities Reference

> Version 1.8.5

This document provides comprehensive documentation for all utility modules in the `src/utils/` directory. These utilities provide foundational functionality for rate limiting, caching, concurrency control, logging, and more.

## Table of Contents

- [Rate Limiter](#rate-limiter)
- [LRU Cache](#lru-cache)
- [Mutex and Semaphore](#mutex-and-semaphore)
- [Logger](#logger)
- [CLI UI](#cli-ui)
- [Path Helpers](#path-helpers)
- [Scan Patterns](#scan-patterns)
- [Indexer with Progress](#indexer-with-progress)

---

## Rate Limiter

**File:** `src/utils/rate-limiter.ts`

The rate limiter provides RPM (requests per minute) and TPM (tokens per minute) throttling with automatic retry logic for rate limit errors (HTTP 429).

### Class: `RateLimiter`

```typescript
import { RateLimiter, createRateLimiter } from './utils/rate-limiter.js';
```

#### Constructor

```typescript
new RateLimiter(
  requestsPerMinute: number | null = null,
  tokensPerMinute: number | null = null,
  maxQueueSize: number = 10000
)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `requestsPerMinute` | `number \| null` | `null` | Maximum requests per minute. Falls back to environment variables if `null`. |
| `tokensPerMinute` | `number \| null` | `null` | Maximum tokens per minute. Falls back to environment variables if `null`. |
| `maxQueueSize` | `number` | `10000` | Maximum queue size to prevent memory exhaustion. |

#### Environment Variables

The rate limiter reads defaults from these environment variables (in priority order):

**For RPM:**
1. `CODEVAULT_EMBEDDING_RATE_LIMIT_RPM`
2. `CODEVAULT_RATE_LIMIT_RPM`
3. `CODEVAULT_RATE_LIMIT`

**For TPM:**
1. `CODEVAULT_EMBEDDING_RATE_LIMIT_TPM`
2. `CODEVAULT_RATE_LIMIT_TPM`

#### Methods

##### `execute<T>(fn, retryCount?, estimatedTokens?): Promise<T>`

Executes a function with rate limiting and automatic retry on rate limit errors.

```typescript
const result = await limiter.execute(
  () => fetch('/api/embeddings'),
  0,      // retryCount (internal use)
  1000    // estimatedTokens
);
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `fn` | `() => Promise<T>` | - | Async function to execute |
| `retryCount` | `number` | `0` | Internal retry counter |
| `estimatedTokens` | `number` | `0` | Estimated token count for TPM tracking |

**Retry Behavior:**
- Delays: 1s, 2s, 5s, 10s (4 retries max)
- Triggers on HTTP 429, "rate limit", or "too many requests" errors

##### `getStats(): RateLimiterStats`

Returns current rate limiter statistics.

```typescript
const stats = limiter.getStats();
// {
//   rpm: 50,
//   tpm: null,
//   queueLength: 3,
//   maxQueueSize: 10000,
//   queueUtilization: "0.0%",
//   requestsInLastMinute: 12,
//   tokensInLastMinute: 5000,
//   isRpmLimited: true,
//   isTpmLimited: false,
//   isLimited: true
// }
```

##### `reset(): void`

Clears the queue and all tracking state.

```typescript
limiter.reset();
```

### Factory Function: `createRateLimiter`

Creates a rate limiter with provider-specific defaults.

```typescript
const limiter = createRateLimiter('OpenAI');  // 50 RPM
const limiter = createRateLimiter('Qwen');    // 10000 RPM, 600000 TPM
```

| Provider | Default RPM | Default TPM |
|----------|-------------|-------------|
| OpenAI | 50 | null |
| Qwen | 10000 | 600000 |
| Other | null | null |

**Note:** Environment variables override provider defaults.

---

## LRU Cache

**File:** `src/utils/simple-lru.ts`

A true O(1) LRU (Least Recently Used) cache implementation using a doubly linked list for recency tracking. Supports optional TTL (time-to-live) expiration.

### Class: `SimpleLRU<K, V>`

```typescript
import { SimpleLRU } from './utils/simple-lru.js';
```

#### Constructor

```typescript
new SimpleLRU<K, V>(max: number, options?: { ttl?: number })
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `max` | `number` | - | Maximum number of entries (must be > 0) |
| `options.ttl` | `number` | `undefined` | Time-to-live in milliseconds |

```typescript
// Cache with 1000 max entries
const cache = new SimpleLRU<string, Buffer>(1000);

// Cache with 5 minute TTL
const sessionCache = new SimpleLRU<string, Session>(100, { ttl: 5 * 60 * 1000 });
```

#### Methods

##### `get(key): V | undefined`

Retrieves a value and moves it to the front (most recently used).

```typescript
const value = cache.get('key');
if (value !== undefined) {
  // Cache hit - value is now marked as most recently used
}
```

##### `peek(key): V | undefined`

Retrieves a value without updating recency. Useful for checking existence without affecting eviction order.

```typescript
const value = cache.peek('key');
// Does not affect LRU ordering
```

##### `set(key, value): void`

Stores a value. If cache is full, evicts expired entries first, then the least recently used entry.

```typescript
cache.set('key', value);
```

##### `getOrSet(key, factory): Promise<V>`

Retrieves a cached value or computes it using the factory function. Includes thundering herd protection - concurrent requests for the same key share the same pending computation.

```typescript
const data = await cache.getOrSet('user:123', async () => {
  return await fetchUserFromDatabase('123');
});
```

**Thundering Herd Protection:** Multiple simultaneous calls for the same uncached key will share a single factory execution:

```typescript
// These three calls will only trigger ONE database query
const [a, b, c] = await Promise.all([
  cache.getOrSet('user:123', fetchUser),
  cache.getOrSet('user:123', fetchUser),
  cache.getOrSet('user:123', fetchUser),
]);
```

##### `clear(): void`

Removes all entries from the cache.

```typescript
cache.clear();
```

##### `size: number` (getter)

Returns the current number of entries.

```typescript
console.log(`Cache has ${cache.size} entries`);
```

### TTL Behavior

- Entries with TTL are checked for expiration on access (`get`, `peek`)
- Expired entries are removed automatically during access
- Stale entries are also cleaned during eviction when cache is full
- TTL is refreshed when updating an existing key with `set()`

---

## Mutex and Semaphore

**File:** `src/utils/mutex.ts`

Provides async-safe concurrency primitives for coordinating asynchronous operations.

### Class: `Mutex`

A mutual exclusion lock ensuring only one operation runs at a time.

```typescript
import { Mutex, MutexTimeoutError } from './utils/mutex.js';
```

#### Constructor

```typescript
new Mutex()
```

No parameters required.

#### Methods

##### `acquire(timeoutMs?): Promise<void>`

Acquires the lock. Waits if already locked.

```typescript
await mutex.acquire();
try {
  // Critical section - only one caller at a time
  await performExclusiveOperation();
} finally {
  mutex.release();
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `timeoutMs` | `number` | `undefined` | Optional timeout. Throws `MutexTimeoutError` if exceeded. |

```typescript
try {
  await mutex.acquire(5000); // 5 second timeout
} catch (error) {
  if (error instanceof MutexTimeoutError) {
    console.error('Could not acquire lock within 5 seconds');
  }
}
```

##### `release(): void`

Releases the lock, allowing the next queued operation to proceed.

##### `runExclusive<T>(fn): Promise<T>`

Convenience method that acquires, executes, and releases automatically.

```typescript
const result = await mutex.runExclusive(async () => {
  return await performExclusiveOperation();
});
// Lock is automatically released even if fn throws
```

##### `isLocked(): boolean`

Returns `true` if the mutex is currently held.

##### `getQueueLength(): number`

Returns the number of operations waiting to acquire the lock.

### Class: `MutexTimeoutError`

Thrown when `acquire()` times out.

```typescript
class MutexTimeoutError extends Error {
  constructor(timeoutMs: number);
}
```

### Class: `Semaphore`

A counting semaphore for limiting concurrent operations to N permits.

```typescript
import { Semaphore } from './utils/mutex.js';
```

#### Constructor

```typescript
new Semaphore(permits: number)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `permits` | `number` | Maximum concurrent operations allowed |

```typescript
// Allow up to 5 concurrent database connections
const dbSemaphore = new Semaphore(5);
```

#### Methods

##### `acquire(): Promise<void>`

Acquires a permit. Waits if none available.

```typescript
await semaphore.acquire();
try {
  await useConnection();
} finally {
  semaphore.release();
}
```

##### `release(): void`

Releases a permit, allowing a waiting operation to proceed.

##### `runExclusive<T>(fn): Promise<T>`

Convenience method that acquires, executes, and releases automatically.

```typescript
const result = await semaphore.runExclusive(async () => {
  return await queryDatabase();
});
```

##### `getAvailablePermits(): number`

Returns the number of currently available permits.

##### `getQueueLength(): number`

Returns the number of operations waiting for a permit.

### Usage Examples

**Mutex for Database Writes:**

```typescript
const writeMutex = new Mutex();

async function saveConfig(config: Config): Promise<void> {
  await writeMutex.runExclusive(async () => {
    await db.write('config', config);
  });
}
```

**Semaphore for API Rate Limiting:**

```typescript
const apiSemaphore = new Semaphore(10); // Max 10 concurrent API calls

async function fetchData(ids: string[]): Promise<Data[]> {
  return Promise.all(ids.map(id =>
    apiSemaphore.runExclusive(() => api.fetch(id))
  ));
}
```

---

## Logger

**File:** `src/utils/logger.ts`

A structured logging utility with automatic secret redaction, log levels, and environment-based configuration.

### Log Levels

```typescript
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}
```

### Environment Configuration

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `CODEVAULT_LOG_LEVEL` | `debug`, `info`, `warn`, `error`, `silent` | `info` | Minimum log level |
| `CODEVAULT_QUIET` | `true`, `false` | `false` | When `true`, suppresses INFO and DEBUG |
| `CODEVAULT_REDACT_KEYS` | comma-separated | - | Additional keys to redact |
| `CODEVAULT_REDACT_ENV_VARS` | comma-separated | - | Additional env var names to redact |

### Singleton Logger

```typescript
import { logger, log } from './utils/logger.js';
```

#### Methods

##### `debug(message, meta?): void`

```typescript
logger.debug('Processing file', { filename: 'app.ts', size: 1024 });
// [2024-01-15T10:30:00.000Z] [DEBUG] Processing file {"filename":"app.ts","size":1024}
```

##### `info(message, meta?): void`

```typescript
logger.info('Indexing complete', { files: 150, duration: '2m 30s' });
```

##### `warn(message, meta?): void`

```typescript
logger.warn('Rate limit approaching', { current: 45, max: 50 });
```

##### `error(message, error?, meta?): void`

```typescript
try {
  await riskyOperation();
} catch (err) {
  logger.error('Operation failed', err, { context: 'indexing' });
}
```

Error objects are automatically destructured:

```typescript
// Output includes: errorMessage, errorStack, errorName
```

##### `setLevel(level): void`

```typescript
logger.setLevel(LogLevel.DEBUG);
```

##### `setQuiet(quiet): void`

```typescript
logger.setQuiet(true); // Suppresses INFO and DEBUG
```

##### `isQuiet(): boolean`

```typescript
if (!logger.isQuiet()) {
  showProgressBar();
}
```

### Convenience Object: `log`

```typescript
import { log } from './utils/logger.js';

log.debug('message');
log.info('message');
log.warn('message');
log.error('message', error);
log.setQuiet(true);
```

### Plain Output: `print`

For user-facing CLI output without timestamps or levels:

```typescript
import { print } from './utils/logger.js';

print('Processing complete!');
// Output: Processing complete!
```

### Secret Redaction

The logger automatically redacts sensitive information from log output.

#### Redacted Patterns

- **API Keys:** `sk-*`, `AKIA*` (AWS), `gh*_*` (GitHub), `xox*-*` (Slack)
- **JWTs:** `eyJ*.eyJ*.*`
- **Bearer Tokens:** `Bearer *`
- **PEM Private Keys:** `-----BEGIN * PRIVATE KEY-----`
- **Key-Value Secrets:** `api|secret|token|password=*`

#### Redacted Key Names

Keys containing these terms are fully redacted:
- `token`, `secret`, `password`, `passwd`, `pwd`
- `authorization`, `auth`, `bearer`
- `session`, `cookie`, `apikey`, `clientsecret`

#### Default Redacted Environment Variables

- `OPENAI_API_KEY`
- `NPM_TOKEN`
- `GITHUB_TOKEN`, `GH_TOKEN`
- `DATABASE_URL`
- `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

#### Custom Redaction

```bash
# Add custom keys to redact
export CODEVAULT_REDACT_KEYS="mySecretField,internalToken"

# Add custom env var names to redact
export CODEVAULT_REDACT_ENV_VARS="MY_API_KEY,INTERNAL_SECRET"
```

### Function: `redactLogData`

For manual redaction outside the logger:

```typescript
import { redactLogData } from './utils/logger.js';

const { message, meta } = redactLogData(
  'API key: sk-abc123...',
  { apiKey: 'secret-value' }
);
// message: 'API key: [REDACTED]'
// meta: { apiKey: '[REDACTED]' }
```

---

## CLI UI

**File:** `src/utils/cli-ui.ts`

Provides progress bars, spinners, and formatted console output for the CLI indexer.

### Class: `IndexerUI`

```typescript
import { IndexerUI } from './utils/cli-ui.js';

const ui = new IndexerUI();
```

#### Methods

##### `showHeader(): void`

Displays the CodeVault indexer header.

```typescript
ui.showHeader();
// Output: 🔍 CodeVault Indexer
```

##### `showConfiguration(config): void`

Displays configuration summary.

```typescript
ui.showConfiguration({
  provider: 'OpenAI',
  model: 'text-embedding-3-small',
  dimensions: 1536,
  chunkSize: { min: 500, max: 8000, optimal: 4000 },
  rateLimit: { rpm: 50 }
});
```

##### `startScanning(): void`

Shows a spinner during file scanning.

##### `finishScanning(fileCount, languages): void`

Completes the scanning phase with results.

```typescript
ui.finishScanning(150, 5);
// Output: ✓ Found 150 files across 5+ languages
```

##### `startIndexing(): void`

Initializes the progress bar for indexing.

##### `updateProgress(fileName, current?, total?, etaMs?, countFile?): void`

Updates the progress bar during indexing.

```typescript
ui.updateProgress('src/app.ts', 50, 150, 120000);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `fileName` | `string` | Current file being processed |
| `current` | `number` | Current progress count |
| `total` | `number` | Total files to process |
| `etaMs` | `number \| null` | Estimated time remaining in ms |
| `countFile` | `boolean` | Whether to increment processed count (default: true) |

##### `updateStats(stats): void`

Updates chunking statistics for the summary.

```typescript
ui.updateStats({
  chunks: 500,
  merged: 20,
  subdivided: 15,
  skipped: 5
});
```

##### `showFinalizing(): void`

Shows spinner during finalization phase.

##### `finishIndexing(): void`

Completes indexing with timing summary.

##### `showSummary(summary): void`

Displays final summary with usage instructions.

```typescript
ui.showSummary({
  totalChunks: 500,
  dbSize: '15.2 MB',
  codemapSize: '2.1 MB'
});
```

##### `showError(message): void`

Displays an error message.

##### `cleanup(): void`

Cleans up spinners and progress bars (call on error/exit).

---

## Path Helpers

**File:** `src/utils/path-helpers.ts`

Utilities for path resolution and environment management.

### Function: `resolveProjectRoot`

Resolves project root from various input formats with path safety validation.

```typescript
import { resolveProjectRoot } from './utils/path-helpers.js';

// From different input formats
const root = resolveProjectRoot({ project: './my-project' });
const root = resolveProjectRoot({ directory: '/absolute/path' });
const root = resolveProjectRoot({ path: '../relative' });
const root = resolveProjectRoot(); // Returns current directory
```

| Input Property | Type | Description |
|----------------|------|-------------|
| `project` | `string` | Project path (highest priority) |
| `directory` | `string` | Directory path |
| `path` | `string` | Generic path (lowest priority) |

**Security:** Validates that the resolved path is within the project root. Throws an error with code `PATH_VALIDATION_FAILED` if path traversal is detected.

```typescript
try {
  resolveProjectRoot({ path: '../../../etc/passwd' });
} catch (error) {
  // error.code === 'PATH_VALIDATION_FAILED'
  // error.message: 'Path "..." is outside the project root'
}
```

### Function: `withQuietLogs`

Executes a function with quiet logging mode enabled.

```typescript
import { withQuietLogs } from './utils/path-helpers.js';

const result = await withQuietLogs(async () => {
  // All logging suppressed during this execution
  return await indexProject(options);
});

// With model profile caching
const result = await withQuietLogs(
  async () => await indexProject(options),
  { cacheModelProfile: true }
);
```

| Option | Type | Description |
|--------|------|-------------|
| `cacheModelProfile` | `boolean` | Also set `CODEVAULT_MODEL_PROFILE_CACHED=true` |

**Note:** Automatically restores previous environment state after execution.

---

## Scan Patterns

**File:** `src/utils/scan-patterns.ts`

Default ignore patterns for file scanning.

### Constant: `DEFAULT_SCAN_IGNORES`

```typescript
import { DEFAULT_SCAN_IGNORES } from './utils/scan-patterns.js';
```

An array of glob patterns excluded from project scanning by default:

| Category | Patterns |
|----------|----------|
| Dependencies | `**/node_modules/**`, `**/vendor/**` |
| Build Output | `**/dist/**`, `**/build/**` |
| Version Control | `**/.git/**` |
| Temporary | `**/tmp/**`, `**/temp/**` |
| Package Managers | `**/.npm/**`, `**/.yarn/**` |
| Lock Files | `**/package-lock.json`, `**/yarn.lock`, `**/pnpm-lock.yaml` |
| System | `**/Library/**`, `**/System/**`, `**/.Trash/**` |
| CodeVault | `**/.codevault/**`, `**/codevault.codemap.json*` |
| Other | `**/storage/**`, `**/examples/**`, `**/assets/**`, `**/*.min.json` |

---

## Indexer with Progress

**File:** `src/utils/indexer-with-progress.ts`

A wrapper around the core indexer that provides progress callbacks.

### Function: `indexProjectWithProgress`

```typescript
import { indexProjectWithProgress } from './utils/indexer-with-progress.js';
```

#### Signature

```typescript
async function indexProjectWithProgress(
  options: IndexProjectOptions & { callbacks?: IndexWithProgressCallbacks }
): Promise<IndexProjectResult>
```

#### Callbacks Interface

```typescript
interface IndexWithProgressCallbacks {
  onScanComplete?: (fileCount: number) => void;
  onFileProgress?: (
    current: number,
    total: number,
    fileName: string,
    etaMs: number | null,
    avgPerFileMs: number | null,
    countFile?: boolean
  ) => void;
  onChunkHeartbeat?: (etaMs: number | null) => void;
  onFinalizing?: () => void;
}
```

#### Usage Example

```typescript
import { indexProjectWithProgress } from './utils/indexer-with-progress.js';

const result = await indexProjectWithProgress({
  basePath: '/path/to/project',
  // ... other IndexProjectOptions
  callbacks: {
    onScanComplete: (count) => {
      console.log(`Found ${count} files to index`);
    },
    onFileProgress: (current, total, file, eta) => {
      const percent = ((current / total) * 100).toFixed(1);
      console.log(`[${percent}%] ${file} - ETA: ${eta}ms`);
    },
    onFinalizing: () => {
      console.log('Finalizing indexes...');
    }
  }
});
```

#### Progress Events

| Event | Trigger | Callback |
|-------|---------|----------|
| `scan_complete` | After file discovery | `onScanComplete` |
| `file_enqueued` | File queued for processing | `onFileProgress` (if 0 chunks) |
| `chunk_embedded` | Chunk embedding complete | `onFileProgress` (when file done) |
| `chunk_processed` | Chunk processing heartbeat | `onChunkHeartbeat` |
| `finalizing` | Index finalization started | `onFinalizing` |

---

## Summary

| Utility | Purpose | Key Features |
|---------|---------|--------------|
| `RateLimiter` | API throttling | RPM/TPM limits, auto-retry, queue management |
| `SimpleLRU` | Caching | O(1) operations, TTL support, thundering herd protection |
| `Mutex` | Exclusive access | Async-safe locking with timeout |
| `Semaphore` | Concurrent limit | Counting permits for parallel operations |
| `Logger` | Logging | Levels, secret redaction, structured metadata |
| `IndexerUI` | CLI progress | Progress bars, spinners, formatted output |
| `resolveProjectRoot` | Path handling | Safe path resolution with validation |
| `withQuietLogs` | Environment | Temporary quiet mode wrapper |
| `DEFAULT_SCAN_IGNORES` | Patterns | Default ignore globs for scanning |
| `indexProjectWithProgress` | Progress | Indexer wrapper with callbacks |
