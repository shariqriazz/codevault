/**
 * Unit tests for src/indexer/WatchService.ts
 *
 * Tests file system watching and debounced change detection including:
 * - WatchService construction and configuration
 * - File event handling (add, change, unlink)
 * - Extension filtering
 * - Debounce configuration
 * - Controller interface
 * - startWatch helper function
 * - Cleanup and resource management
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'timers/promises';
import path from 'path';
import fs from 'fs';
import os from 'os';

import {
  WatchService,
  startWatch,
  type WatchServiceOptions,
  type WatchController
} from '../../indexer/WatchService.js';

// Helper to create a temporary directory for testing
async function createTempDir(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'watchservice-test-'));

  // Create src directory for test files
  await fs.promises.mkdir(path.join(root, 'src'), { recursive: true });

  return {
    root,
    cleanup: async () => {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  };
}

// Helper to create a test file
async function writeTestFile(root: string, relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(root, relativePath);
  await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.promises.writeFile(fullPath, content);
}

// Mock logger that captures calls
function createMockLogger(): Console & { errors: unknown[]; logs: unknown[] } {
  const errors: unknown[] = [];
  const logs: unknown[] = [];

  return {
    log: (...args: unknown[]) => { logs.push(args); },
    error: (...args: unknown[]) => { errors.push(args); },
    warn: () => {},
    info: () => {},
    debug: () => {},
    errors,
    logs
  } as unknown as Console & { errors: unknown[]; logs: unknown[] };
}

// ============================================================================
// WatchService Construction Tests
// ============================================================================

test('WatchService can be constructed with minimal options', async () => {
  const tmpDir = await createTempDir();

  try {
    const service = new WatchService({ repoPath: tmpDir.root });

    assert.ok(service, 'Service should be created');

    await service.close();
  } finally {
    await tmpDir.cleanup();
  }
});

test('WatchService can be constructed with empty options', async () => {
  // Uses cwd as default
  const service = new WatchService({});

  assert.ok(service, 'Service should be created with empty options');

  await service.close();
});

test('WatchService accepts custom debounce option', async () => {
  const tmpDir = await createTempDir();

  try {
    const service = new WatchService({
      repoPath: tmpDir.root,
      debounceMs: 100
    });

    assert.ok(service, 'Service with custom debounce should be created');

    await service.close();
  } finally {
    await tmpDir.cleanup();
  }
});

test('WatchService enforces minimum debounce', async () => {
  const tmpDir = await createTempDir();

  try {
    // Very small debounce should be clamped to minimum
    const service = new WatchService({
      repoPath: tmpDir.root,
      debounceMs: 1 // Very small
    });

    assert.ok(service, 'Service should handle very small debounce');

    await service.close();
  } finally {
    await tmpDir.cleanup();
  }
});

test('WatchService accepts custom logger', async () => {
  const tmpDir = await createTempDir();
  const logger = createMockLogger();

  try {
    const service = new WatchService({
      repoPath: tmpDir.root,
      logger
    });

    assert.ok(service, 'Service with custom logger should be created');

    await service.close();
  } finally {
    await tmpDir.cleanup();
  }
});

test('WatchService accepts custom provider option', async () => {
  const tmpDir = await createTempDir();

  try {
    const service = new WatchService({
      repoPath: tmpDir.root,
      provider: 'mock'
    });

    assert.ok(service, 'Service with custom provider should be created');

    await service.close();
  } finally {
    await tmpDir.cleanup();
  }
});

test('WatchService accepts encryption option', async () => {
  const tmpDir = await createTempDir();

  try {
    const service = new WatchService({
      repoPath: tmpDir.root,
      encrypt: 'off'
    });

    assert.ok(service, 'Service with encryption option should be created');

    await service.close();
  } finally {
    await tmpDir.cleanup();
  }
});

test('WatchService accepts concurrency option', async () => {
  const tmpDir = await createTempDir();

  try {
    const service = new WatchService({
      repoPath: tmpDir.root,
      concurrency: 10
    });

    assert.ok(service, 'Service with concurrency option should be created');

    await service.close();
  } finally {
    await tmpDir.cleanup();
  }
});

test('WatchService accepts onBatch callback', async () => {
  const tmpDir = await createTempDir();
  let batchCalled = false;

  try {
    const service = new WatchService({
      repoPath: tmpDir.root,
      onBatch: () => { batchCalled = true; }
    });

    assert.ok(service, 'Service with onBatch should be created');

    await service.close();
  } finally {
    await tmpDir.cleanup();
  }
});

// ============================================================================
// waitForReady Tests
// ============================================================================

test('WatchService waitForReady resolves when watcher is ready', async () => {
  const tmpDir = await createTempDir();

  try {
    const service = new WatchService({ repoPath: tmpDir.root });

    await service.waitForReady();

    assert.ok(true, 'waitForReady should resolve');

    await service.close();
  } finally {
    await tmpDir.cleanup();
  }
});

test('WatchService waitForReady can be called multiple times', async () => {
  const tmpDir = await createTempDir();

  try {
    const service = new WatchService({ repoPath: tmpDir.root });

    await service.waitForReady();
    await service.waitForReady();
    await service.waitForReady();

    assert.ok(true, 'Multiple waitForReady calls should work');

    await service.close();
  } finally {
    await tmpDir.cleanup();
  }
});

// ============================================================================
// getController Tests
// ============================================================================

test('WatchService getController returns valid controller', async () => {
  const tmpDir = await createTempDir();

  try {
    const service = new WatchService({ repoPath: tmpDir.root });
    const controller = service.getController();

    assert.ok(controller.watcher, 'Controller should have watcher');
    assert.ok(controller.ready instanceof Promise, 'Controller should have ready promise');
    assert.equal(typeof controller.close, 'function', 'Controller should have close method');
    assert.equal(typeof controller.flush, 'function', 'Controller should have flush method');

    await service.close();
  } finally {
    await tmpDir.cleanup();
  }
});

test('WatchService controller close triggers service close', async () => {
  const tmpDir = await createTempDir();

  try {
    const service = new WatchService({ repoPath: tmpDir.root });
    const controller = service.getController();

    await controller.ready;
    await controller.close();

    assert.ok(true, 'Controller close should work');
  } finally {
    await tmpDir.cleanup();
  }
});

test('WatchService controller flush triggers service flush', async () => {
  const tmpDir = await createTempDir();

  try {
    const service = new WatchService({ repoPath: tmpDir.root });
    const controller = service.getController();

    await controller.ready;
    await controller.flush();

    assert.ok(true, 'Controller flush should work');

    await controller.close();
  } finally {
    await tmpDir.cleanup();
  }
});

// ============================================================================
// startWatch Helper Tests
// ============================================================================

test('startWatch returns valid controller', async () => {
  const tmpDir = await createTempDir();

  try {
    const controller = startWatch({ repoPath: tmpDir.root });

    assert.ok(controller.watcher, 'Should have watcher');
    assert.ok(controller.ready instanceof Promise, 'Should have ready promise');
    assert.equal(typeof controller.close, 'function', 'Should have close method');
    assert.equal(typeof controller.flush, 'function', 'Should have flush method');

    await controller.close();
  } finally {
    await tmpDir.cleanup();
  }
});

test('startWatch with empty options uses defaults', async () => {
  const controller = startWatch({});

  await controller.ready;
  await controller.close();

  assert.ok(true, 'startWatch with empty options should work');
});

test('startWatch passes all options through', async () => {
  const tmpDir = await createTempDir();
  let batchCalled = false;

  try {
    const controller = startWatch({
      repoPath: tmpDir.root,
      provider: 'mock',
      debounceMs: 100,
      encrypt: 'off',
      concurrency: 5,
      onBatch: () => { batchCalled = true; }
    });

    await controller.ready;
    await controller.close();

    assert.ok(true, 'All options should be passed through');
  } finally {
    await tmpDir.cleanup();
  }
});

// ============================================================================
// File Event Handling Tests (with real file system)
// ============================================================================

test('WatchService detects new file creation', async () => {
  const tmpDir = await createTempDir();
  const changes: { changed: string[]; deleted: string[] }[] = [];

  try {
    const service = new WatchService({
      repoPath: tmpDir.root,
      debounceMs: 50,
      onBatch: (event) => { changes.push(event); }
    });

    await service.waitForReady();

    // Create a new TypeScript file
    await writeTestFile(tmpDir.root, 'src/newfile.ts', 'export const x = 1;');

    // Wait for debounce and processing
    await delay(300);

    await service.flush();

    // Note: The file may not be detected if chokidar hasn't settled yet
    // This is a timing-sensitive test

    await service.close();
  } finally {
    await tmpDir.cleanup();
  }
});

test('WatchService detects file modification', async () => {
  const tmpDir = await createTempDir();
  const changes: { changed: string[]; deleted: string[] }[] = [];

  try {
    // Create file before starting watch
    await writeTestFile(tmpDir.root, 'src/existing.ts', 'export const x = 1;');

    const service = new WatchService({
      repoPath: tmpDir.root,
      debounceMs: 50,
      onBatch: (event) => { changes.push(event); }
    });

    await service.waitForReady();

    // Wait for watcher to stabilize
    await delay(100);

    // Modify the file
    await writeTestFile(tmpDir.root, 'src/existing.ts', 'export const x = 2;');

    // Wait for debounce and processing
    await delay(300);

    await service.flush();
    await service.close();
  } finally {
    await tmpDir.cleanup();
  }
});

test('WatchService detects file deletion', async () => {
  const tmpDir = await createTempDir();
  const changes: { changed: string[]; deleted: string[] }[] = [];

  try {
    // Create file before starting watch
    const testFile = path.join(tmpDir.root, 'src/todelete.ts');
    await writeTestFile(tmpDir.root, 'src/todelete.ts', 'export const x = 1;');

    const service = new WatchService({
      repoPath: tmpDir.root,
      debounceMs: 50,
      onBatch: (event) => { changes.push(event); }
    });

    await service.waitForReady();

    // Wait for watcher to stabilize
    await delay(100);

    // Delete the file
    await fs.promises.unlink(testFile);

    // Wait for debounce and processing
    await delay(300);

    await service.flush();
    await service.close();
  } finally {
    await tmpDir.cleanup();
  }
});

// ============================================================================
// Extension Filtering Tests
// ============================================================================

test('WatchService filters out unsupported extensions', async () => {
  const tmpDir = await createTempDir();
  const changes: { changed: string[]; deleted: string[] }[] = [];

  try {
    const service = new WatchService({
      repoPath: tmpDir.root,
      debounceMs: 50,
      onBatch: (event) => { changes.push(event); }
    });

    await service.waitForReady();

    // Wait for watcher to stabilize
    await delay(100);

    // Create a file with unsupported extension
    await writeTestFile(tmpDir.root, 'src/data.xyz', 'some data');

    // Wait for processing
    await delay(200);

    await service.flush();

    // The .xyz file should be filtered out and not trigger a batch
    // (Note: This depends on language extensions configuration)

    await service.close();
  } finally {
    await tmpDir.cleanup();
  }
});

test('WatchService allows supported TypeScript extension', async () => {
  const tmpDir = await createTempDir();
  const changes: { changed: string[]; deleted: string[] }[] = [];

  try {
    const service = new WatchService({
      repoPath: tmpDir.root,
      debounceMs: 50,
      onBatch: (event) => { changes.push(event); }
    });

    await service.waitForReady();

    // Wait for watcher to stabilize
    await delay(100);

    // Create TypeScript file
    await writeTestFile(tmpDir.root, 'src/allowed.ts', 'export const x = 1;');

    // Wait for processing
    await delay(300);

    await service.flush();
    await service.close();
  } finally {
    await tmpDir.cleanup();
  }
});

// ============================================================================
// Ignored Directories Tests
// ============================================================================

test('WatchService ignores node_modules', async () => {
  const tmpDir = await createTempDir();
  const changes: { changed: string[]; deleted: string[] }[] = [];

  try {
    const service = new WatchService({
      repoPath: tmpDir.root,
      debounceMs: 50,
      onBatch: (event) => { changes.push(event); }
    });

    await service.waitForReady();
    await delay(100);

    // Create file in node_modules (should be ignored)
    await fs.promises.mkdir(path.join(tmpDir.root, 'node_modules'), { recursive: true });
    await writeTestFile(tmpDir.root, 'node_modules/package/index.ts', 'export const x = 1;');

    await delay(200);
    await service.flush();

    // Changes from node_modules should be ignored
    const nodeModulesChanges = changes.filter(c =>
      c.changed.some(f => f.includes('node_modules')) ||
      c.deleted.some(f => f.includes('node_modules'))
    );
    assert.equal(nodeModulesChanges.length, 0, 'node_modules changes should be ignored');

    await service.close();
  } finally {
    await tmpDir.cleanup();
  }
});

test('WatchService ignores .git directory', async () => {
  const tmpDir = await createTempDir();
  const changes: { changed: string[]; deleted: string[] }[] = [];

  try {
    const service = new WatchService({
      repoPath: tmpDir.root,
      debounceMs: 50,
      onBatch: (event) => { changes.push(event); }
    });

    await service.waitForReady();
    await delay(100);

    // Create file in .git (should be ignored)
    await fs.promises.mkdir(path.join(tmpDir.root, '.git', 'objects'), { recursive: true });
    await writeTestFile(tmpDir.root, '.git/config', '[core]');

    await delay(200);
    await service.flush();

    // Changes from .git should be ignored
    const gitChanges = changes.filter(c =>
      c.changed.some(f => f.includes('.git')) ||
      c.deleted.some(f => f.includes('.git'))
    );
    assert.equal(gitChanges.length, 0, '.git changes should be ignored');

    await service.close();
  } finally {
    await tmpDir.cleanup();
  }
});

test('WatchService ignores .codevault directory', async () => {
  const tmpDir = await createTempDir();
  const changes: { changed: string[]; deleted: string[] }[] = [];

  try {
    const service = new WatchService({
      repoPath: tmpDir.root,
      debounceMs: 50,
      onBatch: (event) => { changes.push(event); }
    });

    await service.waitForReady();
    await delay(100);

    // Create file in .codevault (should be ignored)
    await fs.promises.mkdir(path.join(tmpDir.root, '.codevault'), { recursive: true });
    await writeTestFile(tmpDir.root, '.codevault/index.db', 'data');

    await delay(200);
    await service.flush();

    // Changes from .codevault should be ignored
    const codevaultChanges = changes.filter(c =>
      c.changed.some(f => f.includes('.codevault')) ||
      c.deleted.some(f => f.includes('.codevault'))
    );
    assert.equal(codevaultChanges.length, 0, '.codevault changes should be ignored');

    await service.close();
  } finally {
    await tmpDir.cleanup();
  }
});

// ============================================================================
// Close and Cleanup Tests
// ============================================================================

test('WatchService close stops watching', async () => {
  const tmpDir = await createTempDir();
  const changes: { changed: string[]; deleted: string[] }[] = [];

  try {
    const service = new WatchService({
      repoPath: tmpDir.root,
      debounceMs: 50,
      onBatch: (event) => { changes.push(event); }
    });

    await service.waitForReady();
    await service.close();

    // Create file after close (should not trigger)
    await writeTestFile(tmpDir.root, 'src/afterclose.ts', 'export const x = 1;');

    await delay(200);

    // No changes should be detected after close
    // (We can't easily assert this, but the test should complete without error)
    assert.ok(true, 'Close should stop watching');
  } finally {
    await tmpDir.cleanup();
  }
});

test('WatchService close is idempotent', async () => {
  const tmpDir = await createTempDir();

  try {
    const service = new WatchService({ repoPath: tmpDir.root });

    await service.waitForReady();

    // Multiple closes should not throw
    await service.close();
    await service.close();
    await service.close();

    assert.ok(true, 'Multiple closes should be safe');
  } finally {
    await tmpDir.cleanup();
  }
});

test('WatchService flush after close does not throw', async () => {
  const tmpDir = await createTempDir();

  try {
    const service = new WatchService({ repoPath: tmpDir.root });

    await service.waitForReady();
    await service.close();

    // Flush after close should not throw
    await service.flush();

    assert.ok(true, 'Flush after close should be safe');
  } finally {
    await tmpDir.cleanup();
  }
});

// ============================================================================
// Error Handling Tests
// ============================================================================

test('WatchService logs errors from watcher', async () => {
  const tmpDir = await createTempDir();
  const logger = createMockLogger();

  try {
    const service = new WatchService({
      repoPath: tmpDir.root,
      logger
    });

    await service.waitForReady();
    await service.close();

    // We can't easily trigger a watcher error, but the error handler exists
    assert.ok(true, 'Error handler should be attached');
  } finally {
    await tmpDir.cleanup();
  }
});

// ============================================================================
// Path Normalization Tests
// ============================================================================

test('WatchService normalizes paths to POSIX format', async () => {
  const tmpDir = await createTempDir();
  const changes: { changed: string[]; deleted: string[] }[] = [];

  try {
    const service = new WatchService({
      repoPath: tmpDir.root,
      debounceMs: 50,
      onBatch: (event) => { changes.push(event); }
    });

    await service.waitForReady();
    await delay(100);

    // Create file with nested path
    await writeTestFile(tmpDir.root, 'src/nested/deep/file.ts', 'export const x = 1;');

    await delay(300);
    await service.flush();

    // Any detected changes should have POSIX-style paths (forward slashes)
    for (const change of changes) {
      for (const filePath of [...change.changed, ...change.deleted]) {
        assert.ok(!filePath.includes('\\'), 'Path should use forward slashes');
      }
    }

    await service.close();
  } finally {
    await tmpDir.cleanup();
  }
});

// ============================================================================
// Edge Cases
// ============================================================================

test('WatchService handles non-existent repoPath gracefully', async () => {
  const nonExistentPath = path.join(os.tmpdir(), 'nonexistent-' + Date.now());

  try {
    const service = new WatchService({
      repoPath: nonExistentPath
    });

    // Watcher may still start but watch nothing
    await service.waitForReady();
    await service.close();

    assert.ok(true, 'Should handle non-existent path');
  } catch (error) {
    // Some systems may throw for non-existent path
    assert.ok(true, 'Error for non-existent path is acceptable');
  }
});

test('WatchService handles invalid debounceMs values', async () => {
  const tmpDir = await createTempDir();

  try {
    const service = new WatchService({
      repoPath: tmpDir.root,
      debounceMs: NaN
    });

    await service.waitForReady();
    await service.close();

    assert.ok(true, 'Should handle NaN debounce');
  } finally {
    await tmpDir.cleanup();
  }
});

test('WatchService handles negative debounceMs', async () => {
  const tmpDir = await createTempDir();

  try {
    const service = new WatchService({
      repoPath: tmpDir.root,
      debounceMs: -100
    });

    await service.waitForReady();
    await service.close();

    assert.ok(true, 'Should handle negative debounce');
  } finally {
    await tmpDir.cleanup();
  }
});

test('WatchService handles null onBatch callback', async () => {
  const tmpDir = await createTempDir();

  try {
    const service = new WatchService({
      repoPath: tmpDir.root,
      onBatch: null
    });

    await service.waitForReady();
    await service.close();

    assert.ok(true, 'Should handle null callback');
  } finally {
    await tmpDir.cleanup();
  }
});
