import test from 'node:test';
import assert from 'node:assert/strict';
import { applySymbolBoost } from '../ranking/symbol-boost.js';
import type { Codemap } from '../types/codemap.js';

interface MockSearchResult {
  id: string;
  score: number;
  symbolBoost?: number;
}

test('applySymbolBoost caps total score at or below 1.0', () => {
  const codemap: Codemap = {
    chunk1: {
      file: 'src/example.ts',
      symbol: 'processPayment',
      sha: 'sha-1',
      lang: 'typescript',
      symbol_neighbors: []
    }
  };

  const results: MockSearchResult[] = [
    { id: 'chunk1', score: 0.9, symbolBoost: 0 }
  ];

  applySymbolBoost(results as unknown as Parameters<typeof applySymbolBoost>[0], { query: 'process payment', codemap });

  assert.ok(results[0].score <= 1, 'score should not exceed 1.0');
  assert.ok((results[0].symbolBoost ?? 0) <= 0.45, 'boost should respect cap');
});
