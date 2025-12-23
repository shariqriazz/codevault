import test from 'node:test';
import assert from 'node:assert/strict';
import { applySymbolBoost } from '../ranking/symbol-boost.js';
import type { Codemap, CodemapChunk } from '../types/codemap.js';

// ============================================================================
// Test Interfaces
// ============================================================================

interface TestResult {
  id: string;
  score?: number;
  symbolBoost?: number;
  symbolBoostSources?: string[];
  symbolMatchStrength?: number;
  symbolNeighborStrength?: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

function createCodemap(entries: Record<string, Partial<CodemapChunk>>): Codemap {
  const codemap: Codemap = {};
  for (const [id, entry] of Object.entries(entries)) {
    codemap[id] = {
      file: entry.file || 'src/test.ts',
      sha: entry.sha || `sha-${id}`,
      lang: entry.lang || 'typescript',
      symbol: entry.symbol || null,
      symbol_neighbors: entry.symbol_neighbors || [],
      symbol_signature: entry.symbol_signature,
      symbol_parameters: entry.symbol_parameters,
      ...entry,
    };
  }
  return codemap;
}

function createResults(items: { id: string; score: number }[]): TestResult[] {
  return items.map((item) => ({
    id: item.id,
    score: item.score,
  }));
}

// ============================================================================
// applySymbolBoost - Empty/Invalid Input Handling
// ============================================================================

test('applySymbolBoost handles empty results array', () => {
  const codemap = createCodemap({
    chunk1: { symbol: 'testFunction' },
  });
  const results: TestResult[] = [];

  applySymbolBoost(results as never, { query: 'test', codemap });

  assert.equal(results.length, 0);
});

test('applySymbolBoost handles null results', () => {
  const codemap = createCodemap({
    chunk1: { symbol: 'testFunction' },
  });

  // Should not throw
  applySymbolBoost(null as never, { query: 'test', codemap });
});

test('applySymbolBoost handles undefined results', () => {
  const codemap = createCodemap({
    chunk1: { symbol: 'testFunction' },
  });

  // Should not throw
  applySymbolBoost(undefined as never, { query: 'test', codemap });
});

test('applySymbolBoost handles non-array results', () => {
  const codemap = createCodemap({
    chunk1: { symbol: 'testFunction' },
  });

  // Should not throw
  applySymbolBoost('not an array' as never, { query: 'test', codemap });
});

test('applySymbolBoost handles null codemap', () => {
  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  applySymbolBoost(results as never, { query: 'test', codemap: null as never });

  // Score should remain unchanged
  assert.equal(results[0].score, 0.5);
  assert.equal(results[0].symbolBoost, undefined);
});

test('applySymbolBoost handles undefined codemap', () => {
  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  applySymbolBoost(results as never, { query: 'test', codemap: undefined as never });

  // Score should remain unchanged
  assert.equal(results[0].score, 0.5);
});

test('applySymbolBoost handles empty codemap', () => {
  const results = createResults([{ id: 'chunk1', score: 0.5 }]);
  const codemap: Codemap = {};

  applySymbolBoost(results as never, { query: 'test', codemap });

  // Score should remain unchanged (no matching metadata)
  assert.equal(results[0].score, 0.5);
  assert.equal(results[0].symbolBoost, undefined);
});

test('applySymbolBoost handles result with no matching codemap entry', () => {
  const codemap = createCodemap({
    differentChunk: { symbol: 'testFunction' },
  });
  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  applySymbolBoost(results as never, { query: 'test', codemap });

  // Score should remain unchanged
  assert.equal(results[0].score, 0.5);
  assert.equal(results[0].symbolBoost, undefined);
});

// ============================================================================
// applySymbolBoost - Score Capping (MAX_SYMBOL_BOOST = 0.45)
// ============================================================================

test('applySymbolBoost caps total score at or below 1.0', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'processPayment',
      sha: 'sha-1',
      symbol_neighbors: [],
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.9 }]);

  applySymbolBoost(results as never, { query: 'process payment', codemap });

  assert.ok(results[0].score! <= 1, 'score should not exceed 1.0');
  assert.ok(results[0].symbolBoost! <= 0.45, 'boost should respect cap of 0.45');
});

