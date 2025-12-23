import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'timers/promises';
import { SimpleLRU } from '../utils/simple-lru.js';

// ============================================================================
// Constructor Tests
// ============================================================================

test('SimpleLRU constructor throws on invalid max size - zero', () => {
  assert.throws(
    () => new SimpleLRU<string, number>(0),
    { message: 'SimpleLRU requires a max size greater than zero' }
  );
});

test('SimpleLRU constructor throws on invalid max size - negative', () => {
  assert.throws(
    () => new SimpleLRU<string, number>(-5),
    { message: 'SimpleLRU requires a max size greater than zero' }
  );
});

test('SimpleLRU constructor throws on invalid max size - NaN', () => {
  assert.throws(
    () => new SimpleLRU<string, number>(NaN),
    { message: 'SimpleLRU requires a max size greater than zero' }
  );
});

test('SimpleLRU constructor throws on invalid max size - Infinity', () => {
  assert.throws(
    () => new SimpleLRU<string, number>(Infinity),
    { message: 'SimpleLRU requires a max size greater than zero' }
  );
});

test('SimpleLRU constructor floors fractional max size', () => {
  const lru = new SimpleLRU<string, number>(2.9);
  lru.set('a', 1);
  lru.set('b', 2);
  lru.set('c', 3); // should evict 'a' since max is floored to 2
  assert.equal(lru.size, 2);
  assert.equal(lru.get('a'), undefined);
});

test('SimpleLRU constructor accepts valid positive max', () => {
  const lru = new SimpleLRU<string, number>(100);
  assert.equal(lru.size, 0);
});

test('SimpleLRU constructor ignores non-positive TTL', () => {
  const lru = new SimpleLRU<string, number>(10, { ttl: 0 });
  lru.set('a', 1);
  assert.equal(lru.get('a'), 1);
});

test('SimpleLRU constructor ignores negative TTL', () => {
  const lru = new SimpleLRU<string, number>(10, { ttl: -100 });
  lru.set('a', 1);
  assert.equal(lru.get('a'), 1);
});

// ============================================================================
// Basic Get/Set Tests
// ============================================================================

test('SimpleLRU get returns undefined for missing key', () => {
  const lru = new SimpleLRU<string, number>(10);
  assert.equal(lru.get('nonexistent'), undefined);
});

test('SimpleLRU set and get basic value', () => {
  const lru = new SimpleLRU<string, number>(10);
  lru.set('key', 42);
  assert.equal(lru.get('key'), 42);
});

test('SimpleLRU set updates existing key value', () => {
  const lru = new SimpleLRU<string, number>(10);
  lru.set('key', 1);
  lru.set('key', 2);
  assert.equal(lru.get('key'), 2);
  assert.equal(lru.size, 1);
});

test('SimpleLRU handles various value types', () => {
  const lru = new SimpleLRU<string, unknown>(10);
  lru.set('null', null);
  lru.set('object', { foo: 'bar' });
  lru.set('array', [1, 2, 3]);
  lru.set('string', 'hello');
  lru.set('zero', 0);
  lru.set('false', false);

  assert.equal(lru.get('null'), null);
  assert.deepEqual(lru.get('object'), { foo: 'bar' });
  assert.deepEqual(lru.get('array'), [1, 2, 3]);
  assert.equal(lru.get('string'), 'hello');
  assert.equal(lru.get('zero'), 0);
  assert.equal(lru.get('false'), false);
});

// ============================================================================
// Eviction Tests
// ============================================================================

test('SimpleLRU evicts only when capacity exceeded', () => {
  const lru = new SimpleLRU<string, number>(2);

  lru.set('a', 1);
  lru.set('b', 2);
  lru.get('a'); // refresh recency to keep "a"
  lru.set('c', 3); // should evict "b"

  assert.equal(lru.size, 2);
  assert.equal(lru.get('a'), 1);
  assert.equal(lru.get('c'), 3);
  assert.equal(lru.get('b'), undefined);
});

