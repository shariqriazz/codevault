import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScopeFilters, applyScope } from '../search/scope.js';
import type { DatabaseChunk } from '../database/db.js';

// Helper to create mock DatabaseChunk
function createMockChunk(overrides: Partial<DatabaseChunk> = {}): DatabaseChunk {
  return {
    id: 'chunk-1',
    file_path: 'src/example.ts',
    symbol: 'exampleFunction',
    sha: 'abc123',
    lang: 'typescript',
    chunk_type: 'function',
    embedding: Buffer.from([]),
    embedding_provider: 'openai',
    embedding_dimensions: 1536,
    codevault_tags: '["utility", "helper"]',
    codevault_intent: 'Helper function',
    codevault_description: 'A utility function',
    ...overrides
  };
}

// ============================================================================
// normalizeScopeFilters - Empty/Default Tests
// ============================================================================

test('normalizeScopeFilters returns defaults for empty scope', () => {
  const result = normalizeScopeFilters({});

  // Should have default toggle values
  assert.equal(result.hybrid, true);
  assert.equal(result.bm25, true);
  assert.equal(result.symbol_boost, true);
  assert.equal(result.reranker, 'off');

  // Optional fields should not be set
  assert.equal(result.path_glob, undefined);
  assert.equal(result.tags, undefined);
  assert.equal(result.lang, undefined);
  assert.equal(result.provider, undefined);
});

test('normalizeScopeFilters returns defaults for undefined scope', () => {
  const result = normalizeScopeFilters(undefined);

  assert.equal(result.hybrid, true);
  assert.equal(result.bm25, true);
  assert.equal(result.symbol_boost, true);
  assert.equal(result.reranker, 'off');
});

// ============================================================================
// normalizeScopeFilters - path_glob Tests
// ============================================================================

test('normalizeScopeFilters normalizes path_glob array', () => {
  const result = normalizeScopeFilters({
    path_glob: ['src/**/*.ts', 'lib/**/*.js']
  });

  assert.deepEqual(result.path_glob, ['src/**/*.ts', 'lib/**/*.js']);
});

test('normalizeScopeFilters normalizes single path_glob to array', () => {
  const result = normalizeScopeFilters({
    path_glob: 'src/**/*.ts' as unknown as string[]
  });

  assert.deepEqual(result.path_glob, ['src/**/*.ts']);
});

test('normalizeScopeFilters trims path_glob values', () => {
  const result = normalizeScopeFilters({
    path_glob: ['  src/**/*.ts  ', '  lib/**/*.js  ']
  });

  assert.deepEqual(result.path_glob, ['src/**/*.ts', 'lib/**/*.js']);
});

test('normalizeScopeFilters filters empty path_glob values', () => {
  const result = normalizeScopeFilters({
    path_glob: ['src/**/*.ts', '', '   ', 'lib/**/*.js']
  });

  assert.deepEqual(result.path_glob, ['src/**/*.ts', 'lib/**/*.js']);
});

test('normalizeScopeFilters omits path_glob when all values are empty', () => {
  const result = normalizeScopeFilters({
    path_glob: ['', '   ']
  });

  assert.equal(result.path_glob, undefined);
});

// ============================================================================
// normalizeScopeFilters - tags Tests
// ============================================================================

test('normalizeScopeFilters normalizes tags to lowercase', () => {
  const result = normalizeScopeFilters({
    tags: ['Utility', 'HELPER', 'Api']
  });

  assert.deepEqual(result.tags, ['utility', 'helper', 'api']);
});

test('normalizeScopeFilters normalizes single tag to array', () => {
  const result = normalizeScopeFilters({
    tags: 'Utility' as unknown as string[]
  });

  assert.deepEqual(result.tags, ['utility']);
});

test('normalizeScopeFilters trims and lowercases tags', () => {
  const result = normalizeScopeFilters({
    tags: ['  UTILITY  ', '  helper  ']
  });

  assert.deepEqual(result.tags, ['utility', 'helper']);
});

test('normalizeScopeFilters filters empty tags', () => {
  const result = normalizeScopeFilters({
    tags: ['utility', '', '   ', 'helper']
  });

  assert.deepEqual(result.tags, ['utility', 'helper']);
});

