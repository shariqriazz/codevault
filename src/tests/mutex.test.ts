import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'timers/promises';
import { Mutex, MutexTimeoutError, Semaphore } from '../utils/mutex.js';

// ============================================================================
// MutexTimeoutError Tests
// ============================================================================

test('MutexTimeoutError has correct message', () => {
  const error = new MutexTimeoutError(5000);
  assert.equal(error.message, 'Mutex acquire timed out after 5000ms');
  assert.equal(error.name, 'MutexTimeoutError');
  assert.ok(error instanceof Error);
  assert.ok(error instanceof MutexTimeoutError);
});

// ============================================================================
// Mutex Basic Tests
// ============================================================================

test('Mutex is initially unlocked', () => {
  const mutex = new Mutex();
  assert.equal(mutex.isLocked(), false);
});

test('Mutex acquire locks the mutex', async () => {
  const mutex = new Mutex();
  await mutex.acquire();
  assert.equal(mutex.isLocked(), true);
});

test('Mutex release unlocks the mutex', async () => {
  const mutex = new Mutex();
  await mutex.acquire();
  mutex.release();
  assert.equal(mutex.isLocked(), false);
});

test('Mutex acquire waits when already locked', async () => {
  const mutex = new Mutex();
  const order: number[] = [];

  await mutex.acquire();
  order.push(1);

  const waitingAcquire = (async (): Promise<void> => {
    await mutex.acquire();
    order.push(3);
    mutex.release();
  })();

  // Small delay to ensure the waiting acquire is queued
  await delay(10);
  order.push(2);
  mutex.release();

  await waitingAcquire;
  assert.deepEqual(order, [1, 2, 3]);
});

test('Mutex multiple waiters are processed in order', async () => {
  const mutex = new Mutex();
  const order: number[] = [];

  await mutex.acquire();

  const waiter1 = (async (): Promise<void> => {
    await mutex.acquire();
    order.push(1);
    mutex.release();
  })();

  const waiter2 = (async (): Promise<void> => {
    await delay(5); // Ensure waiter1 is queued first
    await mutex.acquire();
    order.push(2);
    mutex.release();
  })();

  const waiter3 = (async (): Promise<void> => {
    await delay(10); // Ensure waiter2 is queued second
    await mutex.acquire();
    order.push(3);
    mutex.release();
  })();

  await delay(20); // Allow all waiters to queue
  mutex.release(); // Release initial lock

  await Promise.all([waiter1, waiter2, waiter3]);
  assert.deepEqual(order, [1, 2, 3]);
});

// ============================================================================
// Mutex Timeout Tests
// ============================================================================

test('Mutex acquire with timeout succeeds when available', async () => {
  const mutex = new Mutex();
  await mutex.acquire(1000);
  assert.equal(mutex.isLocked(), true);
  mutex.release();
});

test('Mutex acquire throws MutexTimeoutError on timeout', async () => {
  const mutex = new Mutex();
  await mutex.acquire();

  await assert.rejects(
    mutex.acquire(50),
    (error: unknown) => {
      return error instanceof MutexTimeoutError &&
             error.message === 'Mutex acquire timed out after 50ms';
    }
  );

  mutex.release();
});

test('Mutex timeout removes waiter from queue', async () => {
  const mutex = new Mutex();
  await mutex.acquire();

  assert.equal(mutex.getQueueLength(), 0);

  // Start a waiter that will timeout
  const timeoutPromise = mutex.acquire(20);

  // Wait a bit for the waiter to be queued
  await delay(5);
  assert.equal(mutex.getQueueLength(), 1);

  // Wait for timeout
  await assert.rejects(timeoutPromise, MutexTimeoutError);

  // Queue should be empty after timeout
  assert.equal(mutex.getQueueLength(), 0);

  mutex.release();
});

test('Mutex timeout does not affect subsequent acquires', async () => {
  const mutex = new Mutex();
  await mutex.acquire();

  // First acquire times out
  const timeout1 = mutex.acquire(20);
  await assert.rejects(timeout1, MutexTimeoutError);

  // Second acquire should still work once released
  const acquire2 = mutex.acquire();
  mutex.release();
  await acquire2;
  assert.equal(mutex.isLocked(), true);
  mutex.release();
});