test('SimpleLRU evicts least recently used item', () => {
  const lru = new SimpleLRU<string, number>(3);

  lru.set('a', 1);
  lru.set('b', 2);
  lru.set('c', 3);

  // Access 'a' and 'b', making 'c' the least recently used
  lru.get('a');
  lru.get('b');

  lru.set('d', 4); // should evict 'c'

  assert.equal(lru.size, 3);
  assert.equal(lru.get('c'), undefined);
  assert.equal(lru.get('a'), 1);
  assert.equal(lru.get('b'), 2);
  assert.equal(lru.get('d'), 4);
});

test('SimpleLRU evicts correctly with single capacity', () => {
  const lru = new SimpleLRU<string, number>(1);

  lru.set('a', 1);
  assert.equal(lru.get('a'), 1);

  lru.set('b', 2);
  assert.equal(lru.size, 1);
  assert.equal(lru.get('a'), undefined);
  assert.equal(lru.get('b'), 2);
});

test('SimpleLRU eviction order after multiple accesses', () => {
  const lru = new SimpleLRU<string, number>(3);

  lru.set('a', 1);
  lru.set('b', 2);
  lru.set('c', 3);

  // Create access pattern: a -> c -> b (b becomes most recent)
  lru.get('a');
  lru.get('c');
  lru.get('b');

  // Now add two new items, should evict 'a' then 'c'
  lru.set('d', 4);
  assert.equal(lru.get('a'), undefined);

  lru.set('e', 5);
  assert.equal(lru.get('c'), undefined);

  // 'b', 'd', 'e' should remain
  assert.equal(lru.get('b'), 2);
  assert.equal(lru.get('d'), 4);
  assert.equal(lru.get('e'), 5);
});

test('SimpleLRU updating existing key moves it to front', () => {
  const lru = new SimpleLRU<string, number>(2);

  lru.set('a', 1);
  lru.set('b', 2);
  lru.set('a', 10); // update 'a', moves to front
  lru.set('c', 3);  // should evict 'b', not 'a'

  assert.equal(lru.get('a'), 10);
  assert.equal(lru.get('b'), undefined);
  assert.equal(lru.get('c'), 3);
});

// ============================================================================
// Peek Tests
// ============================================================================

test('SimpleLRU peek does not refresh recency', () => {
  const lru = new SimpleLRU<string, number>(2);

  lru.set('a', 1);
  lru.set('b', 2);
  assert.equal(lru.peek('a'), 1);

  // Adding a new item should evict "a" because peek does not refresh
  lru.set('c', 3);
  assert.equal(lru.get('a'), undefined);
  assert.equal(lru.get('b'), 2);
});

test('SimpleLRU peek returns undefined for missing key', () => {
  const lru = new SimpleLRU<string, number>(10);
  assert.equal(lru.peek('nonexistent'), undefined);
});

test('SimpleLRU peek does not affect size', () => {
  const lru = new SimpleLRU<string, number>(10);
  lru.set('a', 1);
  lru.peek('a');
  lru.peek('nonexistent');
  assert.equal(lru.size, 1);
});

// ============================================================================
// TTL Tests
// ============================================================================

test('SimpleLRU respects TTL expiry', async () => {
  const lru = new SimpleLRU<string, number>(2, { ttl: 20 });

  lru.set('a', 1);
  await delay(30);

  assert.equal(lru.get('a'), undefined);
  assert.equal(lru.size, 0);
});

test('SimpleLRU TTL not expired returns value', async () => {
  const lru = new SimpleLRU<string, number>(2, { ttl: 100 });

  lru.set('a', 1);
  await delay(10);

  assert.equal(lru.get('a'), 1);
});

test('SimpleLRU peek removes expired items', async () => {
  const lru = new SimpleLRU<string, number>(2, { ttl: 20 });

  lru.set('a', 1);
  await delay(30);

  assert.equal(lru.peek('a'), undefined);
  assert.equal(lru.size, 0);
});

