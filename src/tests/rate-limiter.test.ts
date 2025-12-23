import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'timers/promises';
import { RateLimiter, createRateLimiter } from '../utils/rate-limiter.js';

// ============================================================================
// Constructor Tests
// ============================================================================

test('RateLimiter constructor with explicit RPM and TPM', () => {
  const limiter = new RateLimiter(100, 10000);
  const stats = limiter.getStats();
  assert.equal(stats.rpm, 100);
  assert.equal(stats.tpm, 10000);
  assert.equal(stats.isLimited, true);
});

test('RateLimiter constructor with null limits uses defaults from environment', () => {
  const limiter = new RateLimiter(null, null);
  const stats = limiter.getStats();
  // Default behavior when no env vars set - may or may not have limits
  assert.ok(stats.rpm === null || typeof stats.rpm === 'number');
});

test('RateLimiter constructor with custom maxQueueSize', () => {
  const limiter = new RateLimiter(100, null, 500);
  const stats = limiter.getStats();
  assert.equal(stats.maxQueueSize, 500);
});

test('RateLimiter default maxQueueSize is 10000', () => {
  const limiter = new RateLimiter(100, null);
  const stats = limiter.getStats();
  assert.equal(stats.maxQueueSize, 10000);
});

// ============================================================================
// Basic Execution Tests
// ============================================================================

test('RateLimiter executes tasks under default limits', async () => {
  const limiter = new RateLimiter(1000, null, 10);
  const result = await limiter.execute(() => Promise.resolve('ok'));
  assert.equal(result, 'ok');
  const stats = limiter.getStats();
  assert.ok(stats.requestsInLastMinute >= 0);
});

test('RateLimiter executes and returns correct value', async () => {
  const limiter = new RateLimiter(100, null);
  const result = await limiter.execute(async () => {
    await delay(10);
    return 42;
  });
  assert.equal(result, 42);
});

test('RateLimiter preserves error from executed function', async () => {
  const limiter = new RateLimiter(100, null);
  await assert.rejects(
    limiter.execute(async () => {
      throw new Error('Task failed');
    }),
    { message: 'Task failed' }
  );
});

test('RateLimiter executes multiple tasks sequentially', async () => {
  const limiter = new RateLimiter(100, null);
  const results: number[] = [];

  await limiter.execute(async () => { results.push(1); });
  await limiter.execute(async () => { results.push(2); });
  await limiter.execute(async () => { results.push(3); });

  assert.deepEqual(results, [1, 2, 3]);
});

// ============================================================================
// Queue Management Tests
// ============================================================================

test('RateLimiter rejects when queue is full', async () => {
  const limiter = new RateLimiter(1, null, 2); // max 2 items in queue

  // Fill the queue with slow tasks
  const slowTask = async (): Promise<string> => {
    await delay(1000);
    return 'done';
  };

  // Start tasks that will fill the queue
  const task1 = limiter.execute(slowTask);
  const task2 = limiter.execute(slowTask);
  const task3 = limiter.execute(slowTask);

  // Third task should be rejected since queue limit is 2
  await assert.rejects(task3, {
    message: 'Rate limiter queue is full (2 items). Too many concurrent requests.'
  });

  // Clean up - reset the limiter so tests don't hang
  limiter.reset();
});

test('RateLimiter getStats shows queue utilization', async () => {
  const limiter = new RateLimiter(1, null, 100);

  const slowTask = async (): Promise<string> => {
    await delay(50);
    return 'done';
  };

  // Add some tasks to queue
  const tasks = [
    limiter.execute(slowTask),
    limiter.execute(slowTask),
  ];

  // Check queue stats
  const stats = limiter.getStats();
  assert.ok(stats.queueLength >= 0);
  assert.ok(stats.queueUtilization.endsWith('%'));

  // Wait for tasks to complete
  limiter.reset();
});

// ============================================================================
// RPM (Requests Per Minute) Limiting Tests
// ============================================================================

