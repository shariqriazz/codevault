# Incremental Indexing Guide

> Version 1.8.5 | CodeVault Incremental Indexing System

This document describes CodeVault's incremental indexing system, which enables efficient re-indexing of codebases by tracking file changes using Merkle trees and providing real-time file watching with debounced updates.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Merkle Tree Change Detection](#merkle-tree-change-detection)
- [Watch Service](#watch-service)
- [Change Queue](#change-queue)
- [Provider Manager](#provider-manager)
- [CLI Commands](#cli-commands)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

CodeVault's incremental indexing system avoids re-indexing entire codebases by:

1. **Merkle Tree Hashing**: Tracking file content hashes to detect changes
2. **Differential Updates**: Only processing changed or deleted files
3. **File Watching**: Real-time monitoring with debounced batch updates
4. **Provider Reuse**: Maintaining embedding provider instances across updates

This approach reduces indexing time from minutes to seconds for typical development workflows.

### Key Benefits

- **Performance**: Only changed files are re-indexed
- **Resource Efficiency**: Reuses embedding provider connections
- **Real-time Updates**: File watcher keeps index synchronized
- **Atomic Operations**: Race-condition-free batch processing

---

## Architecture

The incremental indexing system consists of four main components:

```
src/indexer/
  merkle.ts         # Merkle tree hashing and persistence
  update.ts         # Incremental update orchestration
  watch.ts          # Module exports (facade)
  WatchService.ts   # File system watching coordination
  ChangeQueue.ts    # Debounced change batching
  ProviderManager.ts # Embedding provider lifecycle
```

### Data Flow

```
File System Events
       |
       v
  WatchService (chokidar)
       |
       v
  ChangeQueue (debounce + batch)
       |
       v
  updateIndex() (merkle.ts + update.ts)
       |
       v
  indexProject() (core indexer)
       |
       v
  Merkle Tree Update (.codevault/merkle.json)
```

---

## Merkle Tree Change Detection

### How It Works

CodeVault uses xxhash (via `xxhash-wasm`) to compute fast, non-cryptographic hashes of file contents. These hashes are stored in a Merkle tree structure at `.codevault/merkle.json`.

### Merkle Entry Structure

```typescript
interface MerkleEntry {
  shaFile: string;      // Hash of the file content
  chunkShas: string[];  // Hashes of individual chunks (for fine-grained tracking)
}

type MerkleTree = Record<string, MerkleEntry>;
// Keys are POSIX-normalized relative paths (e.g., "src/utils/helper.ts")
```

### Storage Location

Merkle trees are stored at:
```
<project-root>/.codevault/merkle.json
```

### Core Functions

#### `computeFastHash(input: string | Buffer): Promise<string>`

Computes an xxhash-64 hash of the input content.

```typescript
import { computeFastHash } from 'codevault/indexer/merkle';

const hash = await computeFastHash('function hello() { return "world"; }');
// Returns: "12345678901234567" (64-bit hash as string)
```

#### `loadMerkle(basePath?: string): MerkleTree`

Loads the Merkle tree from disk. Returns an empty object if the file does not exist or is malformed.

```typescript
import { loadMerkle } from 'codevault/indexer/merkle';

const tree = loadMerkle('/path/to/project');
// Returns: { "src/index.ts": { shaFile: "...", chunkShas: [...] }, ... }
```

#### `saveMerkle(basePath?: string, merkle?: MerkleTree): void`

Saves the Merkle tree to disk synchronously.

```typescript
import { saveMerkle } from 'codevault/indexer/merkle';

saveMerkle('/path/to/project', updatedTree);
```

#### `saveMerkleAsync(basePath?: string, merkle?: MerkleTree): Promise<void>`

Asynchronous version of `saveMerkle` for non-blocking I/O.

### Path Safety

All file paths are validated before use to prevent directory traversal attacks:

#### `validatePathSafety(basePath: string, targetPath: string)`

Returns an object indicating whether the path is safe:

```typescript
import { validatePathSafety } from 'codevault/indexer/merkle';

const result = validatePathSafety('/project', '../etc/passwd');
// Returns: { safe: false, normalized: null, reason: 'path_outside_base' }

const valid = validatePathSafety('/project', 'src/index.ts');
// Returns: { safe: true, normalized: 'src/index.ts' }
```

Safety checks include:
- Path must resolve within the base directory
- Symlinks are resolved and validated
- Absolute paths outside the project are rejected

#### `normalizeToProjectPath(basePath?: string, filePath?: string): string | null`

Convenience wrapper that returns the normalized path or `null` if unsafe.

---

## Watch Service

The `WatchService` class coordinates file system watching with the change queue and provider manager.

### Starting the Watcher

```typescript
import { startWatch } from 'codevault/indexer/watch';

const controller = startWatch({
  repoPath: '/path/to/project',
  provider: 'auto',           // Uses configured embedding provider
  debounceMs: 500,            // Wait 500ms after last change before indexing
  encrypt: 'off',             // Optional: encryption mode
  concurrency: 200,           // Optional: parallel file processing
  onBatch: ({ changed, deleted }) => {
    console.log(`Indexed ${changed.length} changed, ${deleted.length} deleted`);
  }
});

// Wait for watcher to be ready
await controller.ready;

// Later: flush pending changes and close
await controller.flush();
await controller.close();
```

### WatchController Interface

```typescript
interface WatchController {
  watcher: FSWatcher;              // Underlying chokidar instance
  ready: Promise<void>;            // Resolves when watcher is ready
  close: () => Promise<void>;      // Stop watching and cleanup
  flush: () => Promise<void>;      // Force flush pending changes
}
```

### Configuration Options

```typescript
interface WatchServiceOptions {
  repoPath?: string;     // Project root (default: current directory)
  provider?: string;     // Embedding provider name (default: 'auto')
  debounceMs?: number;   // Debounce interval in ms (default: 500)
  encrypt?: string;      // Encryption mode: 'on' | 'off'
  concurrency?: number;  // Parallel file processing (default: 200)
  logger?: Console;      // Custom logger
  onBatch?: (event: { changed: string[]; deleted: string[] }) => void;
}
```

### Ignored Patterns

The watcher automatically ignores:
- `**/node_modules/**`
- `**/.git/**`
- `**/.codevault/**`
- `**/dist/**`
- `**/build/**`
- `**/tmp/**`
- `**/.tmp/**`
- `**/vendor/**`

### Supported File Extensions

Only files with extensions matching CodeVault's 25+ supported languages are watched. See `src/languages/rules.ts` for the complete list.

---

## Change Queue

The `ChangeQueue` class manages debouncing and race-condition-free batch processing.

### Debouncing Behavior

1. File events are queued as they arrive
2. A timer is set/reset on each event
3. After the debounce period with no new events, changes are flushed
4. During flush, new events queue for the next batch

### Queue Operations

```typescript
import { ChangeQueue } from 'codevault/indexer/ChangeQueue';

const queue = new ChangeQueue({
  repoPath: '/project',
  provider: 'auto',
  debounceMs: 500,
  onBatch: ({ changed, deleted }) => {
    console.log(`Processed: ${changed.length} changed, ${deleted.length} deleted`);
  }
});

// Enqueue changes (called by WatchService)
queue.enqueue('add', 'src/new-file.ts');
queue.enqueue('change', 'src/modified.ts');
queue.enqueue('unlink', 'src/deleted.ts');

// Check pending state
queue.hasPending();        // true
queue.getPendingCount();   // { changes: 2, deletes: 1 }

// Force immediate flush
await queue.flush();

// Graceful shutdown (flushes all pending + settle delay)
await queue.drain();

// Cancel without flushing
queue.cancel();
```

### Race Condition Handling

The queue ensures atomic operations:
- Only one flush operation runs at a time
- Changes arriving during flush are queued for the next batch
- The `drain()` method includes a settle delay to catch late-arriving events

---

## Provider Manager

The `ProviderManager` class handles embedding provider lifecycle for efficient reuse.

### Why Provider Reuse Matters

Creating embedding providers involves:
- API client initialization
- Model configuration validation
- Rate limiter setup

Reusing providers across watch updates avoids this overhead.

### Usage

```typescript
import { ProviderManager } from 'codevault/indexer/ProviderManager';

const manager = new ProviderManager(
  'openai',              // Provider name
  embeddingOptions,      // Provider configuration
  console                // Logger
);

// Get or create provider (safe for concurrent calls)
const provider = await manager.getProvider();

// Get provider without throwing (returns null on error)
const safeProvider = await manager.getProviderSafe();

// Cleanup on shutdown
manager.cleanup();
```

### Concurrent Initialization Safety

Multiple calls to `getProvider()` during initialization will wait for the same initialization promise, preventing duplicate provider creation.

---

## CLI Commands

### `codevault update [path]`

Incrementally update an existing index with changed files.

```bash
# Update current directory
codevault update

# Update specific project
codevault update /path/to/project

# With options
codevault update --provider openai --encrypt on
```

### `codevault watch [path]`

Start file watching with automatic index updates.

```bash
# Watch current directory
codevault watch

# Custom debounce interval (milliseconds)
codevault watch --debounce 1000

# With encryption
codevault watch --encrypt on

# Watch specific project
codevault watch /path/to/project
```

**Watch Output:**
```
CodeVault watch: indexed 3 changed / 1 deleted files
CodeVault watch: indexed 1 changed / 0 deleted files
```

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CODEVAULT_WATCH_DEBOUNCE_MS` | Debounce interval for file watcher | 500 |

### Constants (from `src/config/constants.ts`)

```typescript
const WATCHER_CONSTANTS = {
  DEFAULT_DEBOUNCE_MS: 500,      // Default debounce interval
  MIN_DEBOUNCE_MS: 50,           // Minimum allowed debounce
  SETTLE_DELAY_MS: 200,          // Delay before final drain check
  STABILITY_THRESHOLD_MS: 100,  // File write stability threshold
  POLL_INTERVAL_MS: 50          // Stability poll interval
};
```

### Overriding Defaults

```bash
# Environment variable
export CODEVAULT_WATCH_DEBOUNCE_MS=1000

# CLI argument
codevault watch --debounce 1000
```

---

## API Reference

### updateIndex(options)

Incrementally updates the index for changed and deleted files.

```typescript
import { updateIndex } from 'codevault/indexer/update';

interface UpdateIndexOptions {
  repoPath?: string;              // Project root (default: '.')
  provider?: string;              // Embedding provider (default: 'auto')
  changedFiles?: string[];        // Relative paths to re-index
  deletedFiles?: string[];        // Relative paths to remove
  onProgress?: (event) => void;   // Progress callback
  embeddingProvider?: Provider;   // Pre-initialized provider
  encrypt?: string;               // Encryption mode
  concurrency?: number;           // Parallel processing
}

interface UpdateIndexResult {
  success: boolean;
  processedChunks: number;
  totalChunks: number;
  provider: string;
  errors: IndexError[];
}

const result = await updateIndex({
  repoPath: '/project',
  changedFiles: ['src/updated.ts'],
  deletedFiles: ['src/removed.ts']
});
```

### startWatch(options)

Starts the file watcher and returns a controller.

```typescript
import { startWatch } from 'codevault/indexer/watch';

const controller = startWatch({
  repoPath: '/project',
  debounceMs: 500
});

await controller.ready;
// ... later
await controller.close();
```

---

## Best Practices

### 1. Use Watch Mode for Active Development

```bash
# Start in a terminal during development
codevault watch

# Combined with your dev server
npm run dev & codevault watch
```

### 2. Initial Index Before Watching

Always run a full index before starting the watcher:

```bash
codevault index
codevault watch
```

### 3. Handle Large Codebases

For very large codebases, increase the debounce interval:

```bash
codevault watch --debounce 2000
```

### 4. Graceful Shutdown

The watcher handles SIGINT/SIGTERM gracefully. Press Ctrl+C once to flush pending changes and exit cleanly.

### 5. Check Index Status

Use `codevault info` to verify the index state:

```bash
codevault info
# Shows: file count, chunk count, provider, last indexed time
```

---

## Troubleshooting

### "Files not being detected"

**Cause**: File extension not in supported list.

**Solution**: Check that your file type is supported:
```bash
# Supported extensions are defined in src/languages/rules.ts
# Common: .ts, .js, .tsx, .jsx, .py, .go, .rs, .java, .rb, etc.
```

### "Changes not being indexed"

**Cause**: Debounce timer hasn't fired yet.

**Solution**: Wait for the debounce period, or force flush:
```typescript
// Programmatic
await controller.flush();
```

### "Watch uses too much CPU"

**Cause**: Too many file events triggering rapid reindexing.

**Solution**: Increase debounce interval:
```bash
codevault watch --debounce 2000
```

### "Provider initialization errors during watch"

**Cause**: API key or network issues.

**Solution**: Check your provider configuration:
```bash
codevault config list --sources
# Verify API keys are set correctly
```

### "Merkle tree corruption"

**Cause**: Interrupted index operation or manual edits.

**Solution**: Delete and rebuild:
```bash
rm -rf .codevault/
codevault index
```

### "Path safety errors"

**Cause**: Symlinks or paths escaping project directory.

**Solution**: This is a security feature. Ensure all indexed files are within the project root. Symlinks pointing outside the project are rejected.

---

## Internal Details

### Hash Algorithm

CodeVault uses xxhash-64 (via `xxhash-wasm`) for fast, non-cryptographic hashing. This provides:
- Speed: ~10GB/s on modern hardware
- Quality: Low collision probability for content-based deduplication
- Portability: WebAssembly implementation works across platforms

### Merkle Tree Updates

The Merkle tree is updated atomically after each indexing operation:

1. Load existing tree
2. Update entries for changed files
3. Remove entries for deleted files
4. Save entire tree to disk

Future versions may implement incremental tree updates for very large codebases.

### chokidar Configuration

The file watcher uses these chokidar options:
- `ignoreInitial: true` - Skip existing files on startup
- `awaitWriteFinish` - Wait for file writes to complete
- `persistent: true` - Keep process alive

---

## See Also

- [Configuration Guide](CONFIGURATION.md) - Provider and API configuration
- [CLI Reference](CLI_REFERENCE.md) - Complete command documentation
- [MCP Setup Guide](MCP_SETUP.md) - Claude Desktop integration

---

**Last Updated**: December 2025
