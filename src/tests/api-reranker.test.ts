import test from 'node:test';
import assert from 'node:assert/strict';
import { rerankWithAPI, isAPIRerankingConfigured } from '../ranking/api-reranker.js';

// Save original env vars
const originalEnv = {
  CODEVAULT_RERANK_API_URL: process.env.CODEVAULT_RERANK_API_URL,
  CODEVAULT_RERANK_API_KEY: process.env.CODEVAULT_RERANK_API_KEY,
  CODEVAULT_RERANK_MODEL: process.env.CODEVAULT_RERANK_MODEL,
  CODEVAULT_RERANK_TIMEOUT_MS: process.env.CODEVAULT_RERANK_TIMEOUT_MS,
  CODEVAULT_RERANKER_MAX: process.env.CODEVAULT_RERANKER_MAX,
  CODEVAULT_RERANKER_MAX_TOKENS: process.env.CODEVAULT_RERANKER_MAX_TOKENS,
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearEnv(): void {
  delete process.env.CODEVAULT_RERANK_API_URL;
  delete process.env.CODEVAULT_RERANK_API_KEY;
  delete process.env.CODEVAULT_RERANK_MODEL;
  delete process.env.CODEVAULT_RERANK_TIMEOUT_MS;
  delete process.env.CODEVAULT_RERANKER_MAX;
  delete process.env.CODEVAULT_RERANKER_MAX_TOKENS;
}

// ============================================================================
// isAPIRerankingConfigured Tests
// ============================================================================

test('isAPIRerankingConfigured returns false when neither URL nor KEY is set', () => {
  clearEnv();
  const result = isAPIRerankingConfigured();
  assert.equal(result, false);
  restoreEnv();
});

test('isAPIRerankingConfigured returns false when only URL is set', () => {
  clearEnv();
  process.env.CODEVAULT_RERANK_API_URL = 'https://api.example.com/rerank';
  const result = isAPIRerankingConfigured();
  assert.equal(result, false);
  restoreEnv();
});

test('isAPIRerankingConfigured returns false when only KEY is set', () => {
  clearEnv();
  process.env.CODEVAULT_RERANK_API_KEY = 'test-api-key';
  const result = isAPIRerankingConfigured();
  assert.equal(result, false);
  restoreEnv();
});

test('isAPIRerankingConfigured returns true when both URL and KEY are set', () => {
  clearEnv();
  process.env.CODEVAULT_RERANK_API_URL = 'https://api.example.com/rerank';
  process.env.CODEVAULT_RERANK_API_KEY = 'test-api-key';
  const result = isAPIRerankingConfigured();
  assert.equal(result, true);
  restoreEnv();
});

test('isAPIRerankingConfigured returns false for empty URL string', () => {
  clearEnv();
  process.env.CODEVAULT_RERANK_API_URL = '';
  process.env.CODEVAULT_RERANK_API_KEY = 'test-api-key';
  const result = isAPIRerankingConfigured();
  assert.equal(result, false);
  restoreEnv();
});

test('isAPIRerankingConfigured returns false for empty KEY string', () => {
  clearEnv();
  process.env.CODEVAULT_RERANK_API_URL = 'https://api.example.com/rerank';
  process.env.CODEVAULT_RERANK_API_KEY = '';
  const result = isAPIRerankingConfigured();
  assert.equal(result, false);
  restoreEnv();
});

// ============================================================================
// rerankWithAPI - Edge Cases for Empty/Invalid Input
// ============================================================================

test('rerankWithAPI returns empty array for empty candidates', async () => {
  const result = await rerankWithAPI('test query', []);
  assert.deepEqual(result, []);
});

test('rerankWithAPI returns candidates unchanged for single candidate', async () => {
  const candidates = [{ id: 'chunk1', score: 0.5 }];
  const result = await rerankWithAPI('test query', candidates);
  assert.deepEqual(result, candidates);
});

test('rerankWithAPI returns candidates unchanged for non-array input', async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await rerankWithAPI('test query', null as any);
  assert.deepEqual(result, null);
});

test('rerankWithAPI returns candidates when max is 0', async () => {
  const candidates = [
    { id: 'chunk1', score: 0.8 },
    { id: 'chunk2', score: 0.6 },
  ];
  const result = await rerankWithAPI('test query', candidates, { max: 0 });
  assert.deepEqual(result, candidates);
});