test('applySymbolBoost caps symbolBoost at 0.45 even with high match strength', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'processPaymentTransaction',
      symbol_signature: 'processPaymentTransaction(amount, currency, recipient)',
      symbol_parameters: ['amount', 'currency', 'recipient'],
      sha: 'sha-1',
      // Add neighbors that also match query
      symbol_neighbors: ['sha-2'],
    },
    chunk2: {
      symbol: 'validatePayment',
      sha: 'sha-2',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  applySymbolBoost(results as never, {
    query: 'process payment transaction amount currency recipient validate',
    codemap,
  });

  assert.ok(results[0].symbolBoost! <= 0.45, 'symbolBoost must be capped at 0.45');
  assert.ok(results[0].score! <= 1.0, 'total score must not exceed 1.0');
});

test('applySymbolBoost ensures total score never exceeds 1.0 even with base score of 1.0', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'testFunction',
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 1.0 }]);

  applySymbolBoost(results as never, { query: 'test function', codemap });

  assert.equal(results[0].score, 1.0, 'score should be capped at 1.0');
});

test('applySymbolBoost handles base score greater than 1.0 (normalizes to 1.0)', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'testFunction',
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 1.5 }]);

  applySymbolBoost(results as never, { query: 'test function', codemap });

  // Base score should be clamped to 1.0, then boost added (capped at 1.0)
  assert.ok(results[0].score! <= 1.0, 'score should never exceed 1.0');
});

test('applySymbolBoost handles negative base score (normalizes to 0)', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'testFunction',
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: -0.5 }]);

  applySymbolBoost(results as never, { query: 'test function', codemap });

  // Base score should be clamped to 0, then boost added
  assert.ok(results[0].score! >= 0, 'score should never be negative');
});

// ============================================================================
// applySymbolBoost - Signature Matching
// ============================================================================

test('applySymbolBoost boosts when query contains exact symbol name', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'calculateTotal',
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  applySymbolBoost(results as never, { query: 'calculatetotal function', codemap });

  assert.ok(results[0].symbolBoost! > 0, 'should receive boost for exact symbol match');
  assert.ok(results[0].symbolBoostSources!.includes('signature'), 'source should include signature');
});

test('applySymbolBoost boosts for case-insensitive symbol match', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'ProcessData',
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  applySymbolBoost(results as never, { query: 'PROCESSDATA function', codemap });

  assert.ok(results[0].symbolBoost! > 0, 'should boost for case-insensitive match');
});

test('applySymbolBoost boosts when query matches symbol signature', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'foo',
      symbol_signature: 'calculateDiscount(price, rate)',
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  applySymbolBoost(results as never, { query: 'calculatediscount(price, rate)', codemap });

  assert.ok(results[0].symbolBoost! > 0, 'should boost for signature match');
});

test('applySymbolBoost boosts for camelCase token matching', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'getUserAccountDetails',
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  applySymbolBoost(results as never, { query: 'user account details', codemap });

  assert.ok(results[0].symbolBoost! > 0, 'should boost for camelCase token matches');
  assert.ok(results[0].symbolMatchStrength! > 0, 'should set symbolMatchStrength');
});

test('applySymbolBoost boosts for underscore_separated token matching', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'get_user_profile',
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  applySymbolBoost(results as never, { query: 'user profile function', codemap });

  assert.ok(results[0].symbolBoost! > 0, 'should boost for underscore token matches');
});

