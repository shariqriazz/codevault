/**
 * Unit tests for src/indexer/watch.ts
 *
 * Tests the re-export module that provides backward-compatible exports
 * for WatchService, ChangeQueue, and ProviderManager.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// Import from watch.ts (the re-export module)
import {
  startWatch,
  WatchService,
  ChangeQueue,
  ProviderManager
} from '../../indexer/watch.js';

// Also import types to ensure they're exported
import type {
  WatchOptions,
  WatchController
} from '../../indexer/watch.js';

// ============================================================================
// Re-export Verification Tests
// ============================================================================

test('watch.ts exports startWatch function', () => {
  assert.equal(typeof startWatch, 'function', 'startWatch should be a function');
});

test('watch.ts exports WatchService class', () => {
  assert.equal(typeof WatchService, 'function', 'WatchService should be a constructor');
});

test('watch.ts exports ChangeQueue class', () => {
  assert.equal(typeof ChangeQueue, 'function', 'ChangeQueue should be a constructor');
});

test('watch.ts exports ProviderManager class', () => {
  assert.equal(typeof ProviderManager, 'function', 'ProviderManager should be a constructor');
});

// ============================================================================
// Type Export Verification Tests
// ============================================================================

test('WatchOptions type is properly exported (duck typing)', () => {
  // Verify the type works by creating a conforming object
  const options: WatchOptions = {
    repoPath: '/test',
    provider: 'mock',
    debounceMs: 100
  };

  assert.ok(options.repoPath, 'WatchOptions should accept repoPath');
});

test('WatchController type is properly exported (duck typing)', () => {
  // Verify the type interface
  const mockController: WatchController = {
    watcher: {} as ReturnType<typeof import('chokidar').watch>,
    ready: Promise.resolve(),
    close: async () => {},
    flush: async () => {}
  };

  assert.equal(typeof mockController.close, 'function', 'WatchController should have close');
  assert.equal(typeof mockController.flush, 'function', 'WatchController should have flush');
});

// ============================================================================
// Instance Creation Tests (verify exports work correctly)
// ============================================================================

test('ChangeQueue can be instantiated through watch.ts export', () => {
  const queue = new ChangeQueue({
    repoPath: '/test',
    provider: 'mock',
    debounceMs: 100
  });

  assert.ok(queue, 'ChangeQueue should be instantiable');
  assert.equal(typeof queue.enqueue, 'function', 'Should have enqueue method');
  assert.equal(typeof queue.flush, 'function', 'Should have flush method');
  assert.equal(typeof queue.drain, 'function', 'Should have drain method');
  assert.equal(typeof queue.cancel, 'function', 'Should have cancel method');
  assert.equal(typeof queue.hasPending, 'function', 'Should have hasPending method');
  assert.equal(typeof queue.getPendingCount, 'function', 'Should have getPendingCount method');

  queue.cancel();
});

test('ProviderManager can be instantiated through watch.ts export', () => {
  const manager = new ProviderManager('mock', {});

  assert.ok(manager, 'ProviderManager should be instantiable');
  assert.equal(typeof manager.getProvider, 'function', 'Should have getProvider method');
  assert.equal(typeof manager.getProviderSafe, 'function', 'Should have getProviderSafe method');
  assert.equal(typeof manager.cleanup, 'function', 'Should have cleanup method');
});

// ============================================================================
// Backward Compatibility Tests
// ============================================================================

test('startWatch returns expected controller interface', () => {
  const controller = startWatch({});

  assert.ok(controller.watcher, 'Controller should have watcher');
  assert.ok(controller.ready instanceof Promise, 'Controller should have ready promise');
  assert.equal(typeof controller.close, 'function', 'Controller should have close');
  assert.equal(typeof controller.flush, 'function', 'Controller should have flush');

  // Clean up
  void controller.close();
});

test('WatchService getController matches WatchController interface', async () => {
  const service = new WatchService({});
  const controller = service.getController();

  assert.ok(controller.watcher, 'Should have watcher');
  assert.ok(controller.ready instanceof Promise, 'Should have ready promise');
  assert.equal(typeof controller.close, 'function', 'Should have close');
  assert.equal(typeof controller.flush, 'function', 'Should have flush');

  await controller.close();
});
