import test from 'node:test';
import assert from 'node:assert/strict';
import { SearchService } from '../core/SearchService.js';

test('SearchService.normalizeQuery trims and lowercases input', () => {
  const service: any = new SearchService();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  const normalized = service.normalizeQuery('  Foo  Bar??  ');

  assert.equal(normalized, 'foo bar');
});