test('applySymbolBoost does not boost for token-only matching when tokens are shorter than MIN_TOKEN_LENGTH (3)', () => {
  // Note: The MIN_TOKEN_LENGTH check only applies to token-based regex matching,
  // NOT to the direct symbol substring check. If the query contains the exact symbol
  // (e.g., 'ab' in 'ab function'), it will still match via the substring check.
  // This test verifies that short tokens from symbol splitting are skipped.
  const codemap = createCodemap({
    chunk1: {
      symbol: 'XY', // 2 chars - when split, tokens are too short for regex matching
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  // Query does NOT contain 'xy' as a substring, so substring check fails
  // Token 'xy' is too short (< 3) so token-based regex matching is also skipped
  applySymbolBoost(results as never, { query: 'different query here', codemap });

  // Should not boost because neither substring nor token match works
  assert.equal(results[0].symbolBoost, undefined, 'should not boost when no match');
});

test('applySymbolBoost boosts short symbol via substring match even if token too short', () => {
  // This test verifies that the substring check bypasses the MIN_TOKEN_LENGTH restriction
  const codemap = createCodemap({
    chunk1: {
      symbol: 'ab', // 2 chars - too short for token matching, but works for substring
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  // Query contains 'ab' as substring, so it matches via substring check
  applySymbolBoost(results as never, { query: 'ab function', codemap });

  // Should boost because queryLower.includes('ab') is true
  assert.ok(results[0].symbolBoost! > 0, 'should boost via substring match');
});

test('applySymbolBoost handles symbol with null value', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: null,
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  applySymbolBoost(results as never, { query: 'test function', codemap });

  // Should not throw and should not boost
  assert.equal(results[0].symbolBoost, undefined);
});

test('applySymbolBoost handles empty symbol string', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: '',
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  applySymbolBoost(results as never, { query: 'test', codemap });

  assert.equal(results[0].symbolBoost, undefined);
});

// ============================================================================
// applySymbolBoost - Parameter Matching
// ============================================================================

test('applySymbolBoost boosts when query matches function parameters', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'calculateTax',
      symbol_parameters: ['income', 'taxRate', 'deductions'],
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  applySymbolBoost(results as never, { query: 'calculate income deductions', codemap });

  assert.ok(results[0].symbolBoost! > 0, 'should boost for parameter matches');
});

test('applySymbolBoost handles parameter with type annotations', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'processOrder',
      symbol_parameters: ['orderId: string', 'quantity: number', 'price: number'],
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  applySymbolBoost(results as never, { query: 'order quantity price', codemap });

  assert.ok(results[0].symbolBoost! > 0, 'should boost for parameter name matches with types');
});

test('applySymbolBoost handles empty symbol_parameters array', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'noParams',
      symbol_parameters: [],
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  applySymbolBoost(results as never, { query: 'noparams function', codemap });

  // Should still boost for symbol match
  assert.ok(results[0].symbolBoost! > 0);
});

test('applySymbolBoost handles undefined symbol_parameters', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'noParams',
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  applySymbolBoost(results as never, { query: 'noparams', codemap });

  // Should not throw
  assert.ok(results[0].symbolBoost! > 0 || results[0].symbolBoost === undefined);
});

test('applySymbolBoost ignores non-string parameters', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'mixedParams',
      symbol_parameters: ['validParam', 123 as unknown as string, null as unknown as string, 'anotherValid'],
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  // Should not throw
  applySymbolBoost(results as never, { query: 'validparam anothervalid', codemap });

  assert.ok(results[0].symbolBoost! > 0);
});

// ============================================================================
// applySymbolBoost - Neighbor Matching
// ============================================================================

test('applySymbolBoost boosts when neighbor symbol matches query', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'mainFunction',
      sha: 'sha-1',
      symbol_neighbors: ['sha-2'],
    },
    chunk2: {
      symbol: 'helperUtility',
      sha: 'sha-2',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  applySymbolBoost(results as never, { query: 'helper utility', codemap });

  assert.ok(results[0].symbolBoost! > 0, 'should boost for neighbor match');
  assert.ok(results[0].symbolBoostSources!.includes('neighbor'), 'source should include neighbor');
  assert.ok(results[0].symbolNeighborStrength! > 0, 'should set symbolNeighborStrength');
});

test('applySymbolBoost finds best neighbor match among multiple neighbors', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'mainFunction',
      sha: 'sha-1',
      symbol_neighbors: ['sha-2', 'sha-3', 'sha-4'],
    },
    chunk2: {
      symbol: 'weakMatch',
      sha: 'sha-2',
    },
    chunk3: {
      symbol: 'strongMatchQueryTerms',
      sha: 'sha-3',
    },
    chunk4: {
      symbol: 'anotherWeak',
      sha: 'sha-4',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  applySymbolBoost(results as never, { query: 'strong match query terms', codemap });

  assert.ok(results[0].symbolNeighborStrength! > 0, 'should find best neighbor match');
});

