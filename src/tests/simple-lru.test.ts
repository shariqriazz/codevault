import test from 'node:test';
import assert from 'node:assert/strict';
import { SimpleLRU } from '../utils/simple-lru.js';

test('SimpleLRU evicts only when capacity exceeded', () => {
  const lru = new SimpleLRU<string, number>(2);

  lru.set('a', 1);
  lru.set('b', 2);
  lru.set('b', 3); // refresh recency
  lru.set('c', 4); // should evict "a"

  assert.equal(lru.size, 2);
  assert.equal(lru.get('b'), 3);
  assert.equal(lru.get('c'), 4);
  assert.equal(lru.get('a'), undefined);

  // Adding another should evict least recently used ("b")
  lru.set('d', 5);
  assert.equal(lru.size, 2);
  assert.equal(lru.get('c'), 4);
  assert.equal(lru.get('d'), 5);
  assert.equal(lru.get('b'), undefined);
});