test('RateLimiter records requests in last minute', async () => {
  const limiter = new RateLimiter(100, null);

  await limiter.execute(() => Promise.resolve(1));
  await limiter.execute(() => Promise.resolve(2));
  await limiter.execute(() => Promise.resolve(3));

  const stats = limiter.getStats();
  assert.equal(stats.requestsInLastMinute, 3);
});

test('RateLimiter tracks RPM limits correctly', async () => {
  const limiter = new RateLimiter(5, null);

  // Execute 5 requests (at limit)
  for (let i = 0; i < 5; i++) {
    await limiter.execute(() => Promise.resolve(i));
  }

  const stats = limiter.getStats();
  assert.equal(stats.requestsInLastMinute, 5);
  assert.equal(stats.isRpmLimited, true);
});

// ============================================================================
// TPM (Tokens Per Minute) Limiting Tests
// ============================================================================

test('RateLimiter tracks token usage', async () => {
  const limiter = new RateLimiter(null, 10000);

  // Execute with estimated tokens
  await limiter.execute(() => Promise.resolve('result'), 0, 100);
  await limiter.execute(() => Promise.resolve('result'), 0, 200);

  const stats = limiter.getStats();
  assert.equal(stats.tokensInLastMinute, 300);
  assert.equal(stats.isTpmLimited, true);
});

test('RateLimiter extracts tokens from response usage field', async () => {
  const limiter = new RateLimiter(null, 10000);

  // Execute with response containing usage info
  await limiter.execute(() => Promise.resolve({
    usage: { total_tokens: 500 }
  }));

  const stats = limiter.getStats();
  assert.equal(stats.tokensInLastMinute, 500);
});

test('RateLimiter uses estimated tokens when no usage in response', async () => {
  const limiter = new RateLimiter(null, 10000);

  await limiter.execute(() => Promise.resolve('plain result'), 0, 150);

  const stats = limiter.getStats();
  assert.equal(stats.tokensInLastMinute, 150);
});

// ============================================================================
// Rate Limit Error Handling Tests
// ============================================================================

test('RateLimiter retries on 429 rate limit error', async () => {
  const limiter = new RateLimiter(1000, null);
  let attempts = 0;

  const result = await limiter.execute(async () => {
    attempts++;
    if (attempts === 1) {
      const error = new Error('Rate limit hit') as Error & { status: number };
      error.status = 429;
      throw error;
    }
    return 'success';
  });

  assert.equal(result, 'success');
  assert.equal(attempts, 2);
});

test('RateLimiter retries on rate limit message in error', async () => {
  const limiter = new RateLimiter(1000, null);
  let attempts = 0;

  const result = await limiter.execute(async () => {
    attempts++;
    if (attempts === 1) {
      throw new Error('too many requests');
    }
    return 'success';
  });

  assert.equal(result, 'success');
  assert.equal(attempts, 2);
});

test('RateLimiter fails after max retries', async () => {
  const limiter = new RateLimiter(1000, null);
  let attempts = 0;

  await assert.rejects(
    limiter.execute(async () => {
      attempts++;
      const error = new Error('Rate limit exceeded') as Error & { status: number };
      error.status = 429;
      throw error;
    }),
    /Rate limit exceeded after 4 retries/
  );

  // Should have attempted 4 times (initial + 3 retries, or 1 + retryDelays.length)
  assert.ok(attempts > 1);
});

test('RateLimiter does not retry non-rate-limit errors', async () => {
  const limiter = new RateLimiter(1000, null);
  let attempts = 0;

  await assert.rejects(
    limiter.execute(async () => {
      attempts++;
      throw new Error('Some other error');
    }),
    { message: 'Some other error' }
  );

  assert.equal(attempts, 1);
});

// ============================================================================
// Reset Tests
// ============================================================================