test('applySymbolBoost handles empty symbol_neighbors array', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'isolatedFunction',
      sha: 'sha-1',
      symbol_neighbors: [],
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  applySymbolBoost(results as never, { query: 'isolated', codemap });

  // Should still work, just no neighbor boost
  assert.equal(results[0].symbolNeighborStrength, undefined);
});

test('applySymbolBoost handles neighbor SHA not found in codemap', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'mainFunction',
      sha: 'sha-1',
      symbol_neighbors: ['non-existent-sha'],
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  // Should not throw
  applySymbolBoost(results as never, { query: 'main function', codemap });

  assert.ok(results[0].symbolBoost! >= 0 || results[0].symbolBoost === undefined);
});

test('applySymbolBoost handles undefined symbol_neighbors', () => {
  const codemap: Codemap = {
    chunk1: {
      file: 'test.ts',
      sha: 'sha-1',
      symbol: 'testSymbol',
    },
  };

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  // Should not throw
  applySymbolBoost(results as never, { query: 'testsymbol', codemap });

  assert.ok(typeof results[0].score === 'number');
});

// ============================================================================
// applySymbolBoost - Combined Signature and Neighbor Boost
// ============================================================================

test('applySymbolBoost combines signature and neighbor boosts', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'processOrder',
      sha: 'sha-1',
      symbol_neighbors: ['sha-2'],
    },
    chunk2: {
      symbol: 'validatePayment',
      sha: 'sha-2',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  applySymbolBoost(results as never, { query: 'process order validate payment', codemap });

  // Should have both sources
  assert.ok(results[0].symbolBoostSources!.includes('signature'), 'should include signature');
  assert.ok(results[0].symbolBoostSources!.includes('neighbor'), 'should include neighbor');
  assert.ok(results[0].symbolBoost! > 0, 'combined boost should be positive');
  assert.ok(results[0].symbolBoost! <= 0.45, 'combined boost should still be capped');
});

// ============================================================================
// applySymbolBoost - Multiple Results Processing
// ============================================================================

test('applySymbolBoost processes multiple results independently', () => {
  const codemap = createCodemap({
    chunk1: { symbol: 'functionOne', sha: 'sha-1' },
    chunk2: { symbol: 'functionTwo', sha: 'sha-2' },
    chunk3: { symbol: 'noMatch', sha: 'sha-3' },
  });

  const results = createResults([
    { id: 'chunk1', score: 0.6 },
    { id: 'chunk2', score: 0.5 },
    { id: 'chunk3', score: 0.4 },
  ]);

  applySymbolBoost(results as never, { query: 'function one two', codemap });

  // chunk1 and chunk2 should be boosted, chunk3 should not
  assert.ok(results[0].symbolBoost! > 0, 'chunk1 should be boosted');
  assert.ok(results[1].symbolBoost! > 0, 'chunk2 should be boosted');
  assert.equal(results[2].symbolBoost, undefined, 'chunk3 should not be boosted');
});

test('applySymbolBoost handles results with undefined score', () => {
  const codemap = createCodemap({
    chunk1: { symbol: 'testFunction', sha: 'sha-1' },
  });

  const results: TestResult[] = [{ id: 'chunk1' }]; // score is undefined

  applySymbolBoost(results as never, { query: 'testfunction', codemap });

  // Should treat undefined score as 0
  assert.ok(results[0].score! >= 0, 'score should be >= 0');
  assert.ok(results[0].score! <= 1, 'score should be <= 1');
});

// ============================================================================
// applySymbolBoost - Regex Special Character Handling
// ============================================================================

test('applySymbolBoost handles symbols with regex special characters', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'process$Value',
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  // Should not throw due to unescaped regex special chars
  applySymbolBoost(results as never, { query: 'process value', codemap });

  // May or may not boost depending on token matching
  assert.ok(typeof results[0].score === 'number');
});