test('Mutex acquire clears timeout on successful acquire', async () => {
  const mutex = new Mutex();
  const order: string[] = [];

  await mutex.acquire();

  const waiter = (async (): Promise<void> => {
    await mutex.acquire(1000); // Long timeout
    order.push('acquired');
    mutex.release();
  })();

  await delay(10);
  order.push('releasing');
  mutex.release();

  await waiter;
  assert.deepEqual(order, ['releasing', 'acquired']);
});

test('Mutex acquire with zero timeout does not timeout', async () => {
  const mutex = new Mutex();
  await mutex.acquire();

  // timeout = 0 should not set up a timeout
  const acquirePromise = mutex.acquire(0);

  await delay(50);
  mutex.release();

  await acquirePromise;
  assert.equal(mutex.isLocked(), true);
  mutex.release();
});

test('Mutex acquire with negative timeout does not timeout', async () => {
  const mutex = new Mutex();
  await mutex.acquire();

  // timeout = -1 should not set up a timeout
  const acquirePromise = mutex.acquire(-1);

  await delay(50);
  mutex.release();

  await acquirePromise;
  assert.equal(mutex.isLocked(), true);
  mutex.release();
});

// ============================================================================
// Mutex runExclusive Tests
// ============================================================================

test('Mutex runExclusive acquires and releases automatically', async () => {
  const mutex = new Mutex();

  const result = await mutex.runExclusive(async () => {
    assert.equal(mutex.isLocked(), true);
    return 42;
  });

  assert.equal(result, 42);
  assert.equal(mutex.isLocked(), false);
});

test('Mutex runExclusive releases on error', async () => {
  const mutex = new Mutex();

  await assert.rejects(
    mutex.runExclusive(async () => {
      throw new Error('Function error');
    }),
    { message: 'Function error' }
  );

  assert.equal(mutex.isLocked(), false);
});

test('Mutex runExclusive serializes concurrent calls', async () => {
  const mutex = new Mutex();
  const order: number[] = [];

  const results = await Promise.all([
    mutex.runExclusive(async () => {
      order.push(1);
      await delay(30);
      order.push(2);
      return 'first';
    }),
    mutex.runExclusive(async () => {
      order.push(3);
      await delay(10);
      order.push(4);
      return 'second';
    }),
  ]);

  assert.deepEqual(order, [1, 2, 3, 4]);
  assert.deepEqual(results, ['first', 'second']);
});

test('Mutex runExclusive returns correct value type', async () => {
  const mutex = new Mutex();

  const numResult = await mutex.runExclusive(async () => 42);
  const strResult = await mutex.runExclusive(async () => 'hello');
  const objResult = await mutex.runExclusive(async () => ({ key: 'value' }));

  assert.equal(numResult, 42);
  assert.equal(strResult, 'hello');
  assert.deepEqual(objResult, { key: 'value' });
});

// ============================================================================
// Mutex Queue Length Tests
// ============================================================================

test('Mutex getQueueLength returns 0 when no waiters', () => {
  const mutex = new Mutex();
  assert.equal(mutex.getQueueLength(), 0);
});

test('Mutex getQueueLength tracks waiting acquires', async () => {
  const mutex = new Mutex();
  await mutex.acquire();

  const waiter1 = mutex.acquire();
  await delay(5);
  assert.equal(mutex.getQueueLength(), 1);

  const waiter2 = mutex.acquire();
  await delay(5);
  assert.equal(mutex.getQueueLength(), 2);

  mutex.release();
  await delay(5);
  assert.equal(mutex.getQueueLength(), 1);

  mutex.release();
  await waiter1;
  await waiter2;
  assert.equal(mutex.getQueueLength(), 0);
});

// ============================================================================
// Mutex Edge Cases
// ============================================================================