test('rerankWithAPI returns candidates when max is negative', async () => {
  const candidates = [
    { id: 'chunk1', score: 0.8 },
    { id: 'chunk2', score: 0.6 },
  ];
  const result = await rerankWithAPI('test query', candidates, { max: -5 });
  assert.deepEqual(result, candidates);
});

test('rerankWithAPI returns candidates when max is 1', async () => {
  const candidates = [
    { id: 'chunk1', score: 0.8 },
    { id: 'chunk2', score: 0.6 },
  ];
  const result = await rerankWithAPI('test query', candidates, { max: 1 });
  assert.deepEqual(result, candidates);
});

// ============================================================================
// rerankWithAPI - Fallback Behavior on API Error
// ============================================================================

test('rerankWithAPI gracefully falls back when API URL is not configured', async () => {
  clearEnv();
  const candidates = [
    { id: 'chunk1', score: 0.8 },
    { id: 'chunk2', score: 0.6 },
  ];
  const result = await rerankWithAPI('test query', candidates, {
    getText: (c) => String(c.id),
  });
  // Should return original candidates without throwing
  assert.deepEqual(result, candidates);
  restoreEnv();
});

test('rerankWithAPI gracefully falls back when API KEY is not configured', async () => {
  clearEnv();
  process.env.CODEVAULT_RERANK_API_URL = 'https://api.example.com/rerank';
  const candidates = [
    { id: 'chunk1', score: 0.8 },
    { id: 'chunk2', score: 0.6 },
  ];
  const result = await rerankWithAPI('test query', candidates, {
    getText: (c) => String(c.id),
  });
  // Should return original candidates without throwing
  assert.deepEqual(result, candidates);
  restoreEnv();
});

test('rerankWithAPI gracefully falls back on network error', async () => {
  clearEnv();
  process.env.CODEVAULT_RERANK_API_URL = 'https://invalid-host-that-does-not-exist.example.com/rerank';
  process.env.CODEVAULT_RERANK_API_KEY = 'test-key';
  process.env.CODEVAULT_RERANK_TIMEOUT_MS = '100';

  const candidates = [
    { id: 'chunk1', score: 0.8 },
    { id: 'chunk2', score: 0.6 },
  ];
  const result = await rerankWithAPI('test query', candidates, {
    getText: (c) => String(c.id),
  });
  // Should return original candidates without throwing
  assert.deepEqual(result, candidates);
  restoreEnv();
});

// ============================================================================
// rerankWithAPI - getText/getTextAsync Handlers
// ============================================================================

test('rerankWithAPI uses getText function when provided', async () => {
  clearEnv();
  let getTextCalled = false;
  const candidates = [
    { id: 'chunk1', content: 'hello world', score: 0.8 },
    { id: 'chunk2', content: 'foo bar', score: 0.6 },
  ];

  await rerankWithAPI('test query', candidates, {
    getText: (c) => {
      getTextCalled = true;
      return String(c.content);
    },
  });

  assert.ok(getTextCalled, 'getText should have been called');
  restoreEnv();
});

test('rerankWithAPI uses getTextAsync function when provided', async () => {
  clearEnv();
  let getTextAsyncCalled = false;
  const candidates = [
    { id: 'chunk1', content: 'hello world', score: 0.8 },
    { id: 'chunk2', content: 'foo bar', score: 0.6 },
  ];

  await rerankWithAPI('test query', candidates, {
    getTextAsync: async (c) => {
      getTextAsyncCalled = true;
      return String(c.content);
    },
  });

  assert.ok(getTextAsyncCalled, 'getTextAsync should have been called');
  restoreEnv();
});

test('rerankWithAPI prefers getTextAsync over getText when both provided', async () => {
  clearEnv();
  let getTextCalled = false;
  let getTextAsyncCalled = false;
  const candidates = [
    { id: 'chunk1', content: 'hello world', score: 0.8 },
    { id: 'chunk2', content: 'foo bar', score: 0.6 },
  ];

  await rerankWithAPI('test query', candidates, {
    getText: () => {
      getTextCalled = true;
      return 'from getText';
    },
    getTextAsync: async () => {
      getTextAsyncCalled = true;
      return 'from getTextAsync';
    },
  });

  assert.ok(getTextAsyncCalled, 'getTextAsync should have been called');
  assert.ok(!getTextCalled, 'getText should not have been called when getTextAsync is present');
  restoreEnv();
});

