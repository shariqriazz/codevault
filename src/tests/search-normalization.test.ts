import test from 'node:test';
import assert from 'node:assert/strict';
import { SearchService } from '../core/SearchService.js';

test('SearchService.normalizeQuery trims and lowercases input', () => {
  const service = new SearchService();
  // Access private method using bracket notation
  const normalizeQuery = (service as unknown as { normalizeQuery: (q: string) => string }).normalizeQuery;
  const normalized = normalizeQuery.call(service, '  Foo  Bar??  ');

  assert.equal(normalized, 'foo bar');
});