test('applySymbolBoost handles query with regex special characters', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'testFunction',
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  // Should not throw
  applySymbolBoost(results as never, { query: 'test.*function [regex]', codemap });

  assert.ok(typeof results[0].score === 'number');
});

test('applySymbolBoost handles symbols with parentheses and brackets', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'array[index]',
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  // Should not throw
  applySymbolBoost(results as never, { query: 'array index', codemap });

  assert.ok(typeof results[0].score === 'number');
});

// ============================================================================
// applySymbolBoost - Edge Cases for Match Strength Calculation
// ============================================================================

test('applySymbolBoost gives higher weight to exact symbol match vs token match', () => {
  const codemap = createCodemap({
    exact: {
      symbol: 'calculateTotal',
      sha: 'sha-exact',
    },
    partial: {
      symbol: 'calculateSomethingElse',
      sha: 'sha-partial',
    },
  });

  const resultsExact = createResults([{ id: 'exact', score: 0.5 }]);
  const resultsPartial = createResults([{ id: 'partial', score: 0.5 }]);

  applySymbolBoost(resultsExact as never, { query: 'calculatetotal', codemap });
  applySymbolBoost(resultsPartial as never, { query: 'calculatetotal', codemap });

  // Exact match should have higher or equal boost
  const exactBoost = resultsExact[0].symbolBoost ?? 0;
  const partialBoost = resultsPartial[0].symbolBoost ?? 0;
  assert.ok(exactBoost >= partialBoost, 'exact match should have higher boost');
});

test('applySymbolBoost accumulates boost for multiple token matches', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'getUserAccountBalanceHistory',
      sha: 'sha-1',
    },
  });

  const resultsSingle = createResults([{ id: 'chunk1', score: 0.5 }]);
  const resultsMultiple = createResults([{ id: 'chunk1', score: 0.5 }]);

  applySymbolBoost(resultsSingle as never, { query: 'user', codemap });
  applySymbolBoost(resultsMultiple as never, { query: 'user account balance history', codemap });

  const singleBoost = resultsSingle[0].symbolBoost ?? 0;
  const multipleBoost = resultsMultiple[0].symbolBoost ?? 0;

  assert.ok(multipleBoost >= singleBoost, 'multiple token matches should boost more');
});

// ============================================================================
// applySymbolBoost - Unicode and International Characters
// ============================================================================

test('applySymbolBoost handles unicode characters in symbol names', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'getUsuarioNome',
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  // Should not throw
  applySymbolBoost(results as never, { query: 'usuario nome', codemap });

  assert.ok(typeof results[0].score === 'number');
});

// ============================================================================
// applySymbolBoost - Very Long Symbols and Queries
// ============================================================================

test('applySymbolBoost handles very long symbol names', () => {
  const longSymbol = 'a'.repeat(1000) + 'TestFunction';
  const codemap = createCodemap({
    chunk1: {
      symbol: longSymbol,
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  // Should not throw or hang
  applySymbolBoost(results as never, { query: 'test function', codemap });

  assert.ok(typeof results[0].score === 'number');
});

test('applySymbolBoost handles very long queries', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'simpleFunction',
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);
  const longQuery = 'simple function ' + 'extra '.repeat(500);

  // Should not throw or hang
  applySymbolBoost(results as never, { query: longQuery, codemap });

  assert.ok(typeof results[0].score === 'number');
});

// ============================================================================
// applySymbolBoost - Mutation Verification
// ============================================================================

test('applySymbolBoost mutates results in place', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'testFunction',
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);
  const originalReference = results[0];

  applySymbolBoost(results as never, { query: 'testfunction', codemap });

  // Should be same reference, mutated
  assert.strictEqual(results[0], originalReference, 'should mutate in place');
  assert.ok(results[0].symbolBoost! > 0, 'should have boost applied');
});

test('applySymbolBoost does not add properties when no boost applied', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'completelyDifferent',
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  applySymbolBoost(results as never, { query: 'xyz abc', codemap });

  assert.equal(results[0].symbolBoost, undefined, 'should not add symbolBoost when no match');
  assert.equal(results[0].symbolBoostSources, undefined, 'should not add symbolBoostSources');
});