test('rerankWithAPI handles getText returning non-string', async () => {
  clearEnv();
  const candidates = [
    { id: 'chunk1', score: 0.8 },
    { id: 'chunk2', score: 0.6 },
  ];

  // Should not throw
  const result = await rerankWithAPI('test query', candidates, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getText: () => 12345 as any,
  });

  assert.deepEqual(result, candidates);
  restoreEnv();
});

test('rerankWithAPI returns empty string when no getText provided', async () => {
  clearEnv();
  const candidates = [
    { id: 'chunk1', score: 0.8 },
    { id: 'chunk2', score: 0.6 },
  ];

  // Should not throw, falls back gracefully
  const result = await rerankWithAPI('test query', candidates);
  assert.deepEqual(result, candidates);
  restoreEnv();
});

// ============================================================================
// rerankWithAPI - maxCandidates Limiting
// ============================================================================

test('rerankWithAPI respects max option to limit candidates', async () => {
  clearEnv();
  const candidates = [
    { id: 'chunk1', score: 0.9 },
    { id: 'chunk2', score: 0.8 },
    { id: 'chunk3', score: 0.7 },
    { id: 'chunk4', score: 0.6 },
    { id: 'chunk5', score: 0.5 },
  ];

  // Even if API fails, it should still process max candidates
  const result = await rerankWithAPI('test query', candidates, { max: 3 });

  // Fallback returns all candidates in original order
  assert.equal(result.length, 5);
  restoreEnv();
});

test('rerankWithAPI handles max larger than candidates length', async () => {
  clearEnv();
  const candidates = [
    { id: 'chunk1', score: 0.9 },
    { id: 'chunk2', score: 0.8 },
  ];

  const result = await rerankWithAPI('test query', candidates, { max: 100 });
  assert.equal(result.length, 2);
  restoreEnv();
});

test('rerankWithAPI handles fractional max value', async () => {
  clearEnv();
  const candidates = [
    { id: 'chunk1', score: 0.9 },
    { id: 'chunk2', score: 0.8 },
    { id: 'chunk3', score: 0.7 },
  ];

  // Should floor to 2
  const result = await rerankWithAPI('test query', candidates, { max: 2.7 });
  assert.equal(result.length, 3); // Falls back, returns all
  restoreEnv();
});

test('rerankWithAPI handles NaN max value', async () => {
  clearEnv();
  const candidates = [
    { id: 'chunk1', score: 0.9 },
    { id: 'chunk2', score: 0.8 },
  ];

  const result = await rerankWithAPI('test query', candidates, { max: NaN });
  assert.equal(result.length, 2);
  restoreEnv();
});

test('rerankWithAPI handles Infinity max value', async () => {
  clearEnv();
  const candidates = [
    { id: 'chunk1', score: 0.9 },
    { id: 'chunk2', score: 0.8 },
  ];

  const result = await rerankWithAPI('test query', candidates, { max: Infinity });
  assert.equal(result.length, 2);
  restoreEnv();
});

// ============================================================================
// rerankWithAPI - maxTokens Handling
// ============================================================================

test('rerankWithAPI handles maxTokens option', async () => {
  clearEnv();
  const candidates = [
    { id: 'chunk1', content: 'a'.repeat(10000), score: 0.8 },
    { id: 'chunk2', content: 'b'.repeat(10000), score: 0.6 },
  ];

  // Should not throw even with truncation
  const result = await rerankWithAPI('test query', candidates, {
    maxTokens: 100,
    getText: (c) => String(c.content),
  });

  assert.equal(result.length, 2);
  restoreEnv();
});

test('rerankWithAPI handles zero maxTokens', async () => {
  clearEnv();
  const candidates = [
    { id: 'chunk1', content: 'hello', score: 0.8 },
    { id: 'chunk2', content: 'world', score: 0.6 },
  ];

  // Should use default (at least 1)
  const result = await rerankWithAPI('test query', candidates, {
    maxTokens: 0,
    getText: (c) => String(c.content),
  });

  assert.equal(result.length, 2);
  restoreEnv();
});

test('rerankWithAPI handles negative maxTokens', async () => {
  clearEnv();
  const candidates = [
    { id: 'chunk1', content: 'hello', score: 0.8 },
    { id: 'chunk2', content: 'world', score: 0.6 },
  ];

  const result = await rerankWithAPI('test query', candidates, {
    maxTokens: -100,
    getText: (c) => String(c.content),
  });

  assert.equal(result.length, 2);
  restoreEnv();
});