test('normalizeScopeFilters omits tags when all values are empty', () => {
  const result = normalizeScopeFilters({
    tags: ['', '   ']
  });

  assert.equal(result.tags, undefined);
});

// ============================================================================
// normalizeScopeFilters - lang Tests
// ============================================================================

test('normalizeScopeFilters normalizes lang to lowercase', () => {
  const result = normalizeScopeFilters({
    lang: ['TypeScript', 'JAVASCRIPT', 'Python']
  });

  assert.deepEqual(result.lang, ['typescript', 'javascript', 'python']);
});

test('normalizeScopeFilters normalizes single lang to array', () => {
  const result = normalizeScopeFilters({
    lang: 'TypeScript' as unknown as string[]
  });

  assert.deepEqual(result.lang, ['typescript']);
});

test('normalizeScopeFilters trims and lowercases lang', () => {
  const result = normalizeScopeFilters({
    lang: ['  TypeScript  ', '  javascript  ']
  });

  assert.deepEqual(result.lang, ['typescript', 'javascript']);
});

test('normalizeScopeFilters filters empty lang values', () => {
  const result = normalizeScopeFilters({
    lang: ['typescript', '', '   ', 'python']
  });

  assert.deepEqual(result.lang, ['typescript', 'python']);
});

test('normalizeScopeFilters omits lang when all values are empty', () => {
  const result = normalizeScopeFilters({
    lang: ['', '   ']
  });

  assert.equal(result.lang, undefined);
});

// ============================================================================
// normalizeScopeFilters - provider Tests
// ============================================================================

test('normalizeScopeFilters sets provider when provided', () => {
  const result = normalizeScopeFilters({
    provider: 'openai'
  });

  assert.equal(result.provider, 'openai');
});

test('normalizeScopeFilters trims provider', () => {
  const result = normalizeScopeFilters({
    provider: '  openai  '
  });

  assert.equal(result.provider, 'openai');
});

test('normalizeScopeFilters omits provider when empty', () => {
  const result = normalizeScopeFilters({
    provider: '   '
  });

  assert.equal(result.provider, undefined);
});

test('normalizeScopeFilters omits provider when not string', () => {
  const result = normalizeScopeFilters({
    provider: 123 as unknown as string
  });

  assert.equal(result.provider, undefined);
});

// ============================================================================
// normalizeScopeFilters - reranker Tests
// ============================================================================

test('normalizeScopeFilters sets valid reranker options', () => {
  const resultOff = normalizeScopeFilters({ reranker: 'off' });
  assert.equal(resultOff.reranker, 'off');

  const resultApi = normalizeScopeFilters({ reranker: 'api' });
  assert.equal(resultApi.reranker, 'api');
});

test('normalizeScopeFilters trims reranker', () => {
  const result = normalizeScopeFilters({
    reranker: '  api  ' as 'api'
  });

  assert.equal(result.reranker, 'api');
});

test('normalizeScopeFilters defaults to off for invalid reranker', () => {
  const result = normalizeScopeFilters({
    reranker: 'invalid' as 'off'
  });

  assert.equal(result.reranker, 'off');
});

test('normalizeScopeFilters defaults to off for empty reranker', () => {
  const result = normalizeScopeFilters({
    reranker: '' as 'off'
  });

  assert.equal(result.reranker, 'off');
});

test('normalizeScopeFilters defaults to off for non-string reranker', () => {
  const result = normalizeScopeFilters({
    reranker: 123 as unknown as 'off'
  });

  assert.equal(result.reranker, 'off');
});

// ============================================================================
// normalizeScopeFilters - Toggle Normalization Tests
// ============================================================================

test('normalizeScopeFilters handles boolean hybrid', () => {
  const resultTrue = normalizeScopeFilters({ hybrid: true });
  assert.equal(resultTrue.hybrid, true);

  const resultFalse = normalizeScopeFilters({ hybrid: false });
  assert.equal(resultFalse.hybrid, false);
});

test('normalizeScopeFilters handles string hybrid values for true', () => {
  const trueValues = ['on', 'true', '1', 'yes', 'enable', 'enabled'];

  for (const value of trueValues) {
    const result = normalizeScopeFilters({ hybrid: value as unknown as boolean });
    assert.equal(result.hybrid, true, `Expected '${value}' to be true`);
  }
});