// ============================================================================
// applySymbolBoost - Zero Score Handling
// ============================================================================

test('applySymbolBoost handles base score of exactly 0', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'testFunction',
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0 }]);

  applySymbolBoost(results as never, { query: 'testfunction', codemap });

  assert.ok(results[0].score! >= 0, 'score should be >= 0');
  assert.ok(results[0].score! <= 0.45, 'score should be <= 0.45 (max boost)');
});

// ============================================================================
// applySymbolBoost - Large Codemap Performance
// ============================================================================

test('applySymbolBoost handles large codemap efficiently', () => {
  // Create a large codemap
  const entries: Record<string, Partial<CodemapChunk>> = {};
  for (let i = 0; i < 1000; i++) {
    entries[`chunk${i}`] = {
      symbol: `function${i}`,
      sha: `sha-${i}`,
      symbol_neighbors: i > 0 ? [`sha-${i - 1}`] : [],
    };
  }
  const codemap = createCodemap(entries);

  const results = createResults([
    { id: 'chunk500', score: 0.5 },
    { id: 'chunk999', score: 0.4 },
  ]);

  const start = Date.now();
  applySymbolBoost(results as never, { query: 'function500 function999', codemap });
  const elapsed = Date.now() - start;

  assert.ok(elapsed < 1000, 'should complete in reasonable time');
  assert.ok(results[0].symbolBoost! > 0 || results[1].symbolBoost! > 0, 'should find matches');
});

// ============================================================================
// applySymbolBoost - Regex Cache Behavior (buildQueryTokenRegex)
// ============================================================================

test('applySymbolBoost benefits from regex cache on repeated queries', () => {
  const codemap = createCodemap({
    chunk1: { symbol: 'processData', sha: 'sha-1' },
    chunk2: { symbol: 'processInfo', sha: 'sha-2' },
  });

  // First call
  const results1 = createResults([{ id: 'chunk1', score: 0.5 }]);
  applySymbolBoost(results1 as never, { query: 'process data', codemap });

  // Second call with same tokens (should use cached regexes)
  const results2 = createResults([{ id: 'chunk2', score: 0.5 }]);
  applySymbolBoost(results2 as never, { query: 'process info', codemap });

  // Both should work correctly
  assert.ok(results1[0].symbolBoost! > 0);
  assert.ok(results2[0].symbolBoost! > 0);
});

// ============================================================================
// applySymbolBoost - Signature Weight Calculation Details
// ============================================================================

test('applySymbolBoost signature match gives weight 4 for exact symbol in query', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'abc',
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.3 }]);

  applySymbolBoost(results as never, { query: 'abc function call', codemap });

  // Weight 4 / 4 = 1.0 strength, * 0.3 signature boost = 0.3
  assert.ok(results[0].symbolMatchStrength === 1, 'full match should give strength 1');
});

test('applySymbolBoost handles signature with normalized whitespace', () => {
  const codemap = createCodemap({
    chunk1: {
      symbol: 'foo',
      symbol_signature: 'processData(  input,    output  )',
      sha: 'sha-1',
    },
  });

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  applySymbolBoost(results as never, { query: 'processdata( input, output )', codemap });

  assert.ok(results[0].symbolBoost !== undefined || results[0].score === 0.5);
});

// ============================================================================
// applySymbolBoost - Non-Object Codemap Entry Handling
// ============================================================================

test('applySymbolBoost skips codemap entries without sha', () => {
  const codemap: Codemap = {
    chunk1: {
      file: 'test.ts',
      sha: 'sha-1',
      symbol: 'validSymbol',
      symbol_neighbors: ['sha-invalid'],
    },
    chunk2: {
      file: 'test.ts',
      sha: undefined as unknown as string, // Invalid sha
      symbol: 'invalidEntry',
    },
  };

  const results = createResults([{ id: 'chunk1', score: 0.5 }]);

  // Should not throw
  applySymbolBoost(results as never, { query: 'valid symbol', codemap });

  assert.ok(typeof results[0].score === 'number');
});