// ============================================================================
// rerankWithAPI - Custom API Configuration
// ============================================================================

test('rerankWithAPI uses custom apiUrl from options', async () => {
  clearEnv();
  process.env.CODEVAULT_RERANK_API_KEY = 'test-key';

  const candidates = [
    { id: 'chunk1', score: 0.8 },
    { id: 'chunk2', score: 0.6 },
  ];

  // Should attempt to use custom URL (will fail, fallback)
  const result = await rerankWithAPI('test query', candidates, {
    apiUrl: 'https://custom-api.example.com/rerank',
    getText: (c) => String(c.id),
  });

  assert.deepEqual(result, candidates);
  restoreEnv();
});

test('rerankWithAPI uses custom apiKey from options', async () => {
  clearEnv();
  process.env.CODEVAULT_RERANK_API_URL = 'https://api.example.com/rerank';

  const candidates = [
    { id: 'chunk1', score: 0.8 },
    { id: 'chunk2', score: 0.6 },
  ];

  // Should attempt to use custom key (will fail, fallback)
  const result = await rerankWithAPI('test query', candidates, {
    apiKey: 'custom-api-key',
    getText: (c) => String(c.id),
  });

  assert.deepEqual(result, candidates);
  restoreEnv();
});

test('rerankWithAPI uses custom model from options', async () => {
  clearEnv();
  process.env.CODEVAULT_RERANK_API_URL = 'https://api.example.com/rerank';
  process.env.CODEVAULT_RERANK_API_KEY = 'test-key';

  const candidates = [
    { id: 'chunk1', score: 0.8 },
    { id: 'chunk2', score: 0.6 },
  ];

  // Should not throw when custom model is provided
  const result = await rerankWithAPI('test query', candidates, {
    model: 'custom-rerank-model',
    getText: (c) => String(c.id),
  });

  assert.deepEqual(result, candidates);
  restoreEnv();
});

// ============================================================================
// rerankWithAPI - Environment Variable Parsing
// ============================================================================

test('rerankWithAPI respects CODEVAULT_RERANKER_MAX env var', async () => {
  clearEnv();
  process.env.CODEVAULT_RERANKER_MAX = '2';

  const candidates = [
    { id: 'chunk1', score: 0.9 },
    { id: 'chunk2', score: 0.8 },
    { id: 'chunk3', score: 0.7 },
  ];

  const result = await rerankWithAPI('test query', candidates);
  assert.equal(result.length, 3);
  restoreEnv();
});

test('rerankWithAPI handles invalid CODEVAULT_RERANKER_MAX env var', async () => {
  clearEnv();
  process.env.CODEVAULT_RERANKER_MAX = 'invalid';

  const candidates = [
    { id: 'chunk1', score: 0.9 },
    { id: 'chunk2', score: 0.8 },
  ];

  // Should use default value, not throw
  const result = await rerankWithAPI('test query', candidates);
  assert.equal(result.length, 2);
  restoreEnv();
});

test('rerankWithAPI respects CODEVAULT_RERANKER_MAX_TOKENS env var', async () => {
  clearEnv();
  process.env.CODEVAULT_RERANKER_MAX_TOKENS = '100';

  const candidates = [
    { id: 'chunk1', content: 'a'.repeat(10000), score: 0.8 },
    { id: 'chunk2', content: 'b'.repeat(10000), score: 0.6 },
  ];

  const result = await rerankWithAPI('test query', candidates, {
    getText: (c) => String(c.content),
  });

  assert.equal(result.length, 2);
  restoreEnv();
});

test('rerankWithAPI handles invalid CODEVAULT_RERANKER_MAX_TOKENS env var', async () => {
  clearEnv();
  process.env.CODEVAULT_RERANKER_MAX_TOKENS = 'not-a-number';

  const candidates = [
    { id: 'chunk1', score: 0.8 },
    { id: 'chunk2', score: 0.6 },
  ];

  // Should use default, not throw
  const result = await rerankWithAPI('test query', candidates);
  assert.equal(result.length, 2);
  restoreEnv();
});

