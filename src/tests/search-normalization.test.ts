import test from 'node:test';
import assert from 'node:assert/strict';
import { SearchService } from '../core/SearchService.js';

test('SearchService.normalizeQuery trims and lowercases input', () => {
  const service = new SearchService() as unknown as { normalizeQuery: (query: string) => string };
  const normalized = service.normalizeQuery('  Foo  Bar??  ');

  assert.equal(normalized, 'foo bar');
});