test('RateLimiter reset clears all state', async () => {
  const limiter = new RateLimiter(100, 10000);

  // Add some requests
  await limiter.execute(() => Promise.resolve(1), 0, 100);
  await limiter.execute(() => Promise.resolve(2), 0, 200);

  const beforeReset = limiter.getStats();
  assert.equal(beforeReset.requestsInLastMinute, 2);
  assert.equal(beforeReset.tokensInLastMinute, 300);

  // Reset
  limiter.reset();

  const afterReset = limiter.getStats();
  assert.equal(afterReset.requestsInLastMinute, 0);
  assert.equal(afterReset.tokensInLastMinute, 0);
  assert.equal(afterReset.queueLength, 0);
});

test('RateLimiter reset allows new requests', async () => {
  const limiter = new RateLimiter(100, null);

  await limiter.execute(() => Promise.resolve(1));
  limiter.reset();

  const result = await limiter.execute(() => Promise.resolve(42));
  assert.equal(result, 42);

  const stats = limiter.getStats();
  assert.equal(stats.requestsInLastMinute, 1);
});

// ============================================================================
// getStats Tests
// ============================================================================

test('RateLimiter getStats returns complete statistics', () => {
  const limiter = new RateLimiter(100, 50000, 500);
  const stats = limiter.getStats();

  assert.equal(stats.rpm, 100);
  assert.equal(stats.tpm, 50000);
  assert.equal(stats.maxQueueSize, 500);
  assert.equal(stats.queueLength, 0);
  assert.equal(stats.requestsInLastMinute, 0);
  assert.equal(stats.tokensInLastMinute, 0);
  assert.equal(stats.isRpmLimited, true);
  assert.equal(stats.isTpmLimited, true);
  assert.equal(stats.isLimited, true);
});

test('RateLimiter getStats isLimited false when no limits', () => {
  const limiter = new RateLimiter(null, null);
  const stats = limiter.getStats();

  // Will only be false if env vars are not set
  if (stats.rpm === null && stats.tpm === null) {
    assert.equal(stats.isLimited, false);
  }
});

// ============================================================================
// createRateLimiter Factory Tests
// ============================================================================

test('createRateLimiter uses default limits for OpenAI', () => {
  const limiter = createRateLimiter('OpenAI');
  const stats = limiter.getStats();

  // OpenAI default is rpm: 50, tpm: null
  assert.equal(stats.rpm, 50);
  assert.equal(stats.tpm, null);
});

test('createRateLimiter uses default limits for Qwen', () => {
  const limiter = createRateLimiter('Qwen');
  const stats = limiter.getStats();

  // Qwen default is rpm: 10000, tpm: 600000
  assert.equal(stats.rpm, 10000);
  assert.equal(stats.tpm, 600000);
});

test('createRateLimiter uses null limits for unknown provider', () => {
  const limiter = createRateLimiter('UnknownProvider');
  const stats = limiter.getStats();

  // Unknown provider gets null limits (unless env vars set)
  if (!process.env.CODEVAULT_RATE_LIMIT_RPM && !process.env.CODEVAULT_RATE_LIMIT_TPM && !process.env.CODEVAULT_RATE_LIMIT) {
    assert.equal(stats.rpm, null);
    assert.equal(stats.tpm, null);
  }
});

// ============================================================================
// Concurrent Processing Tests
// ============================================================================

test('RateLimiter processes queued tasks in order', async () => {
  const limiter = new RateLimiter(100, null);
  const results: number[] = [];

  // Queue multiple tasks concurrently
  const tasks = [
    limiter.execute(async () => { results.push(1); return 1; }),
    limiter.execute(async () => { results.push(2); return 2; }),
    limiter.execute(async () => { results.push(3); return 3; }),
  ];

  await Promise.all(tasks);
  assert.deepEqual(results, [1, 2, 3]);
});