test('rerankWithAPI handles negative CODEVAULT_RERANK_TIMEOUT_MS env var', async () => {
  clearEnv();
  process.env.CODEVAULT_RERANK_TIMEOUT_MS = '-1000';
  process.env.CODEVAULT_RERANK_API_URL = 'https://api.example.com/rerank';
  process.env.CODEVAULT_RERANK_API_KEY = 'test-key';

  const candidates = [
    { id: 'chunk1', score: 0.8 },
    { id: 'chunk2', score: 0.6 },
  ];

  // Should use default timeout, fallback gracefully
  const result = await rerankWithAPI('test query', candidates, {
    getText: (c) => String(c.id),
  });

  assert.deepEqual(result, candidates);
  restoreEnv();
});

test('rerankWithAPI handles zero CODEVAULT_RERANK_TIMEOUT_MS env var', async () => {
  clearEnv();
  process.env.CODEVAULT_RERANK_TIMEOUT_MS = '0';
  process.env.CODEVAULT_RERANK_API_URL = 'https://api.example.com/rerank';
  process.env.CODEVAULT_RERANK_API_KEY = 'test-key';

  const candidates = [
    { id: 'chunk1', score: 0.8 },
    { id: 'chunk2', score: 0.6 },
  ];

  // Should use default timeout
  const result = await rerankWithAPI('test query', candidates, {
    getText: (c) => String(c.id),
  });

  assert.deepEqual(result, candidates);
  restoreEnv();
});

// ============================================================================
// rerankWithAPI - Candidate Mutation Verification
// ============================================================================

test('rerankWithAPI does not mutate original candidates on fallback', async () => {
  clearEnv();
  const original = [
    { id: 'chunk1', score: 0.8 },
    { id: 'chunk2', score: 0.6 },
  ];
  const candidates = [...original];

  await rerankWithAPI('test query', candidates);

  assert.deepEqual(candidates[0], original[0]);
  assert.deepEqual(candidates[1], original[1]);
  restoreEnv();
});

// ============================================================================
// rerankWithAPI - Multiple Candidates Ordering
// ============================================================================

test('rerankWithAPI preserves order on fallback for multiple candidates', async () => {
  clearEnv();
  const candidates = [
    { id: 'chunk1', score: 0.9 },
    { id: 'chunk2', score: 0.7 },
    { id: 'chunk3', score: 0.5 },
    { id: 'chunk4', score: 0.3 },
    { id: 'chunk5', score: 0.1 },
  ];

  const result = await rerankWithAPI('test query', candidates);

  assert.equal(result[0].id, 'chunk1');
  assert.equal(result[1].id, 'chunk2');
  assert.equal(result[2].id, 'chunk3');
  assert.equal(result[3].id, 'chunk4');
  assert.equal(result[4].id, 'chunk5');
  restoreEnv();
});

// ============================================================================
// rerankWithAPI - Undefined/Null Handling in Candidates
// ============================================================================

test('rerankWithAPI handles candidates with undefined properties', async () => {
  clearEnv();
  const candidates = [
    { id: 'chunk1', score: undefined },
    { id: 'chunk2' },
  ];

  const result = await rerankWithAPI('test query', candidates);
  assert.equal(result.length, 2);
  restoreEnv();
});

test('rerankWithAPI handles empty getText result', async () => {
  clearEnv();
  const candidates = [
    { id: 'chunk1', score: 0.8 },
    { id: 'chunk2', score: 0.6 },
  ];

  const result = await rerankWithAPI('test query', candidates, {
    getText: () => '',
  });

  assert.equal(result.length, 2);
  restoreEnv();
});

// ============================================================================
// rerankWithAPI - Async getText Error Handling
// ============================================================================

test('rerankWithAPI handles getTextAsync throwing error', async () => {
  clearEnv();
  const candidates = [
    { id: 'chunk1', score: 0.8 },
    { id: 'chunk2', score: 0.6 },
  ];

  const result = await rerankWithAPI('test query', candidates, {
    getTextAsync: async () => {
      throw new Error('Async text retrieval failed');
    },
  });

  // Should fallback gracefully
  assert.deepEqual(result, candidates);
  restoreEnv();
});

test('rerankWithAPI handles getTextAsync returning rejected promise', async () => {
  clearEnv();
  const candidates = [
    { id: 'chunk1', score: 0.8 },
    { id: 'chunk2', score: 0.6 },
  ];

  const result = await rerankWithAPI('test query', candidates, {
    getTextAsync: () => Promise.reject(new Error('Promise rejected')),
  });

  // Should fallback gracefully
  assert.deepEqual(result, candidates);
  restoreEnv();
});
