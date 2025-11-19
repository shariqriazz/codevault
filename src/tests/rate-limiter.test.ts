import test from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter } from '../utils/rate-limiter.js';

test('RateLimiter executes tasks under default limits', async () => {
  const limiter = new RateLimiter(1000, null, 10);
  const result = await limiter.execute(() => Promise.resolve('ok'));
  assert.equal(result, 'ok');
  const stats = limiter.getStats();
  assert.ok(stats.requestsInLastMinute >= 0);
});
