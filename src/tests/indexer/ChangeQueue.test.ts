/**
 * Unit tests for src/indexer/ChangeQueue.ts
 *
 * Tests queue batching and debouncing functionality including:
 * - Enqueue behavior for add/change/unlink events
 * - Debounce scheduling and timer management
 * - Flush race condition handling
 * - Drain behavior for shutdown
 * - Pending count tracking
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'timers/promises';

import { ChangeQueue, type ChangeQueueOptions } from '../../indexer/ChangeQueue.js';

// Mock updateIndex to avoid actual indexing during tests
// We'll inject a providerGetter that tracks calls

interface MockCallLog {
  changed: string[];
  deleted: string[];
}

function createMockOptions(
  overrides: Partial<ChangeQueueOptions> = {},
  callLog: MockCallLog[] = []
): ChangeQueueOptions {
  return {
    repoPath: '/mock/repo',
    provider: 'mock',
    debounceMs: 50, // Short debounce for tests
    logger: {
      log: () => {},
      error: () => {},
      warn: () => {},
      info: () => {},
      debug: () => {}
    } as unknown as Console,
    onBatch: ({ changed, deleted }) => {
      callLog.push({ changed, deleted });
    },
    providerGetter: async () => null, // No real provider
    ...overrides
  };
}

// ============================================================================
// Enqueue Tests
// ============================================================================

test('ChangeQueue enqueue adds file to pending changes', () => {
  const queue = new ChangeQueue(createMockOptions());

  queue.enqueue('add', 'src/test.ts');

  const pending = queue.getPendingCount();
  assert.equal(pending.changes, 1, 'Should have 1 pending change');
  assert.equal(pending.deletes, 0, 'Should have 0 pending deletes');

  queue.cancel();
});

test('ChangeQueue enqueue handles change event', () => {
  const queue = new ChangeQueue(createMockOptions());

  queue.enqueue('change', 'src/modified.ts');

  const pending = queue.getPendingCount();
  assert.equal(pending.changes, 1, 'Should have 1 pending change');

  queue.cancel();
});

test('ChangeQueue enqueue handles unlink event as delete', () => {
  const queue = new ChangeQueue(createMockOptions());

  queue.enqueue('unlink', 'src/deleted.ts');

  const pending = queue.getPendingCount();
  assert.equal(pending.changes, 0, 'Should have 0 pending changes');
  assert.equal(pending.deletes, 1, 'Should have 1 pending delete');

  queue.cancel();
});

test('ChangeQueue enqueue moves file from changes to deletes on unlink', () => {
  const queue = new ChangeQueue(createMockOptions());

  // First add the file
  queue.enqueue('add', 'src/file.ts');
  assert.equal(queue.getPendingCount().changes, 1, 'Should be in changes');

  // Then unlink it
  queue.enqueue('unlink', 'src/file.ts');

  const pending = queue.getPendingCount();
  assert.equal(pending.changes, 0, 'Should be removed from changes');
  assert.equal(pending.deletes, 1, 'Should be in deletes');

  queue.cancel();
});

test('ChangeQueue enqueue moves file from deletes to changes on add', () => {
  const queue = new ChangeQueue(createMockOptions());

  // First delete the file
  queue.enqueue('unlink', 'src/file.ts');
  assert.equal(queue.getPendingCount().deletes, 1, 'Should be in deletes');

  // Then re-add it
  queue.enqueue('add', 'src/file.ts');

  const pending = queue.getPendingCount();
  assert.equal(pending.changes, 1, 'Should be in changes');
  assert.equal(pending.deletes, 0, 'Should be removed from deletes');

  queue.cancel();
});

test('ChangeQueue enqueue deduplicates multiple changes to same file', () => {
  const queue = new ChangeQueue(createMockOptions());

  queue.enqueue('change', 'src/file.ts');
  queue.enqueue('change', 'src/file.ts');
  queue.enqueue('change', 'src/file.ts');

  const pending = queue.getPendingCount();
  assert.equal(pending.changes, 1, 'Should only have 1 pending change (deduplicated)');

  queue.cancel();
});

test('ChangeQueue enqueue handles multiple different files', () => {
  const queue = new ChangeQueue(createMockOptions());

  queue.enqueue('add', 'src/file1.ts');
  queue.enqueue('change', 'src/file2.ts');
  queue.enqueue('unlink', 'src/file3.ts');

  const pending = queue.getPendingCount();
  assert.equal(pending.changes, 2, 'Should have 2 pending changes');
  assert.equal(pending.deletes, 1, 'Should have 1 pending delete');

  queue.cancel();
});

// ============================================================================
// Debounce Tests
// ============================================================================

test('ChangeQueue schedules flush after debounce delay', async () => {
  const callLog: MockCallLog[] = [];
  const queue = new ChangeQueue(createMockOptions({ debounceMs: 30 }, callLog));

  queue.enqueue('add', 'src/test.ts');

  // Immediately after enqueue, batch should not be processed
  assert.equal(callLog.length, 0, 'Should not flush immediately');

  // Wait for debounce
  await delay(50);

  assert.equal(callLog.length, 1, 'Should flush after debounce');
  assert.deepEqual(callLog[0].changed, ['src/test.ts'], 'Should include changed file');

  queue.cancel();
});

test('ChangeQueue resets debounce timer on new enqueue', async () => {
  const callLog: MockCallLog[] = [];
  const queue = new ChangeQueue(createMockOptions({ debounceMs: 50 }, callLog));

  queue.enqueue('add', 'src/file1.ts');
  await delay(30); // Wait less than debounce

  queue.enqueue('add', 'src/file2.ts');
  await delay(30); // Still less than debounce from second enqueue

  // Should not have flushed yet
  assert.equal(callLog.length, 0, 'Should not flush - timer was reset');

  await delay(40); // Now past debounce from second enqueue

  assert.equal(callLog.length, 1, 'Should flush once');
  assert.equal(callLog[0].changed.length, 2, 'Should include both files');

  queue.cancel();
});

test('ChangeQueue batches rapid changes together', async () => {
  const callLog: MockCallLog[] = [];
  const queue = new ChangeQueue(createMockOptions({ debounceMs: 50 }, callLog));

  // Rapid succession of changes
  for (let i = 0; i < 10; i++) {
    queue.enqueue('add', `src/file${i}.ts`);
  }

  await delay(100);

  assert.equal(callLog.length, 1, 'Should batch all changes into single flush');
  assert.equal(callLog[0].changed.length, 10, 'Should include all 10 files');

  queue.cancel();
});

// ============================================================================
// Flush Tests
// ============================================================================

test('ChangeQueue flush processes pending changes', async () => {
  const callLog: MockCallLog[] = [];
  const queue = new ChangeQueue(createMockOptions({ debounceMs: 1000 }, callLog));

  queue.enqueue('add', 'src/test.ts');
  queue.enqueue('unlink', 'src/deleted.ts');

  // Manually flush without waiting for debounce
  await queue.flush();

  assert.equal(callLog.length, 1, 'Should flush');
  assert.deepEqual(callLog[0].changed, ['src/test.ts'], 'Should include changed file');
  assert.deepEqual(callLog[0].deleted, ['src/deleted.ts'], 'Should include deleted file');

  queue.cancel();
});

test('ChangeQueue flush returns immediately when no pending changes', async () => {
  const callLog: MockCallLog[] = [];
  const queue = new ChangeQueue(createMockOptions({}, callLog));

  await queue.flush();

  assert.equal(callLog.length, 0, 'Should not call onBatch when nothing pending');

  queue.cancel();
});

test('ChangeQueue flush clears pending changes after processing', async () => {
  const callLog: MockCallLog[] = [];
  const queue = new ChangeQueue(createMockOptions({ debounceMs: 1000 }, callLog));

  queue.enqueue('add', 'src/test.ts');
  await queue.flush();

  assert.equal(queue.hasPending(), false, 'Should have no pending changes after flush');
  assert.equal(queue.getPendingCount().changes, 0, 'Changes count should be 0');

  queue.cancel();
});

test('ChangeQueue flush handles concurrent flush calls safely', async () => {
  const callLog: MockCallLog[] = [];
  let flushCount = 0;

  const queue = new ChangeQueue(createMockOptions({
    debounceMs: 1000,
    onBatch: async ({ changed, deleted }) => {
      flushCount++;
      callLog.push({ changed, deleted });
      await delay(50); // Simulate slow processing
    }
  }, []));

  queue.enqueue('add', 'src/test.ts');

  // Start multiple concurrent flushes
  const flush1 = queue.flush();
  const flush2 = queue.flush();
  const flush3 = queue.flush();

  await Promise.all([flush1, flush2, flush3]);

  // Only one actual batch should have been processed
  assert.equal(flushCount, 1, 'Should only process once despite concurrent calls');

  queue.cancel();
});

test('ChangeQueue flush reschedules if new changes arrive during processing', async () => {
  const callLog: MockCallLog[] = [];

  const queue = new ChangeQueue(createMockOptions({
    debounceMs: 20,
    onBatch: async ({ changed, deleted }) => {
      callLog.push({ changed, deleted });
      await delay(50); // Slow processing
    }
  }, []));

  queue.enqueue('add', 'src/file1.ts');

  // Start flush
  const flushPromise = queue.flush();

  // While processing, add more changes
  await delay(10);
  queue.enqueue('add', 'src/file2.ts');

  await flushPromise;

  // Wait for rescheduled flush
  await delay(100);

  assert.ok(callLog.length >= 1, 'Should process at least initial batch');

  queue.cancel();
});

// ============================================================================
// Drain Tests
// ============================================================================

test('ChangeQueue drain flushes all pending changes', async () => {
  const callLog: MockCallLog[] = [];
  const queue = new ChangeQueue(createMockOptions({ debounceMs: 500 }, callLog));

  queue.enqueue('add', 'src/file1.ts');
  queue.enqueue('add', 'src/file2.ts');

  await queue.drain();

  assert.equal(callLog.length, 1, 'Should have flushed');
  assert.equal(callLog[0].changed.length, 2, 'Should include both files');
  assert.equal(queue.hasPending(), false, 'Should have no pending after drain');

  queue.cancel();
});

test('ChangeQueue drain cancels pending timer', async () => {
  const callLog: MockCallLog[] = [];
  const queue = new ChangeQueue(createMockOptions({ debounceMs: 500 }, callLog));

  queue.enqueue('add', 'src/test.ts');

  // Drain should process immediately without waiting for timer
  const start = Date.now();
  await queue.drain();
  const elapsed = Date.now() - start;

  assert.ok(elapsed < 300, 'Drain should complete quickly without waiting for full debounce');
  assert.equal(callLog.length, 1, 'Should have flushed');

  queue.cancel();
});

test('ChangeQueue drain handles empty queue', async () => {
  const callLog: MockCallLog[] = [];
  const queue = new ChangeQueue(createMockOptions({}, callLog));

  await queue.drain();

  assert.equal(callLog.length, 0, 'Should not call onBatch for empty queue');

  queue.cancel();
});

test('ChangeQueue drain waits for in-progress flush', async () => {
  let processingComplete = false;

  const queue = new ChangeQueue(createMockOptions({
    debounceMs: 10,
    onBatch: async () => {
      await delay(100);
      processingComplete = true;
    }
  }, []));

  queue.enqueue('add', 'src/test.ts');

  // Trigger debounce flush
  await delay(20);

  // Drain should wait for processing to complete
  await queue.drain();

  assert.equal(processingComplete, true, 'Drain should wait for processing');

  queue.cancel();
});

// ============================================================================
// Cancel Tests
// ============================================================================

test('ChangeQueue cancel stops pending timer', async () => {
  const callLog: MockCallLog[] = [];
  const queue = new ChangeQueue(createMockOptions({ debounceMs: 50 }, callLog));

  queue.enqueue('add', 'src/test.ts');

  // Cancel before debounce triggers
  queue.cancel();

  await delay(100);

  assert.equal(callLog.length, 0, 'Should not flush after cancel');
});

test('ChangeQueue cancel is idempotent', () => {
  const queue = new ChangeQueue(createMockOptions());

  // Multiple cancels should not throw
  queue.cancel();
  queue.cancel();
  queue.cancel();

  assert.ok(true, 'Multiple cancels should not throw');
});

test('ChangeQueue cancel does not clear pending changes', () => {
  const queue = new ChangeQueue(createMockOptions());

  queue.enqueue('add', 'src/test.ts');
  queue.cancel();

  assert.equal(queue.hasPending(), true, 'Pending changes should remain after cancel');

  queue.cancel();
});

// ============================================================================
// hasPending Tests
// ============================================================================

test('ChangeQueue hasPending returns false for empty queue', () => {
  const queue = new ChangeQueue(createMockOptions());

  assert.equal(queue.hasPending(), false, 'Empty queue should not have pending');

  queue.cancel();
});

test('ChangeQueue hasPending returns true when changes pending', () => {
  const queue = new ChangeQueue(createMockOptions());

  queue.enqueue('add', 'src/test.ts');

  assert.equal(queue.hasPending(), true, 'Should have pending after enqueue');

  queue.cancel();
});

test('ChangeQueue hasPending returns true when deletes pending', () => {
  const queue = new ChangeQueue(createMockOptions());

  queue.enqueue('unlink', 'src/test.ts');

  assert.equal(queue.hasPending(), true, 'Should have pending for deletes');

  queue.cancel();
});

// ============================================================================
// getPendingCount Tests
// ============================================================================

test('ChangeQueue getPendingCount returns accurate counts', () => {
  const queue = new ChangeQueue(createMockOptions());

  queue.enqueue('add', 'src/file1.ts');
  queue.enqueue('add', 'src/file2.ts');
  queue.enqueue('change', 'src/file3.ts');
  queue.enqueue('unlink', 'src/deleted1.ts');
  queue.enqueue('unlink', 'src/deleted2.ts');

  const count = queue.getPendingCount();

  assert.equal(count.changes, 3, 'Should count 3 changes');
  assert.equal(count.deletes, 2, 'Should count 2 deletes');

  queue.cancel();
});

test('ChangeQueue getPendingCount returns zeros for empty queue', () => {
  const queue = new ChangeQueue(createMockOptions());

  const count = queue.getPendingCount();

  assert.equal(count.changes, 0, 'Changes should be 0');
  assert.equal(count.deletes, 0, 'Deletes should be 0');

  queue.cancel();
});

// ============================================================================
// Error Handling Tests
// ============================================================================

test('ChangeQueue handles onBatch errors gracefully', async () => {
  let errorLogged = false;

  const queue = new ChangeQueue({
    repoPath: '/mock/repo',
    provider: 'mock',
    debounceMs: 10,
    logger: {
      log: () => {},
      error: () => { errorLogged = true; },
      warn: () => {},
      info: () => {},
      debug: () => {}
    } as unknown as Console,
    onBatch: () => {
      throw new Error('Simulated error');
    }
  });

  queue.enqueue('add', 'src/test.ts');
  await queue.flush();

  assert.equal(errorLogged, true, 'Error should be logged');
  assert.equal(queue.hasPending(), false, 'Queue should be cleared despite error');

  queue.cancel();
});

test('ChangeQueue handles providerGetter errors gracefully', async () => {
  let errorLogged = false;

  const queue = new ChangeQueue({
    repoPath: '/mock/repo',
    provider: 'mock',
    debounceMs: 10,
    logger: {
      log: () => {},
      error: () => { errorLogged = true; },
      warn: () => {},
      info: () => {},
      debug: () => {}
    } as unknown as Console,
    providerGetter: async () => {
      throw new Error('Provider error');
    }
  });

  queue.enqueue('add', 'src/test.ts');

  // This will fail during updateIndex due to providerGetter error
  // but should handle gracefully
  await queue.flush();

  queue.cancel();
});

// ============================================================================
// Logging Tests
// ============================================================================

test('ChangeQueue logs batch info when no onBatch callback', async () => {
  let logMessage = '';

  const queue = new ChangeQueue({
    repoPath: '/mock/repo',
    provider: 'mock',
    debounceMs: 10,
    logger: {
      log: (msg: string) => { logMessage = msg; },
      error: () => {},
      warn: () => {},
      info: () => {},
      debug: () => {}
    } as unknown as Console,
    onBatch: null,
    providerGetter: async () => null
  });

  queue.enqueue('add', 'src/test.ts');
  await queue.flush();

  assert.ok(logMessage.includes('indexed'), 'Should log indexing message');
  assert.ok(logMessage.includes('1'), 'Should include count');

  queue.cancel();
});

// ============================================================================
// Edge Cases
// ============================================================================

test('ChangeQueue handles very short debounce', async () => {
  const callLog: MockCallLog[] = [];
  const queue = new ChangeQueue(createMockOptions({ debounceMs: 1 }, callLog));

  queue.enqueue('add', 'src/test.ts');

  await delay(50);

  assert.ok(callLog.length >= 1, 'Should flush with very short debounce');

  queue.cancel();
});

test('ChangeQueue handles files with special characters', async () => {
  const callLog: MockCallLog[] = [];
  const queue = new ChangeQueue(createMockOptions({ debounceMs: 10 }, callLog));

  queue.enqueue('add', 'src/file with spaces.ts');
  queue.enqueue('add', 'src/\u4E2D\u6587.ts');
  queue.enqueue('add', 'src/special@#$.ts');

  await queue.flush();

  assert.equal(callLog.length, 1, 'Should handle special characters');
  assert.equal(callLog[0].changed.length, 3, 'Should include all files');

  queue.cancel();
});

test('ChangeQueue handles large number of files', () => {
  const queue = new ChangeQueue(createMockOptions());

  for (let i = 0; i < 1000; i++) {
    queue.enqueue('add', `src/file${i}.ts`);
  }

  const count = queue.getPendingCount();
  assert.equal(count.changes, 1000, 'Should handle 1000 files');

  queue.cancel();
});