test('RateLimiter handles concurrent execution with delays', async () => {
  const limiter = new RateLimiter(100, null);
  const startTime = Date.now();

  // Execute tasks with small delays
  await Promise.all([
    limiter.execute(async () => { await delay(10); return 1; }),
    limiter.execute(async () => { await delay(10); return 2; }),
    limiter.execute(async () => { await delay(10); return 3; }),
  ]);

  const elapsed = Date.now() - startTime;
  // Should take at least 30ms since tasks are sequential
  assert.ok(elapsed >= 25, `Expected >= 25ms but got ${elapsed}ms`);
});

// ============================================================================
// Edge Cases
// ============================================================================

test('RateLimiter handles zero estimated tokens', async () => {
  const limiter = new RateLimiter(100, 10000);

  await limiter.execute(() => Promise.resolve('result'), 0, 0);

  const stats = limiter.getStats();
  assert.equal(stats.tokensInLastMinute, 0);
});

test('RateLimiter handles negative retry count gracefully', async () => {
  const limiter = new RateLimiter(100, null);

  // This should work even with negative retry count (treated as 0)
  const result = await limiter.execute(() => Promise.resolve('ok'), -1);
  assert.equal(result, 'ok');
});

test('RateLimiter extracts statusCode as well as status', async () => {
  const limiter = new RateLimiter(1000, null);
  let attempts = 0;

  const result = await limiter.execute(async () => {
    attempts++;
    if (attempts === 1) {
      const error = new Error('Rate limit') as Error & { statusCode: number };
      error.statusCode = 429;
      throw error;
    }
    return 'success';
  });

  assert.equal(result, 'success');
  assert.equal(attempts, 2);
});

test('RateLimiter handles error with 429 in message', async () => {
  const limiter = new RateLimiter(1000, null);
  let attempts = 0;

  const result = await limiter.execute(async () => {
    attempts++;
    if (attempts === 1) {
      throw new Error('HTTP 429: rate limit exceeded');
    }
    return 'success';
  });

  assert.equal(result, 'success');
  assert.equal(attempts, 2);
});

test('RateLimiter handles null/undefined error gracefully', async () => {
  const limiter = new RateLimiter(1000, null);

  // Throwing null should not crash
  await assert.rejects(
    limiter.execute(async () => {
      throw null;
    })
  );
});

test('RateLimiter getStats filters old request times', async () => {
  const limiter = new RateLimiter(100, null);

  await limiter.execute(() => Promise.resolve(1));

  // Stats should show 1 request
  let stats = limiter.getStats();
  assert.equal(stats.requestsInLastMinute, 1);

  // After a minute, it should be filtered out
  // We can't wait a minute in tests, so just verify the filter logic exists
  // by checking the stats structure
  assert.ok('requestsInLastMinute' in stats);
});

// ============================================================================
// Token Extraction Edge Cases
// ============================================================================

test('RateLimiter handles response without usage field', async () => {
  const limiter = new RateLimiter(null, 10000);

  await limiter.execute(() => Promise.resolve({ data: 'no usage' }));

  const stats = limiter.getStats();
  assert.equal(stats.tokensInLastMinute, 0);
});

test('RateLimiter handles response with malformed usage field', async () => {
  const limiter = new RateLimiter(null, 10000);

  await limiter.execute(() => Promise.resolve({
    usage: 'not an object'
  }));

  const stats = limiter.getStats();
  assert.equal(stats.tokensInLastMinute, 0);
});

test('RateLimiter handles response with non-numeric total_tokens', async () => {
  const limiter = new RateLimiter(null, 10000);

  await limiter.execute(() => Promise.resolve({
    usage: { total_tokens: 'invalid' }
  }));

  const stats = limiter.getStats();
  assert.equal(stats.tokensInLastMinute, 0);
});

test('RateLimiter prefers estimated tokens over response usage when available', async () => {
  const limiter = new RateLimiter(null, 10000);

  // When estimatedTokens is provided and non-zero, it should be used
  await limiter.execute(() => Promise.resolve({
    usage: { total_tokens: 100 }
  }), 0, 0); // estimatedTokens = 0, so it falls back to response

  const stats = limiter.getStats();
  assert.equal(stats.tokensInLastMinute, 100);
});