test('Mutex release when not locked has no effect', () => {
  const mutex = new Mutex();
  mutex.release();
  assert.equal(mutex.isLocked(), false);
});

test('Mutex double release after single acquire', async () => {
  const mutex = new Mutex();
  await mutex.acquire();
  mutex.release();
  mutex.release(); // Should not throw
  assert.equal(mutex.isLocked(), false);
});

test('Mutex handles rapid acquire/release cycles', async () => {
  const mutex = new Mutex();

  for (let i = 0; i < 100; i++) {
    await mutex.acquire();
    assert.equal(mutex.isLocked(), true);
    mutex.release();
    assert.equal(mutex.isLocked(), false);
  }
});

// ============================================================================
// Semaphore Basic Tests
// ============================================================================

test('Semaphore is initialized with correct permits', () => {
  const sem = new Semaphore(3);
  assert.equal(sem.getAvailablePermits(), 3);
  assert.equal(sem.getQueueLength(), 0);
});

test('Semaphore acquire decrements permits', async () => {
  const sem = new Semaphore(3);

  await sem.acquire();
  assert.equal(sem.getAvailablePermits(), 2);

  await sem.acquire();
  assert.equal(sem.getAvailablePermits(), 1);

  await sem.acquire();
  assert.equal(sem.getAvailablePermits(), 0);
});

test('Semaphore release increments permits', async () => {
  const sem = new Semaphore(3);

  await sem.acquire();
  await sem.acquire();
  assert.equal(sem.getAvailablePermits(), 1);

  sem.release();
  assert.equal(sem.getAvailablePermits(), 2);

  sem.release();
  assert.equal(sem.getAvailablePermits(), 3);
});

test('Semaphore acquire waits when no permits available', async () => {
  const sem = new Semaphore(1);
  const order: number[] = [];

  await sem.acquire();
  order.push(1);

  const waitingAcquire = (async (): Promise<void> => {
    await sem.acquire();
    order.push(3);
    sem.release();
  })();

  await delay(10);
  order.push(2);
  sem.release();

  await waitingAcquire;
  assert.deepEqual(order, [1, 2, 3]);
});

// ============================================================================
// Semaphore Concurrency Tests
// ============================================================================

test('Semaphore allows multiple concurrent acquires up to limit', async () => {
  const sem = new Semaphore(3);
  let concurrent = 0;
  let maxConcurrent = 0;

  const task = async (): Promise<void> => {
    await sem.acquire();
    concurrent++;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await delay(50);
    concurrent--;
    sem.release();
  };

  // Start 5 tasks, but only 3 should run concurrently
  await Promise.all([
    task(), task(), task(), task(), task()
  ]);

  assert.equal(maxConcurrent, 3);
  assert.equal(concurrent, 0);
});

test('Semaphore processes queue in order', async () => {
  const sem = new Semaphore(1);
  const order: number[] = [];

  await sem.acquire();

  const waiter1 = (async (): Promise<void> => {
    await sem.acquire();
    order.push(1);
    sem.release();
  })();

  await delay(5);
  const waiter2 = (async (): Promise<void> => {
    await sem.acquire();
    order.push(2);
    sem.release();
  })();

  await delay(5);
  const waiter3 = (async (): Promise<void> => {
    await sem.acquire();
    order.push(3);
    sem.release();
  })();

  await delay(10);
  sem.release();

  await Promise.all([waiter1, waiter2, waiter3]);
  assert.deepEqual(order, [1, 2, 3]);
});

// ============================================================================
// Semaphore runExclusive Tests
// ============================================================================

test('Semaphore runExclusive acquires and releases automatically', async () => {
  const sem = new Semaphore(2);

  const result = await sem.runExclusive(async () => {
    assert.equal(sem.getAvailablePermits(), 1);
    return 'result';
  });

  assert.equal(result, 'result');
  assert.equal(sem.getAvailablePermits(), 2);
});

test('Semaphore runExclusive releases on error', async () => {
  const sem = new Semaphore(1);

  await assert.rejects(
    sem.runExclusive(async () => {
      throw new Error('Task error');
    }),
    { message: 'Task error' }
  );

  assert.equal(sem.getAvailablePermits(), 1);
});

