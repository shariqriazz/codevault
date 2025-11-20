import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'timers/promises';
import { SimpleLRU } from '../utils/simple-lru.js';

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

test('SimpleLRU respects TTL expiry', async () => {
  const lru = new SimpleLRU<string, number>(2, { ttl: 20 });

  lru.set('a', 1);
  await delay(30);

  assert.equal(lru.get('a'), undefined);
  assert.equal(lru.size, 0);
});