test('normalizeScopeFilters handles string hybrid values for false', () => {
  const falseValues = ['off', 'false', '0', 'no', 'disable', 'disabled'];

  for (const value of falseValues) {
    const result = normalizeScopeFilters({ hybrid: value as unknown as boolean });
    assert.equal(result.hybrid, false, `Expected '${value}' to be false`);
  }
});

test('normalizeScopeFilters handles case-insensitive toggle strings', () => {
  const result1 = normalizeScopeFilters({ hybrid: 'TRUE' as unknown as boolean });
  assert.equal(result1.hybrid, true);

  const result2 = normalizeScopeFilters({ hybrid: 'FALSE' as unknown as boolean });
  assert.equal(result2.hybrid, false);

  const result3 = normalizeScopeFilters({ bm25: 'On' as unknown as boolean });
  assert.equal(result3.bm25, true);

  const result4 = normalizeScopeFilters({ symbol_boost: 'OFF' as unknown as boolean });
  assert.equal(result4.symbol_boost, false);
});

test('normalizeScopeFilters trims toggle string values', () => {
  const result = normalizeScopeFilters({ hybrid: '  true  ' as unknown as boolean });
  assert.equal(result.hybrid, true);
});

test('normalizeScopeFilters defaults to true for unknown toggle values', () => {
  const result = normalizeScopeFilters({
    hybrid: 'maybe' as unknown as boolean,
    bm25: 123 as unknown as boolean,
    symbol_boost: {} as unknown as boolean
  });

  assert.equal(result.hybrid, true);
  assert.equal(result.bm25, true);
  assert.equal(result.symbol_boost, true);
});

// ============================================================================
// applyScope - Empty/No Filter Tests
// ============================================================================

test('applyScope returns empty array for empty chunks', () => {
  const result = applyScope([], {});
  assert.deepEqual(result, []);
});

test('applyScope returns original chunks when no filters applied', () => {
  const chunks = [createMockChunk({ id: 'chunk-1' }), createMockChunk({ id: 'chunk-2' })];

  const result = applyScope(chunks, {});

  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'chunk-1');
  assert.equal(result[1].id, 'chunk-2');
});

test('applyScope returns original chunks for undefined scope', () => {
  const chunks = [createMockChunk({ id: 'chunk-1' })];

  const result = applyScope(chunks, undefined as unknown as {});

  assert.equal(result.length, 1);
});

test('applyScope handles non-array input', () => {
  const result = applyScope(null as unknown as DatabaseChunk[], {});

  assert.equal(result, null);
});

// ============================================================================
// applyScope - path_glob Filtering Tests
// ============================================================================

test('applyScope filters by path_glob', () => {
  const chunks = [
    createMockChunk({ id: 'ts-chunk', file_path: 'src/utils/helper.ts' }),
    createMockChunk({ id: 'js-chunk', file_path: 'src/utils/helper.js' }),
    createMockChunk({ id: 'other-chunk', file_path: 'lib/module.ts' })
  ];

  const result = applyScope(chunks, { path_glob: ['src/**/*.ts'] });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'ts-chunk');
});

test('applyScope supports multiple path_glob patterns', () => {
  const chunks = [
    createMockChunk({ id: 'chunk-1', file_path: 'src/utils/helper.ts' }),
    createMockChunk({ id: 'chunk-2', file_path: 'lib/module.js' }),
    createMockChunk({ id: 'chunk-3', file_path: 'test/test.spec.ts' })
  ];

  const result = applyScope(chunks, { path_glob: ['src/**/*', 'lib/**/*'] });

  assert.equal(result.length, 2);
  const ids = result.map((r) => r.id);
  assert.ok(ids.includes('chunk-1'));
  assert.ok(ids.includes('chunk-2'));
});

test('applyScope path_glob supports dot files', () => {
  const chunks = [
    createMockChunk({ id: 'dotfile', file_path: 'src/.hidden/file.ts' }),
    createMockChunk({ id: 'normal', file_path: 'src/normal/file.ts' })
  ];

  const result = applyScope(chunks, { path_glob: ['src/**/*.ts'] });

  assert.equal(result.length, 2);
});