test('Semaphore runExclusive allows parallel execution up to limit', async () => {
  const sem = new Semaphore(2);
  let concurrent = 0;
  let maxConcurrent = 0;

  const task = async (): Promise<number> => {
    return sem.runExclusive(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await delay(30);
      concurrent--;
      return maxConcurrent;
    });
  };

  await Promise.all([task(), task(), task(), task()]);

  assert.equal(maxConcurrent, 2);
  assert.equal(concurrent, 0);
});

// ============================================================================
// Semaphore Edge Cases
// ============================================================================

test('Semaphore release does not exceed max permits', async () => {
  const sem = new Semaphore(2);

  sem.release(); // Extra release
  sem.release(); // Extra release
  sem.release(); // Extra release

  // Should still be capped at maxPermits
  assert.equal(sem.getAvailablePermits(), 2);
});

test('Semaphore with single permit acts like mutex', async () => {
  const sem = new Semaphore(1);
  const order: number[] = [];

  const results = await Promise.all([
    sem.runExclusive(async () => {
      order.push(1);
      await delay(20);
      order.push(2);
      return 'first';
    }),
    sem.runExclusive(async () => {
      order.push(3);
      await delay(10);
      order.push(4);
      return 'second';
    }),
  ]);

  assert.deepEqual(order, [1, 2, 3, 4]);
  assert.deepEqual(results, ['first', 'second']);
});

test('Semaphore getQueueLength reflects waiting tasks', async () => {
  const sem = new Semaphore(1);
  await sem.acquire();

  const waiter1 = sem.acquire();
  await delay(5);
  assert.equal(sem.getQueueLength(), 1);

  const waiter2 = sem.acquire();
  await delay(5);
  assert.equal(sem.getQueueLength(), 2);

  sem.release();
  await delay(5);
  sem.release();

  await waiter1;
  await waiter2;
  assert.equal(sem.getQueueLength(), 0);
});

test('Semaphore handles rapid acquire/release cycles', async () => {
  const sem = new Semaphore(3);

  for (let i = 0; i < 50; i++) {
    await sem.acquire();
    sem.release();
  }

  assert.equal(sem.getAvailablePermits(), 3);
});

test('Semaphore with zero permits blocks all acquires', async () => {
  const sem = new Semaphore(1);
  await sem.acquire(); // Now 0 permits

  let acquired = false;
  const acquire = (async (): Promise<void> => {
    await sem.acquire();
    acquired = true;
    sem.release();
  })();

  await delay(30);
  assert.equal(acquired, false);

  sem.release();
  await acquire;
  assert.equal(acquired, true);
});

// ============================================================================
// Integration Tests
// ============================================================================

test('Mutex protects shared state correctly', async () => {
  const mutex = new Mutex();
  let counter = 0;

  const increment = async (): Promise<void> => {
    await mutex.runExclusive(async () => {
      const current = counter;
      await delay(Math.random() * 10);
      counter = current + 1;
    });
  };

  // Run 10 concurrent increments
  await Promise.all(Array(10).fill(null).map(() => increment()));

  assert.equal(counter, 10);
});

test('Semaphore limits concurrent operations', async () => {
  const sem = new Semaphore(3);
  const activeTasks: number[] = [];
  const completedTasks: number[] = [];

  const task = async (id: number): Promise<void> => {
    await sem.runExclusive(async () => {
      activeTasks.push(id);
      assert.ok(activeTasks.length <= 3, `Too many concurrent tasks: ${activeTasks.length}`);
      await delay(20 + Math.random() * 20);
      activeTasks.splice(activeTasks.indexOf(id), 1);
      completedTasks.push(id);
    });
  };

  await Promise.all([
    task(1), task(2), task(3), task(4), task(5),
    task(6), task(7), task(8), task(9), task(10)
  ]);

  assert.equal(completedTasks.length, 10);
  assert.equal(activeTasks.length, 0);
});
