import test from 'node:test';
import assert from 'node:assert/strict';
import { reciprocalRankFusion } from '../search/hybrid.js';

// ============================================================================
// reciprocalRankFusion - Empty Input Tests
// ============================================================================

test('reciprocalRankFusion returns empty array when both inputs are empty', () => {
  const result = reciprocalRankFusion({
    vectorResults: [],
    bm25Results: [],
    limit: 10
  });

  assert.deepEqual(result, []);
});

test('reciprocalRankFusion returns empty array with default parameters', () => {
  const result = reciprocalRankFusion({});

  assert.deepEqual(result, []);
});

test('reciprocalRankFusion handles undefined vectorResults', () => {
  const result = reciprocalRankFusion({
    bm25Results: [{ id: 'b1', score: 0.8 }],
    limit: 10
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'b1');
});

test('reciprocalRankFusion handles undefined bm25Results', () => {
  const result = reciprocalRankFusion({
    vectorResults: [{ id: 'v1', score: 0.9 }],
    limit: 10
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'v1');
});

// ============================================================================
// reciprocalRankFusion - Single Source Tests
// ============================================================================

test('reciprocalRankFusion processes only vector results correctly', () => {
  const vectorResults = [
    { id: 'v1', score: 0.95 },
    { id: 'v2', score: 0.85 },
    { id: 'v3', score: 0.75 }
  ];

  const result = reciprocalRankFusion({
    vectorResults,
    bm25Results: [],
    limit: 10,
    k: 60
  });

  assert.equal(result.length, 3);

  // Check that vector ranks are set correctly
  assert.equal(result[0].vectorRank, 0);
  assert.equal(result[0].bm25Rank, null);
  assert.equal(result[0].vectorScore, 0.95);
  assert.equal(result[0].bm25Score, null);

  // First result should have highest RRF score: 1/(60+0+1) = 1/61
  const expectedScore = 1 / (60 + 0 + 1);
  assert.ok(Math.abs(result[0].score - expectedScore) < 0.0001);
});

test('reciprocalRankFusion processes only bm25 results correctly', () => {
  const bm25Results = [
    { id: 'b1', score: 12.5 },
    { id: 'b2', score: 10.2 },
    { id: 'b3', score: 8.1 }
  ];

  const result = reciprocalRankFusion({
    vectorResults: [],
    bm25Results,
    limit: 10,
    k: 60
  });

  assert.equal(result.length, 3);

  // Check that bm25 ranks are set correctly
  assert.equal(result[0].bm25Rank, 0);
  assert.equal(result[0].vectorRank, null);
  assert.equal(result[0].bm25Score, 12.5);
  assert.equal(result[0].vectorScore, null);
});

// ============================================================================
// reciprocalRankFusion - Combined Results Tests
// ============================================================================

test('reciprocalRankFusion combines vector and bm25 results', () => {
  const vectorResults = [
    { id: 'doc1', score: 0.9 },
    { id: 'doc2', score: 0.8 }
  ];

  const bm25Results = [
    { id: 'doc3', score: 15.0 },
    { id: 'doc4', score: 12.0 }
  ];

  const result = reciprocalRankFusion({
    vectorResults,
    bm25Results,
    limit: 10,
    k: 60
  });

  assert.equal(result.length, 4);

  // All results should have proper structure
  for (const item of result) {
    assert.ok(typeof item.id === 'string');
    assert.ok(typeof item.score === 'number');
    assert.ok(item.score > 0);
  }
});

test('reciprocalRankFusion boosts overlapping results', () => {
  // Same document appears in both vector and bm25 results
  const vectorResults = [
    { id: 'shared', score: 0.9 },
    { id: 'vector-only', score: 0.85 }
  ];

  const bm25Results = [
    { id: 'shared', score: 15.0 },
    { id: 'bm25-only', score: 12.0 }
  ];

  const result = reciprocalRankFusion({
    vectorResults,
    bm25Results,
    limit: 10,
    k: 60
  });

  assert.equal(result.length, 3);

  // 'shared' should have the highest score (appears in both)
  const shared = result.find((r) => r.id === 'shared');
  assert.ok(shared);
  assert.equal(shared.vectorRank, 0);
  assert.equal(shared.bm25Rank, 0);
  assert.equal(shared.vectorScore, 0.9);
  assert.equal(shared.bm25Score, 15.0);

  // RRF score for 'shared': 1/(60+0+1) + 1/(60+0+1) = 2/61
  const expectedSharedScore = 1 / 61 + 1 / 61;
  assert.ok(Math.abs(shared.score - expectedSharedScore) < 0.0001);

  // 'shared' should be first due to higher combined score
  assert.equal(result[0].id, 'shared');
});

test('reciprocalRankFusion correctly tracks ranks for overlapping items', () => {
  const vectorResults = [
    { id: 'a', score: 0.95 },
    { id: 'b', score: 0.90 },
    { id: 'c', score: 0.85 }
  ];

  const bm25Results = [
    { id: 'c', score: 20.0 }, // c is rank 0 in bm25, rank 2 in vector
    { id: 'b', score: 18.0 }, // b is rank 1 in both
    { id: 'd', score: 15.0 }
  ];

  const result = reciprocalRankFusion({
    vectorResults,
    bm25Results,
    limit: 10,
    k: 60
  });

  const itemB = result.find((r) => r.id === 'b');
  assert.ok(itemB);
  assert.equal(itemB.vectorRank, 1);
  assert.equal(itemB.bm25Rank, 1);

  const itemC = result.find((r) => r.id === 'c');
  assert.ok(itemC);
  assert.equal(itemC.vectorRank, 2);
  assert.equal(itemC.bm25Rank, 0);
});

// ============================================================================
// reciprocalRankFusion - k Parameter Tests
// ============================================================================

test('reciprocalRankFusion uses default k=60', () => {
  const vectorResults = [{ id: 'v1', score: 0.9 }];

  const result = reciprocalRankFusion({
    vectorResults,
    bm25Results: [],
    limit: 10
    // k not specified, should default to 60
  });

  // Score should be 1/(60+0+1) = 1/61
  const expectedScore = 1 / 61;
  assert.ok(Math.abs(result[0].score - expectedScore) < 0.0001);
});

test('reciprocalRankFusion respects custom k value', () => {
  const vectorResults = [{ id: 'v1', score: 0.9 }];

  const resultK10 = reciprocalRankFusion({
    vectorResults,
    bm25Results: [],
    limit: 10,
    k: 10
  });

  const resultK100 = reciprocalRankFusion({
    vectorResults,
    bm25Results: [],
    limit: 10,
    k: 100
  });

  // Score with k=10: 1/(10+0+1) = 1/11
  const expectedK10 = 1 / 11;
  assert.ok(Math.abs(resultK10[0].score - expectedK10) < 0.0001);

  // Score with k=100: 1/(100+0+1) = 1/101
  const expectedK100 = 1 / 101;
  assert.ok(Math.abs(resultK100[0].score - expectedK100) < 0.0001);

  // Higher k should result in lower scores
  assert.ok(resultK10[0].score > resultK100[0].score);
});

test('reciprocalRankFusion rank contribution decreases with position', () => {
  const vectorResults = [
    { id: 'rank0', score: 0.9 },
    { id: 'rank1', score: 0.8 },
    { id: 'rank2', score: 0.7 }
  ];

  const result = reciprocalRankFusion({
    vectorResults,
    bm25Results: [],
    limit: 10,
    k: 60
  });

  // Verify scores decrease with rank
  assert.ok(result[0].score > result[1].score);
  assert.ok(result[1].score > result[2].score);

  // Verify specific RRF scores
  // rank 0: 1/61, rank 1: 1/62, rank 2: 1/63
  assert.ok(Math.abs(result[0].score - 1 / 61) < 0.0001);
  assert.ok(Math.abs(result[1].score - 1 / 62) < 0.0001);
  assert.ok(Math.abs(result[2].score - 1 / 63) < 0.0001);
});

// ============================================================================
// reciprocalRankFusion - Limit Parameter Tests
// ============================================================================

test('reciprocalRankFusion respects limit parameter', () => {
  const vectorResults = Array.from({ length: 20 }, (_, i) => ({
    id: `v${i}`,
    score: 1 - i * 0.01
  }));

  const result = reciprocalRankFusion({
    vectorResults,
    bm25Results: [],
    limit: 5
  });

  assert.equal(result.length, 5);
});

test('reciprocalRankFusion uses default limit of 10', () => {
  const vectorResults = Array.from({ length: 20 }, (_, i) => ({
    id: `v${i}`,
    score: 1 - i * 0.01
  }));

  const result = reciprocalRankFusion({
    vectorResults,
    bm25Results: []
    // limit not specified, should default to 10
  });

  assert.equal(result.length, 10);
});

test('reciprocalRankFusion returns all results when under limit', () => {
  const vectorResults = [
    { id: 'v1', score: 0.9 },
    { id: 'v2', score: 0.8 }
  ];

  const result = reciprocalRankFusion({
    vectorResults,
    bm25Results: [],
    limit: 100
  });

  assert.equal(result.length, 2);
});

// ============================================================================
// reciprocalRankFusion - Sorting Tests
// ============================================================================

test('reciprocalRankFusion sorts by score descending', () => {
  const vectorResults = [
    { id: 'low', score: 0.5 },
    { id: 'high', score: 0.9 },
    { id: 'medium', score: 0.7 }
  ];

  const result = reciprocalRankFusion({
    vectorResults,
    bm25Results: [],
    limit: 10,
    k: 60
  });

  // Results should be sorted by score descending
  for (let i = 1; i < result.length; i++) {
    assert.ok(result[i - 1].score >= result[i].score);
  }
});

test('reciprocalRankFusion uses vectorRank as tiebreaker', () => {
  // Two items with same RRF score - should be broken by vectorRank
  const vectorResults = [
    { id: 'a', score: 0.9 } // vectorRank 0
  ];

  const bm25Results = [
    { id: 'b', score: 15.0 } // bm25Rank 0
  ];

  // Both have score 1/61 but 'a' has vectorRank 0, 'b' has vectorRank null (MAX_SAFE_INTEGER)
  const result = reciprocalRankFusion({
    vectorResults,
    bm25Results,
    limit: 10,
    k: 60
  });

  assert.equal(result.length, 2);
  // 'a' should come first because it has a better vectorRank (0 vs null)
  assert.equal(result[0].id, 'a');
  assert.equal(result[1].id, 'b');
});

test('reciprocalRankFusion uses bm25Rank as secondary tiebreaker', () => {
  // Both items have no vector rank, so bm25Rank should be used
  const bm25Results = [
    { id: 'first', score: 15.0 }, // bm25Rank 0
    { id: 'second', score: 15.0 } // bm25Rank 1
  ];

  const result = reciprocalRankFusion({
    vectorResults: [],
    bm25Results,
    limit: 10,
    k: 60
  });

  // Same RRF score, no vector rank, 'first' has bm25Rank 0, 'second' has bm25Rank 1
  // But they have different RRF scores (1/61 vs 1/62), so sort by score
  assert.equal(result[0].id, 'first');
  assert.equal(result[1].id, 'second');
});

// ============================================================================
// reciprocalRankFusion - Invalid Input Handling Tests
// ============================================================================

test('reciprocalRankFusion handles null items in results array', () => {
  const vectorResults = [
    { id: 'v1', score: 0.9 },
    null as unknown as { id: string; score: number },
    { id: 'v2', score: 0.8 }
  ];

  const result = reciprocalRankFusion({
    vectorResults,
    bm25Results: [],
    limit: 10
  });

  // Should skip null items
  assert.equal(result.length, 2);
  assert.ok(result.some((r) => r.id === 'v1'));
  assert.ok(result.some((r) => r.id === 'v2'));
});

test('reciprocalRankFusion handles items with undefined id', () => {
  const vectorResults = [
    { id: 'v1', score: 0.9 },
    { id: undefined as unknown as string, score: 0.85 },
    { id: 'v2', score: 0.8 }
  ];

  const result = reciprocalRankFusion({
    vectorResults,
    bm25Results: [],
    limit: 10
  });

  // Should skip item with undefined id
  assert.equal(result.length, 2);
});

// ============================================================================
// reciprocalRankFusion - Complex Scenarios Tests
// ============================================================================

test('reciprocalRankFusion handles large result sets', () => {
  const vectorResults = Array.from({ length: 100 }, (_, i) => ({
    id: `v${i}`,
    score: 1 - i * 0.005
  }));

  const bm25Results = Array.from({ length: 100 }, (_, i) => ({
    id: `b${i}`,
    score: 50 - i * 0.5
  }));

  const result = reciprocalRankFusion({
    vectorResults,
    bm25Results,
    limit: 50,
    k: 60
  });

  assert.equal(result.length, 50);
  // All results should have valid structure
  for (const item of result) {
    assert.ok(typeof item.id === 'string');
    assert.ok(typeof item.score === 'number');
    assert.ok(item.score > 0);
  }
});

test('reciprocalRankFusion with partially overlapping results', () => {
  // 3 in vector only, 3 in bm25 only, 2 shared
  const vectorResults = [
    { id: 'shared1', score: 0.95 },
    { id: 'v1', score: 0.90 },
    { id: 'shared2', score: 0.85 },
    { id: 'v2', score: 0.80 },
    { id: 'v3', score: 0.75 }
  ];

  const bm25Results = [
    { id: 'b1', score: 20.0 },
    { id: 'shared1', score: 18.0 },
    { id: 'b2', score: 16.0 },
    { id: 'shared2', score: 14.0 },
    { id: 'b3', score: 12.0 }
  ];

  const result = reciprocalRankFusion({
    vectorResults,
    bm25Results,
    limit: 20,
    k: 60
  });

  // Total unique ids: 3 (v-only) + 3 (bm25-only) + 2 (shared) = 8
  assert.equal(result.length, 8);

  // Shared items should have higher scores due to double contribution
  const shared1 = result.find((r) => r.id === 'shared1');
  const vOnly = result.find((r) => r.id === 'v1');

  assert.ok(shared1);
  assert.ok(vOnly);
  // shared1 appears in both with good ranks, should score higher
  assert.ok(shared1.score > vOnly.score);
});

test('reciprocalRankFusion preserves original scores in vectorScore and bm25Score', () => {
  const vectorResults = [{ id: 'doc1', score: 0.9876 }];
  const bm25Results = [{ id: 'doc1', score: 23.456 }];

  const result = reciprocalRankFusion({
    vectorResults,
    bm25Results,
    limit: 10
  });

  assert.equal(result[0].vectorScore, 0.9876);
  assert.equal(result[0].bm25Score, 23.456);
});

test('reciprocalRankFusion computes correct RRF formula', () => {
  // Test the RRF formula: 1 / (k + rank + 1)
  // With k=60:
  // - rank 0: 1/61 = 0.016393...
  // - rank 1: 1/62 = 0.016129...
  // - rank 2: 1/63 = 0.015873...

  const vectorResults = [
    { id: 'a', score: 0.9 }, // rank 0
    { id: 'b', score: 0.8 }, // rank 1
    { id: 'c', score: 0.7 } // rank 2
  ];

  const bm25Results = [
    { id: 'c', score: 15.0 }, // rank 0 in bm25
    { id: 'a', score: 12.0 } // rank 1 in bm25
  ];

  const result = reciprocalRankFusion({
    vectorResults,
    bm25Results,
    limit: 10,
    k: 60
  });

  // Find results for verification
  const itemA = result.find((r) => r.id === 'a');
  const itemB = result.find((r) => r.id === 'b');
  const itemC = result.find((r) => r.id === 'c');

  assert.ok(itemA);
  assert.ok(itemB);
  assert.ok(itemC);

  // a: vector rank 0, bm25 rank 1 => 1/61 + 1/62
  const expectedA = 1 / 61 + 1 / 62;
  assert.ok(Math.abs(itemA.score - expectedA) < 0.0001);

  // b: vector rank 1 only => 1/62
  const expectedB = 1 / 62;
  assert.ok(Math.abs(itemB.score - expectedB) < 0.0001);

  // c: vector rank 2, bm25 rank 0 => 1/63 + 1/61
  const expectedC = 1 / 63 + 1 / 61;
  assert.ok(Math.abs(itemC.score - expectedC) < 0.0001);
});