test('applyScope excludes chunks with empty file_path', () => {
  const chunks = [
    createMockChunk({ id: 'valid', file_path: 'src/file.ts' }),
    createMockChunk({ id: 'empty', file_path: '' }),
    createMockChunk({ id: 'undefined', file_path: undefined as unknown as string })
  ];

  const result = applyScope(chunks, { path_glob: ['**/*.ts'] });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'valid');
});

test('applyScope path_glob normalizes single pattern to array', () => {
  const chunks = [createMockChunk({ id: 'chunk-1', file_path: 'src/file.ts' })];

  const result = applyScope(chunks, { path_glob: 'src/**/*' as unknown as string[] });

  assert.equal(result.length, 1);
});

// ============================================================================
// applyScope - tags Filtering Tests
// ============================================================================

test('applyScope filters by tags', () => {
  const chunks = [
    createMockChunk({ id: 'utility-chunk', codevault_tags: '["utility", "helper"]' }),
    createMockChunk({ id: 'api-chunk', codevault_tags: '["api", "rest"]' }),
    createMockChunk({ id: 'both-chunk', codevault_tags: '["utility", "api"]' })
  ];

  const result = applyScope(chunks, { tags: ['utility'] });

  assert.equal(result.length, 2);
  const ids = result.map((r) => r.id);
  assert.ok(ids.includes('utility-chunk'));
  assert.ok(ids.includes('both-chunk'));
});

test('applyScope tags matching is case-insensitive', () => {
  const chunks = [
    createMockChunk({ id: 'chunk-1', codevault_tags: '["UTILITY", "Helper"]' }),
    createMockChunk({ id: 'chunk-2', codevault_tags: '["api"]' })
  ];

  const result = applyScope(chunks, { tags: ['utility'] });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'chunk-1');
});

test('applyScope excludes chunks without codevault_tags', () => {
  const chunks = [
    createMockChunk({ id: 'with-tags', codevault_tags: '["utility"]' }),
    createMockChunk({ id: 'no-tags', codevault_tags: undefined }),
    createMockChunk({ id: 'empty-tags', codevault_tags: '' })
  ];

  const result = applyScope(chunks, { tags: ['utility'] });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'with-tags');
});

test('applyScope handles invalid JSON in codevault_tags', () => {
  const chunks = [
    createMockChunk({ id: 'valid', codevault_tags: '["utility"]' }),
    createMockChunk({ id: 'invalid', codevault_tags: 'not-valid-json' }),
    createMockChunk({ id: 'malformed', codevault_tags: '["unclosed' })
  ];

  const result = applyScope(chunks, { tags: ['utility'] });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'valid');
});

test('applyScope handles non-array tags in JSON', () => {
  const chunks = [
    createMockChunk({ id: 'array-tags', codevault_tags: '["utility"]' }),
    createMockChunk({ id: 'object-tags', codevault_tags: '{"tag": "utility"}' }),
    createMockChunk({ id: 'string-tags', codevault_tags: '"utility"' })
  ];

  const result = applyScope(chunks, { tags: ['utility'] });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'array-tags');
});

test('applyScope handles non-string elements in tags array', () => {
  const chunks = [
    createMockChunk({ id: 'mixed-tags', codevault_tags: '["utility", 123, null, "helper"]' }),
    createMockChunk({ id: 'valid-tags', codevault_tags: '["api"]' })
  ];

  const result = applyScope(chunks, { tags: ['utility'] });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'mixed-tags');
});

// ============================================================================
// applyScope - lang Filtering Tests
// ============================================================================

test('applyScope filters by lang', () => {
  const chunks = [
    createMockChunk({ id: 'ts-chunk', lang: 'typescript' }),
    createMockChunk({ id: 'js-chunk', lang: 'javascript' }),
    createMockChunk({ id: 'py-chunk', lang: 'python' })
  ];

  const result = applyScope(chunks, { lang: ['typescript', 'javascript'] });

  assert.equal(result.length, 2);
  const ids = result.map((r) => r.id);
  assert.ok(ids.includes('ts-chunk'));
  assert.ok(ids.includes('js-chunk'));
});

test('applyScope lang matching is case-insensitive', () => {
  const chunks = [
    createMockChunk({ id: 'chunk-1', lang: 'TypeScript' }),
    createMockChunk({ id: 'chunk-2', lang: 'PYTHON' }),
    createMockChunk({ id: 'chunk-3', lang: 'javascript' })
  ];

  const result = applyScope(chunks, { lang: ['typescript', 'python'] });

  assert.equal(result.length, 2);
  const ids = result.map((r) => r.id);
  assert.ok(ids.includes('chunk-1'));
  assert.ok(ids.includes('chunk-2'));
});