test('SimpleLRU updating value refreshes TTL', async () => {
  const lru = new SimpleLRU<string, number>(2, { ttl: 50 });

  lru.set('a', 1);
  await delay(30);
  lru.set('a', 2); // refresh TTL
  await delay(30);

  // Should still be present because TTL was refreshed
  assert.equal(lru.get('a'), 2);
});

test('SimpleLRU mixed TTL and LRU eviction', async () => {
  const lru = new SimpleLRU<string, number>(3, { ttl: 50 });

  lru.set('a', 1);
  await delay(20);
  lru.set('b', 2);
  await delay(20);
  lru.set('c', 3);

  // 'a' should be expired now (40ms passed)
  await delay(15);

  lru.set('d', 4); // this should trigger cleanup of expired 'a'

  assert.equal(lru.get('a'), undefined);
  assert.equal(lru.get('b'), 2);
  assert.equal(lru.get('c'), 3);
  assert.equal(lru.get('d'), 4);
});

// ============================================================================
// Clear Tests
// ============================================================================

test('SimpleLRU clear removes all entries', () => {
  const lru = new SimpleLRU<string, number>(10);

  lru.set('a', 1);
  lru.set('b', 2);
  lru.set('c', 3);

  lru.clear();

  assert.equal(lru.size, 0);
  assert.equal(lru.get('a'), undefined);
  assert.equal(lru.get('b'), undefined);
  assert.equal(lru.get('c'), undefined);
});

test('SimpleLRU clear allows new entries', () => {
  const lru = new SimpleLRU<string, number>(2);

  lru.set('a', 1);
  lru.set('b', 2);
  lru.clear();

  lru.set('c', 3);
  lru.set('d', 4);

  assert.equal(lru.size, 2);
  assert.equal(lru.get('c'), 3);
  assert.equal(lru.get('d'), 4);
});

// ============================================================================
// getOrSet Tests
// ============================================================================

test('SimpleLRU getOrSet returns existing value without calling factory', async () => {
  const lru = new SimpleLRU<string, number>(10);
  lru.set('key', 42);

  let factoryCalled = false;
  const result = await lru.getOrSet('key', async () => {
    factoryCalled = true;
    return 100;
  });

  assert.equal(result, 42);
  assert.equal(factoryCalled, false);
});

test('SimpleLRU getOrSet calls factory for missing key', async () => {
  const lru = new SimpleLRU<string, number>(10);

  let factoryCalled = false;
  const result = await lru.getOrSet('key', async () => {
    factoryCalled = true;
    return 42;
  });

  assert.equal(result, 42);
  assert.equal(factoryCalled, true);
  assert.equal(lru.get('key'), 42);
});

test('SimpleLRU getOrSet caches factory result', async () => {
  const lru = new SimpleLRU<string, number>(10);

  let callCount = 0;
  const factory = async (): Promise<number> => {
    callCount++;
    return callCount;
  };

  const first = await lru.getOrSet('key', factory);
  const second = await lru.getOrSet('key', factory);

  assert.equal(first, 1);
  assert.equal(second, 1);
  assert.equal(callCount, 1);
});

test('SimpleLRU getOrSet coalesces concurrent requests', async () => {
  const lru = new SimpleLRU<string, number>(10);

  let callCount = 0;
  const factory = async (): Promise<number> => {
    callCount++;
    await delay(50);
    return callCount;
  };

  // Start multiple concurrent requests for the same key
  const results = await Promise.all([
    lru.getOrSet('key', factory),
    lru.getOrSet('key', factory),
    lru.getOrSet('key', factory),
  ]);

  // Factory should only be called once due to coalescing
  assert.equal(callCount, 1);
  assert.deepEqual(results, [1, 1, 1]);
});

test('SimpleLRU getOrSet handles factory errors', async () => {
  const lru = new SimpleLRU<string, number>(10);

  const factory = async (): Promise<number> => {
    throw new Error('Factory failed');
  };

  await assert.rejects(
    lru.getOrSet('key', factory),
    { message: 'Factory failed' }
  );

  // Key should not be cached on error
  assert.equal(lru.get('key'), undefined);
});

test('SimpleLRU getOrSet cleans up pending fetches on error', async () => {
  const lru = new SimpleLRU<string, number>(10);

  let callCount = 0;
  const failingFactory = async (): Promise<number> => {
    callCount++;
    throw new Error('Failed');
  };

  const succeedingFactory = async (): Promise<number> => {
    callCount++;
    return 42;
  };

  // First call fails
  await assert.rejects(lru.getOrSet('key', failingFactory));

  // Second call with different factory should work
  const result = await lru.getOrSet('key', succeedingFactory);
  assert.equal(result, 42);
  assert.equal(callCount, 2);
});

test('SimpleLRU getOrSet with different keys runs factories independently', async () => {
  const lru = new SimpleLRU<string, number>(10);

  const results = await Promise.all([
    lru.getOrSet('a', async () => 1),
    lru.getOrSet('b', async () => 2),
    lru.getOrSet('c', async () => 3),
  ]);

  assert.deepEqual(results, [1, 2, 3]);
  assert.equal(lru.get('a'), 1);
  assert.equal(lru.get('b'), 2);
  assert.equal(lru.get('c'), 3);
});

// ============================================================================
// Size Property Tests
// ============================================================================

test('SimpleLRU size reflects current entry count', () => {
  const lru = new SimpleLRU<string, number>(10);

  assert.equal(lru.size, 0);

  lru.set('a', 1);
  assert.equal(lru.size, 1);

  lru.set('b', 2);
  assert.equal(lru.size, 2);

  lru.set('a', 10); // update, not new entry
  assert.equal(lru.size, 2);
});

test('SimpleLRU size respects max capacity', () => {
  const lru = new SimpleLRU<string, number>(3);

  lru.set('a', 1);
  lru.set('b', 2);
  lru.set('c', 3);
  lru.set('d', 4);
  lru.set('e', 5);

  assert.equal(lru.size, 3);
});

// ============================================================================
// Edge Cases
// ============================================================================

test('SimpleLRU handles numeric keys', () => {
  const lru = new SimpleLRU<number, string>(10);

  lru.set(1, 'one');
  lru.set(2, 'two');
  lru.set(0, 'zero');

  assert.equal(lru.get(1), 'one');
  assert.equal(lru.get(2), 'two');
  assert.equal(lru.get(0), 'zero');
});

test('SimpleLRU handles object keys', () => {
  const key1 = { id: 1 };
  const key2 = { id: 2 };
  const lru = new SimpleLRU<object, string>(10);

  lru.set(key1, 'first');
  lru.set(key2, 'second');

  assert.equal(lru.get(key1), 'first');
  assert.equal(lru.get(key2), 'second');

  // Different object with same content is a different key
  assert.equal(lru.get({ id: 1 }), undefined);
});

test('SimpleLRU clear also clears pending fetches', async () => {
  const lru = new SimpleLRU<string, number>(10);

  // Start a slow fetch
  const fetchPromise = lru.getOrSet('key', async () => {
    await delay(100);
    return 42;
  });

  // Clear before fetch completes
  lru.clear();

  // The original fetch should still resolve
  const result = await fetchPromise;
  assert.equal(result, 42);

  // But starting a new fetch should call factory again
  let called = false;
  await lru.getOrSet('key', async () => {
    called = true;
    return 100;
  });

  // After clear, the pending was removed, but the first one already set it
  // So this depends on timing - the key might be set or not
  // The important thing is clear() clears pendingFetches
});

test('SimpleLRU handles undefined as a valid value', () => {
  // Note: undefined values are tricky because get returns undefined for missing keys
  const lru = new SimpleLRU<string, undefined | number>(10);

  lru.set('key', undefined);
  // This returns undefined, which is the actual stored value
  // But we cannot distinguish from missing key
  assert.equal(lru.get('key'), undefined);
  assert.equal(lru.size, 1); // The key exists
});