test('applyScope excludes chunks without lang', () => {
  const chunks = [
    createMockChunk({ id: 'with-lang', lang: 'typescript' }),
    createMockChunk({ id: 'no-lang', lang: '' }),
    createMockChunk({ id: 'undefined-lang', lang: undefined as unknown as string })
  ];

  const result = applyScope(chunks, { lang: ['typescript'] });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'with-lang');
});

test('applyScope lang normalizes single lang to array', () => {
  const chunks = [
    createMockChunk({ id: 'chunk-1', lang: 'typescript' }),
    createMockChunk({ id: 'chunk-2', lang: 'python' })
  ];

  const result = applyScope(chunks, { lang: 'typescript' as unknown as string[] });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'chunk-1');
});

// ============================================================================
// applyScope - Combined Filters Tests
// ============================================================================

test('applyScope applies all filters (AND logic)', () => {
  const chunks = [
    createMockChunk({
      id: 'matches-all',
      file_path: 'src/utils/helper.ts',
      lang: 'typescript',
      codevault_tags: '["utility"]'
    }),
    createMockChunk({
      id: 'matches-path-lang',
      file_path: 'src/utils/helper.ts',
      lang: 'typescript',
      codevault_tags: '["api"]'
    }),
    createMockChunk({
      id: 'matches-path-tags',
      file_path: 'src/utils/helper.ts',
      lang: 'python',
      codevault_tags: '["utility"]'
    }),
    createMockChunk({
      id: 'wrong-path',
      file_path: 'lib/module.ts',
      lang: 'typescript',
      codevault_tags: '["utility"]'
    })
  ];

  const result = applyScope(chunks, {
    path_glob: ['src/**/*'],
    lang: ['typescript'],
    tags: ['utility']
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'matches-all');
});

test('applyScope with only path_glob filter', () => {
  const chunks = [
    createMockChunk({ id: 'chunk-1', file_path: 'src/file.ts' }),
    createMockChunk({ id: 'chunk-2', file_path: 'lib/file.ts' })
  ];

  const result = applyScope(chunks, { path_glob: ['src/**/*'] });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'chunk-1');
});

test('applyScope with only tags filter', () => {
  const chunks = [
    createMockChunk({ id: 'chunk-1', codevault_tags: '["utility"]' }),
    createMockChunk({ id: 'chunk-2', codevault_tags: '["api"]' })
  ];

  const result = applyScope(chunks, { tags: ['utility'] });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'chunk-1');
});

test('applyScope with only lang filter', () => {
  const chunks = [
    createMockChunk({ id: 'chunk-1', lang: 'typescript' }),
    createMockChunk({ id: 'chunk-2', lang: 'python' })
  ];

  const result = applyScope(chunks, { lang: ['typescript'] });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'chunk-1');
});

test('applyScope returns empty array when no chunks match', () => {
  const chunks = [
    createMockChunk({ id: 'chunk-1', file_path: 'src/file.ts' }),
    createMockChunk({ id: 'chunk-2', file_path: 'lib/file.ts' })
  ];

  const result = applyScope(chunks, { path_glob: ['test/**/*'] });

  assert.deepEqual(result, []);
});

// ============================================================================
// applyScope - Edge Cases Tests
// ============================================================================

test('applyScope ignores non-filtering scope properties', () => {
  const chunks = [createMockChunk({ id: 'chunk-1' }), createMockChunk({ id: 'chunk-2' })];

  // These properties should not affect filtering
  const result = applyScope(chunks, {
    hybrid: true,
    bm25: false,
    symbol_boost: true,
    reranker: 'api',
    provider: 'openai'
  });

  assert.equal(result.length, 2);
});

test('applyScope handles empty filter arrays', () => {
  const chunks = [createMockChunk({ id: 'chunk-1' }), createMockChunk({ id: 'chunk-2' })];

  const result = applyScope(chunks, {
    path_glob: [],
    tags: [],
    lang: []
  });

  // Empty arrays should not filter (no filter applied)
  assert.equal(result.length, 2);
});
