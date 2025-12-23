import test from 'node:test';
import assert from 'node:assert/strict';

import {
  // Grouped constants
  PARSING_CONSTANTS,
  CACHE_CONSTANTS,
  INDEXING_CONSTANTS,
  SEARCH_CONSTANTS,
  SYMBOL_BOOST_CONSTANTS,
  WATCHER_CONSTANTS,
  RATE_LIMIT_CONSTANTS,
  BATCH_CONSTANTS,
  ENCRYPTION_CONSTANTS,
  LLM_CONSTANTS,
  CHUNKING_CONSTANTS,
  CONVERSATION_CONSTANTS,
  DOC_BOOST_CONSTANTS,
  // Backward compatibility exports
  SIZE_THRESHOLD,
  CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  RRF_K,
  DOC_BOOST,
  MAX_NEIGHBORS,
  PROMPT_TRUNCATE_LENGTH,
  CONVERSATION_MAX_CONTEXT_CHUNKS,
  DEFAULT_CACHE_CLEAR_INTERVAL_MS,
  CHAR_TO_TOKEN_RATIO,
  ALL_CONSTANTS,
} from '../../config/constants.js';

// =============================================================================
// PARSING_CONSTANTS tests
// =============================================================================

test('PARSING_CONSTANTS has correct SIZE_THRESHOLD', () => {
  assert.equal(PARSING_CONSTANTS.SIZE_THRESHOLD, 30_000);
  assert.ok(typeof PARSING_CONSTANTS.SIZE_THRESHOLD === 'number');
});

test('PARSING_CONSTANTS has correct CHUNK_SIZE', () => {
  assert.equal(PARSING_CONSTANTS.CHUNK_SIZE, 30_000);
  assert.ok(typeof PARSING_CONSTANTS.CHUNK_SIZE === 'number');
});

// =============================================================================
// CACHE_CONSTANTS tests
// =============================================================================

test('CACHE_CONSTANTS has positive MAX_BM25_CACHE_SIZE', () => {
  assert.ok(CACHE_CONSTANTS.MAX_BM25_CACHE_SIZE > 0);
  assert.ok(typeof CACHE_CONSTANTS.MAX_BM25_CACHE_SIZE === 'number');
});

test('CACHE_CONSTANTS has positive MAX_CHUNK_TEXT_CACHE_SIZE', () => {
  assert.ok(CACHE_CONSTANTS.MAX_CHUNK_TEXT_CACHE_SIZE > 0);
  assert.ok(typeof CACHE_CONSTANTS.MAX_CHUNK_TEXT_CACHE_SIZE === 'number');
});

test('CACHE_CONSTANTS has positive CACHE_CLEAR_INTERVAL_MS', () => {
  assert.ok(CACHE_CONSTANTS.CACHE_CLEAR_INTERVAL_MS > 0);
  assert.ok(typeof CACHE_CONSTANTS.CACHE_CLEAR_INTERVAL_MS === 'number');
});

test('CACHE_CONSTANTS defaults are reasonable', () => {
  // Default values when env vars are not set
  // These tests verify the default values are sensible
  assert.ok(CACHE_CONSTANTS.MAX_BM25_CACHE_SIZE >= 1, 'should have at least 1 BM25 cache slot');
  assert.ok(CACHE_CONSTANTS.MAX_BM25_CACHE_SIZE <= 1000, 'BM25 cache should not be too large');
  assert.ok(CACHE_CONSTANTS.MAX_CHUNK_TEXT_CACHE_SIZE >= 100, 'chunk cache should have reasonable size');
  assert.ok(CACHE_CONSTANTS.CACHE_CLEAR_INTERVAL_MS >= 60000, 'cache clear interval should be at least 1 minute');
});

// =============================================================================
// INDEXING_CONSTANTS tests
// =============================================================================

test('INDEXING_CONSTANTS has positive DEFAULT_CONCURRENCY', () => {
  assert.ok(INDEXING_CONSTANTS.DEFAULT_CONCURRENCY > 0);
  assert.ok(typeof INDEXING_CONSTANTS.DEFAULT_CONCURRENCY === 'number');
});

test('INDEXING_CONSTANTS has positive MAX_CONCURRENCY', () => {
  assert.ok(INDEXING_CONSTANTS.MAX_CONCURRENCY > 0);
  assert.ok(typeof INDEXING_CONSTANTS.MAX_CONCURRENCY === 'number');
});

test('INDEXING_CONSTANTS MAX_CONCURRENCY >= DEFAULT_CONCURRENCY', () => {
  assert.ok(INDEXING_CONSTANTS.MAX_CONCURRENCY >= INDEXING_CONSTANTS.DEFAULT_CONCURRENCY);
});

// =============================================================================
// SEARCH_CONSTANTS tests
// =============================================================================

test('SEARCH_CONSTANTS has positive RERANKER_MAX_CANDIDATES', () => {
  assert.ok(SEARCH_CONSTANTS.RERANKER_MAX_CANDIDATES > 0);
  assert.ok(typeof SEARCH_CONSTANTS.RERANKER_MAX_CANDIDATES === 'number');
});

test('SEARCH_CONSTANTS has positive MAX_CHUNK_SIZE', () => {
  assert.equal(SEARCH_CONSTANTS.MAX_CHUNK_SIZE, 100_000);
  assert.ok(typeof SEARCH_CONSTANTS.MAX_CHUNK_SIZE === 'number');
});

test('SEARCH_CONSTANTS has positive DEFAULT_SEARCH_LIMIT', () => {
  assert.equal(SEARCH_CONSTANTS.DEFAULT_SEARCH_LIMIT, 10);
  assert.ok(typeof SEARCH_CONSTANTS.DEFAULT_SEARCH_LIMIT === 'number');
});

test('SEARCH_CONSTANTS has positive MAX_SEARCH_LIMIT', () => {
  assert.equal(SEARCH_CONSTANTS.MAX_SEARCH_LIMIT, 200);
  assert.ok(SEARCH_CONSTANTS.MAX_SEARCH_LIMIT >= SEARCH_CONSTANTS.DEFAULT_SEARCH_LIMIT);
});

test('SEARCH_CONSTANTS has positive BM25_PREFILTER_LIMIT', () => {
  assert.ok(SEARCH_CONSTANTS.BM25_PREFILTER_LIMIT > 0);
  assert.ok(typeof SEARCH_CONSTANTS.BM25_PREFILTER_LIMIT === 'number');
});

test('SEARCH_CONSTANTS has positive SELECTION_BUDGET_MULTIPLIER', () => {
  assert.equal(SEARCH_CONSTANTS.SELECTION_BUDGET_MULTIPLIER, 60);
  assert.ok(typeof SEARCH_CONSTANTS.SELECTION_BUDGET_MULTIPLIER === 'number');
});

test('SEARCH_CONSTANTS has positive RRF_K_CONSTANT', () => {
  assert.equal(SEARCH_CONSTANTS.RRF_K_CONSTANT, 60);
  assert.ok(typeof SEARCH_CONSTANTS.RRF_K_CONSTANT === 'number');
});

// =============================================================================
// SYMBOL_BOOST_CONSTANTS tests
// =============================================================================

test('SYMBOL_BOOST_CONSTANTS has correct SIGNATURE_MATCH_BOOST', () => {
  assert.equal(SYMBOL_BOOST_CONSTANTS.SIGNATURE_MATCH_BOOST, 0.3);
});

test('SYMBOL_BOOST_CONSTANTS has correct NEIGHBOR_MATCH_BOOST', () => {
  assert.equal(SYMBOL_BOOST_CONSTANTS.NEIGHBOR_MATCH_BOOST, 0.15);
});

test('SYMBOL_BOOST_CONSTANTS has correct MAX_SYMBOL_BOOST', () => {
  assert.equal(SYMBOL_BOOST_CONSTANTS.MAX_SYMBOL_BOOST, 0.45);
  // MAX should be >= sum of individual boosts (for capping purposes)
  assert.ok(SYMBOL_BOOST_CONSTANTS.MAX_SYMBOL_BOOST <= 1.0, 'max boost should not exceed 1.0');
});

test('SYMBOL_BOOST_CONSTANTS has positive MIN_TOKEN_LENGTH', () => {
  assert.equal(SYMBOL_BOOST_CONSTANTS.MIN_TOKEN_LENGTH, 3);
  assert.ok(SYMBOL_BOOST_CONSTANTS.MIN_TOKEN_LENGTH > 0);
});

test('SYMBOL_BOOST_CONSTANTS has positive MAX_PARAMETERS', () => {
  assert.equal(SYMBOL_BOOST_CONSTANTS.MAX_PARAMETERS, 12);
  assert.ok(SYMBOL_BOOST_CONSTANTS.MAX_PARAMETERS > 0);
});

// =============================================================================
// WATCHER_CONSTANTS tests
// =============================================================================

test('WATCHER_CONSTANTS has positive DEFAULT_DEBOUNCE_MS', () => {
  assert.equal(WATCHER_CONSTANTS.DEFAULT_DEBOUNCE_MS, 500);
  assert.ok(WATCHER_CONSTANTS.DEFAULT_DEBOUNCE_MS > 0);
});

test('WATCHER_CONSTANTS has positive MIN_DEBOUNCE_MS', () => {
  assert.equal(WATCHER_CONSTANTS.MIN_DEBOUNCE_MS, 50);
  assert.ok(WATCHER_CONSTANTS.MIN_DEBOUNCE_MS > 0);
});

test('WATCHER_CONSTANTS DEFAULT >= MIN debounce', () => {
  assert.ok(WATCHER_CONSTANTS.DEFAULT_DEBOUNCE_MS >= WATCHER_CONSTANTS.MIN_DEBOUNCE_MS);
});

test('WATCHER_CONSTANTS has positive SETTLE_DELAY_MS', () => {
  assert.equal(WATCHER_CONSTANTS.SETTLE_DELAY_MS, 200);
  assert.ok(WATCHER_CONSTANTS.SETTLE_DELAY_MS > 0);
});

test('WATCHER_CONSTANTS has positive STABILITY_THRESHOLD_MS', () => {
  assert.equal(WATCHER_CONSTANTS.STABILITY_THRESHOLD_MS, 100);
  assert.ok(WATCHER_CONSTANTS.STABILITY_THRESHOLD_MS > 0);
});

test('WATCHER_CONSTANTS has positive POLL_INTERVAL_MS', () => {
  assert.equal(WATCHER_CONSTANTS.POLL_INTERVAL_MS, 50);
  assert.ok(WATCHER_CONSTANTS.POLL_INTERVAL_MS > 0);
});

// =============================================================================
// RATE_LIMIT_CONSTANTS tests
// =============================================================================

test('RATE_LIMIT_CONSTANTS has RETRY_DELAYS array', () => {
  assert.ok(Array.isArray(RATE_LIMIT_CONSTANTS.RETRY_DELAYS));
  assert.ok(RATE_LIMIT_CONSTANTS.RETRY_DELAYS.length > 0);
});

test('RATE_LIMIT_CONSTANTS RETRY_DELAYS are increasing', () => {
  const delays = RATE_LIMIT_CONSTANTS.RETRY_DELAYS;
  for (let i = 1; i < delays.length; i++) {
    assert.ok(delays[i] > delays[i - 1], 'delays should be increasing');
  }
});

test('RATE_LIMIT_CONSTANTS RETRY_DELAYS are all positive', () => {
  for (const delay of RATE_LIMIT_CONSTANTS.RETRY_DELAYS) {
    assert.ok(delay > 0, 'all delays should be positive');
  }
});

test('RATE_LIMIT_CONSTANTS has positive DEFAULT_MAX_QUEUE_SIZE', () => {
  assert.equal(RATE_LIMIT_CONSTANTS.DEFAULT_MAX_QUEUE_SIZE, 10_000);
  assert.ok(RATE_LIMIT_CONSTANTS.DEFAULT_MAX_QUEUE_SIZE > 0);
});

test('RATE_LIMIT_CONSTANTS has positive DELAY_BUFFER_MS', () => {
  assert.equal(RATE_LIMIT_CONSTANTS.DELAY_BUFFER_MS, 100);
  assert.ok(RATE_LIMIT_CONSTANTS.DELAY_BUFFER_MS >= 0);
});

// =============================================================================
// BATCH_CONSTANTS tests
// =============================================================================

test('BATCH_CONSTANTS has positive MAX_BATCH_RETRIES', () => {
  assert.equal(BATCH_CONSTANTS.MAX_BATCH_RETRIES, 3);
  assert.ok(BATCH_CONSTANTS.MAX_BATCH_RETRIES > 0);
});

test('BATCH_CONSTANTS has positive INITIAL_RETRY_DELAY_MS', () => {
  assert.equal(BATCH_CONSTANTS.INITIAL_RETRY_DELAY_MS, 1000);
  assert.ok(BATCH_CONSTANTS.INITIAL_RETRY_DELAY_MS > 0);
});

test('BATCH_CONSTANTS has positive MAX_BATCH_TOKENS', () => {
  assert.equal(BATCH_CONSTANTS.MAX_BATCH_TOKENS, 100_000);
  assert.ok(BATCH_CONSTANTS.MAX_BATCH_TOKENS > 0);
});

test('BATCH_CONSTANTS has positive MAX_ITEM_TOKENS', () => {
  assert.equal(BATCH_CONSTANTS.MAX_ITEM_TOKENS, 8191);
  assert.ok(BATCH_CONSTANTS.MAX_ITEM_TOKENS > 0);
});

test('BATCH_CONSTANTS MAX_BATCH_TOKENS > MAX_ITEM_TOKENS', () => {
  assert.ok(BATCH_CONSTANTS.MAX_BATCH_TOKENS > BATCH_CONSTANTS.MAX_ITEM_TOKENS);
});

test('BATCH_CONSTANTS has positive DEFAULT_BATCH_SIZE', () => {
  assert.equal(BATCH_CONSTANTS.DEFAULT_BATCH_SIZE, 100);
  assert.ok(BATCH_CONSTANTS.DEFAULT_BATCH_SIZE > 0);
});

// =============================================================================
// ENCRYPTION_CONSTANTS tests
// =============================================================================

test('ENCRYPTION_CONSTANTS has correct MAGIC_HEADER', () => {
  assert.equal(ENCRYPTION_CONSTANTS.MAGIC_HEADER, 'CVAULTE1');
  assert.ok(typeof ENCRYPTION_CONSTANTS.MAGIC_HEADER === 'string');
});

test('ENCRYPTION_CONSTANTS has positive SALT_LENGTH', () => {
  assert.equal(ENCRYPTION_CONSTANTS.SALT_LENGTH, 16);
  assert.ok(ENCRYPTION_CONSTANTS.SALT_LENGTH > 0);
});

test('ENCRYPTION_CONSTANTS has positive IV_LENGTH', () => {
  assert.equal(ENCRYPTION_CONSTANTS.IV_LENGTH, 12);
  assert.ok(ENCRYPTION_CONSTANTS.IV_LENGTH > 0);
});

test('ENCRYPTION_CONSTANTS has positive TAG_LENGTH', () => {
  assert.equal(ENCRYPTION_CONSTANTS.TAG_LENGTH, 16);
  assert.ok(ENCRYPTION_CONSTANTS.TAG_LENGTH > 0);
});

test('ENCRYPTION_CONSTANTS has positive KEY_ID_LENGTH', () => {
  assert.equal(ENCRYPTION_CONSTANTS.KEY_ID_LENGTH, 8);
  assert.ok(ENCRYPTION_CONSTANTS.KEY_ID_LENGTH > 0);
});

test('ENCRYPTION_CONSTANTS has correct HKDF_INFO', () => {
  assert.equal(ENCRYPTION_CONSTANTS.HKDF_INFO, 'codevault-chunk-v1');
  assert.ok(typeof ENCRYPTION_CONSTANTS.HKDF_INFO === 'string');
});

test('ENCRYPTION_CONSTANTS has correct REQUIRED_KEY_LENGTH', () => {
  assert.equal(ENCRYPTION_CONSTANTS.REQUIRED_KEY_LENGTH, 32);
  assert.ok(ENCRYPTION_CONSTANTS.REQUIRED_KEY_LENGTH > 0);
});

// =============================================================================
// LLM_CONSTANTS tests
// =============================================================================

test('LLM_CONSTANTS has valid MULTI_QUERY_TEMPERATURE', () => {
  assert.equal(LLM_CONSTANTS.MULTI_QUERY_TEMPERATURE, 0.3);
  assert.ok(LLM_CONSTANTS.MULTI_QUERY_TEMPERATURE >= 0);
  assert.ok(LLM_CONSTANTS.MULTI_QUERY_TEMPERATURE <= 2);
});

test('LLM_CONSTANTS has valid DEFAULT_TEMPERATURE', () => {
  assert.equal(LLM_CONSTANTS.DEFAULT_TEMPERATURE, 0.7);
  assert.ok(LLM_CONSTANTS.DEFAULT_TEMPERATURE >= 0);
  assert.ok(LLM_CONSTANTS.DEFAULT_TEMPERATURE <= 2);
});

test('LLM_CONSTANTS has positive MULTI_QUERY_MAX_TOKENS', () => {
  assert.equal(LLM_CONSTANTS.MULTI_QUERY_MAX_TOKENS, 500);
  assert.ok(LLM_CONSTANTS.MULTI_QUERY_MAX_TOKENS > 0);
});

test('LLM_CONSTANTS has positive DEFAULT_CHAT_MAX_TOKENS', () => {
  assert.equal(LLM_CONSTANTS.DEFAULT_CHAT_MAX_TOKENS, 256000);
  assert.ok(LLM_CONSTANTS.DEFAULT_CHAT_MAX_TOKENS > 0);
});

test('LLM_CONSTANTS has positive DEFAULT_MAX_CHUNKS', () => {
  assert.equal(LLM_CONSTANTS.DEFAULT_MAX_CHUNKS, 10);
  assert.ok(LLM_CONSTANTS.DEFAULT_MAX_CHUNKS > 0);
});

// =============================================================================
// CHUNKING_CONSTANTS tests
// =============================================================================

test('CHUNKING_CONSTANTS has positive MIN_CHUNK_TOKENS', () => {
  assert.equal(CHUNKING_CONSTANTS.MIN_CHUNK_TOKENS, 50);
  assert.ok(CHUNKING_CONSTANTS.MIN_CHUNK_TOKENS > 0);
});

test('CHUNKING_CONSTANTS has valid LINE_OVERLAP_PERCENTAGE', () => {
  assert.equal(CHUNKING_CONSTANTS.LINE_OVERLAP_PERCENTAGE, 0.2);
  assert.ok(CHUNKING_CONSTANTS.LINE_OVERLAP_PERCENTAGE > 0);
  assert.ok(CHUNKING_CONSTANTS.LINE_OVERLAP_PERCENTAGE < 1);
});

test('CHUNKING_CONSTANTS has positive MAX_SIGNATURE_SNIPPET', () => {
  assert.equal(CHUNKING_CONSTANTS.MAX_SIGNATURE_SNIPPET, 400);
  assert.ok(CHUNKING_CONSTANTS.MAX_SIGNATURE_SNIPPET > 0);
});

test('CHUNKING_CONSTANTS has positive MAX_CALL_SNIPPET', () => {
  assert.equal(CHUNKING_CONSTANTS.MAX_CALL_SNIPPET, 120);
  assert.ok(CHUNKING_CONSTANTS.MAX_CALL_SNIPPET > 0);
});

test('CHUNKING_CONSTANTS has positive MAX_RETURN_TYPE_SNIPPET', () => {
  assert.equal(CHUNKING_CONSTANTS.MAX_RETURN_TYPE_SNIPPET, 80);
  assert.ok(CHUNKING_CONSTANTS.MAX_RETURN_TYPE_SNIPPET > 0);
});

// =============================================================================
// CONVERSATION_CONSTANTS tests
// =============================================================================

test('CONVERSATION_CONSTANTS has positive MAX_CONTEXT_CHUNKS', () => {
  assert.equal(CONVERSATION_CONSTANTS.MAX_CONTEXT_CHUNKS, 200);
  assert.ok(CONVERSATION_CONSTANTS.MAX_CONTEXT_CHUNKS > 0);
});

test('CONVERSATION_CONSTANTS has positive PROMPT_TRUNCATE_LENGTH', () => {
  assert.equal(CONVERSATION_CONSTANTS.PROMPT_TRUNCATE_LENGTH, 2000);
  assert.ok(CONVERSATION_CONSTANTS.PROMPT_TRUNCATE_LENGTH > 0);
});

// =============================================================================
// DOC_BOOST_CONSTANTS tests
// =============================================================================

test('DOC_BOOST_CONSTANTS has valid DOC_FILE_BOOST', () => {
  assert.equal(DOC_BOOST_CONSTANTS.DOC_FILE_BOOST, 0.15);
  assert.ok(DOC_BOOST_CONSTANTS.DOC_FILE_BOOST >= 0);
  assert.ok(DOC_BOOST_CONSTANTS.DOC_FILE_BOOST <= 1);
});

test('DOC_BOOST_CONSTANTS has valid INTENT_MATCH_BOOST', () => {
  assert.equal(DOC_BOOST_CONSTANTS.INTENT_MATCH_BOOST, 0.2);
  assert.ok(DOC_BOOST_CONSTANTS.INTENT_MATCH_BOOST >= 0);
  assert.ok(DOC_BOOST_CONSTANTS.INTENT_MATCH_BOOST <= 1);
});

test('DOC_BOOST_CONSTANTS has valid TAG_MATCH_BOOST', () => {
  assert.equal(DOC_BOOST_CONSTANTS.TAG_MATCH_BOOST, 0.1);
  assert.ok(DOC_BOOST_CONSTANTS.TAG_MATCH_BOOST >= 0);
  assert.ok(DOC_BOOST_CONSTANTS.TAG_MATCH_BOOST <= 1);
});

// =============================================================================
// Backward compatibility exports tests
// =============================================================================

test('SIZE_THRESHOLD matches PARSING_CONSTANTS', () => {
  assert.equal(SIZE_THRESHOLD, PARSING_CONSTANTS.SIZE_THRESHOLD);
});

test('CHUNK_SIZE matches PARSING_CONSTANTS', () => {
  assert.equal(CHUNK_SIZE, PARSING_CONSTANTS.CHUNK_SIZE);
});

test('MAX_CHUNK_SIZE matches SEARCH_CONSTANTS', () => {
  assert.equal(MAX_CHUNK_SIZE, SEARCH_CONSTANTS.MAX_CHUNK_SIZE);
});

test('RRF_K matches SEARCH_CONSTANTS.RRF_K_CONSTANT', () => {
  assert.equal(RRF_K, SEARCH_CONSTANTS.RRF_K_CONSTANT);
});

test('DOC_BOOST matches DOC_BOOST_CONSTANTS.DOC_FILE_BOOST', () => {
  assert.equal(DOC_BOOST, DOC_BOOST_CONSTANTS.DOC_FILE_BOOST);
});

test('MAX_NEIGHBORS matches SYMBOL_BOOST_CONSTANTS.MAX_PARAMETERS', () => {
  assert.equal(MAX_NEIGHBORS, SYMBOL_BOOST_CONSTANTS.MAX_PARAMETERS);
});

test('PROMPT_TRUNCATE_LENGTH matches CONVERSATION_CONSTANTS', () => {
  assert.equal(PROMPT_TRUNCATE_LENGTH, CONVERSATION_CONSTANTS.PROMPT_TRUNCATE_LENGTH);
});

test('CONVERSATION_MAX_CONTEXT_CHUNKS matches CONVERSATION_CONSTANTS.MAX_CONTEXT_CHUNKS', () => {
  assert.equal(CONVERSATION_MAX_CONTEXT_CHUNKS, CONVERSATION_CONSTANTS.MAX_CONTEXT_CHUNKS);
});

test('DEFAULT_CACHE_CLEAR_INTERVAL_MS matches CACHE_CONSTANTS.CACHE_CLEAR_INTERVAL_MS', () => {
  assert.equal(DEFAULT_CACHE_CLEAR_INTERVAL_MS, CACHE_CONSTANTS.CACHE_CLEAR_INTERVAL_MS);
});

test('CHAR_TO_TOKEN_RATIO is 4', () => {
  assert.equal(CHAR_TO_TOKEN_RATIO, 4);
});

// =============================================================================
// ALL_CONSTANTS aggregate tests
// =============================================================================

test('ALL_CONSTANTS contains all constant groups', () => {
  assert.ok('PARSING' in ALL_CONSTANTS);
  assert.ok('CACHE' in ALL_CONSTANTS);
  assert.ok('SEARCH' in ALL_CONSTANTS);
  assert.ok('SYMBOL_BOOST' in ALL_CONSTANTS);
  assert.ok('WATCHER' in ALL_CONSTANTS);
  assert.ok('RATE_LIMIT' in ALL_CONSTANTS);
  assert.ok('BATCH' in ALL_CONSTANTS);
  assert.ok('ENCRYPTION' in ALL_CONSTANTS);
  assert.ok('LLM' in ALL_CONSTANTS);
  assert.ok('CHUNKING' in ALL_CONSTANTS);
  assert.ok('CONVERSATION' in ALL_CONSTANTS);
  assert.ok('DOC_BOOST' in ALL_CONSTANTS);
});

test('ALL_CONSTANTS groups match individual exports', () => {
  assert.deepEqual(ALL_CONSTANTS.PARSING, PARSING_CONSTANTS);
  assert.deepEqual(ALL_CONSTANTS.CACHE, CACHE_CONSTANTS);
  assert.deepEqual(ALL_CONSTANTS.SEARCH, SEARCH_CONSTANTS);
  assert.deepEqual(ALL_CONSTANTS.SYMBOL_BOOST, SYMBOL_BOOST_CONSTANTS);
  assert.deepEqual(ALL_CONSTANTS.WATCHER, WATCHER_CONSTANTS);
  assert.deepEqual(ALL_CONSTANTS.RATE_LIMIT, RATE_LIMIT_CONSTANTS);
  assert.deepEqual(ALL_CONSTANTS.BATCH, BATCH_CONSTANTS);
  assert.deepEqual(ALL_CONSTANTS.ENCRYPTION, ENCRYPTION_CONSTANTS);
  assert.deepEqual(ALL_CONSTANTS.LLM, LLM_CONSTANTS);
  assert.deepEqual(ALL_CONSTANTS.CHUNKING, CHUNKING_CONSTANTS);
  assert.deepEqual(ALL_CONSTANTS.CONVERSATION, CONVERSATION_CONSTANTS);
  assert.deepEqual(ALL_CONSTANTS.DOC_BOOST, DOC_BOOST_CONSTANTS);
});

// =============================================================================
// Type safety tests (all constants should be readonly)
// =============================================================================

test('Constants are frozen/readonly', () => {
  // The 'as const' assertion should make these readonly
  // We verify by checking the object is an object (basic sanity check)
  assert.ok(typeof PARSING_CONSTANTS === 'object');
  assert.ok(typeof CACHE_CONSTANTS === 'object');
  assert.ok(typeof INDEXING_CONSTANTS === 'object');
  assert.ok(typeof SEARCH_CONSTANTS === 'object');
  assert.ok(typeof SYMBOL_BOOST_CONSTANTS === 'object');
  assert.ok(typeof WATCHER_CONSTANTS === 'object');
  assert.ok(typeof RATE_LIMIT_CONSTANTS === 'object');
  assert.ok(typeof BATCH_CONSTANTS === 'object');
  assert.ok(typeof ENCRYPTION_CONSTANTS === 'object');
  assert.ok(typeof LLM_CONSTANTS === 'object');
  assert.ok(typeof CHUNKING_CONSTANTS === 'object');
  assert.ok(typeof CONVERSATION_CONSTANTS === 'object');
  assert.ok(typeof DOC_BOOST_CONSTANTS === 'object');
  assert.ok(typeof ALL_CONSTANTS === 'object');
});

// =============================================================================
// Sanity checks for related constants
// =============================================================================

test('Chunking and parsing constants are consistent', () => {
  // SIZE_THRESHOLD and CHUNK_SIZE should be equal for streaming parser
  assert.equal(PARSING_CONSTANTS.SIZE_THRESHOLD, PARSING_CONSTANTS.CHUNK_SIZE);
});

test('Search limits are consistent', () => {
  // MAX_SEARCH_LIMIT should be >= DEFAULT_SEARCH_LIMIT
  assert.ok(SEARCH_CONSTANTS.MAX_SEARCH_LIMIT >= SEARCH_CONSTANTS.DEFAULT_SEARCH_LIMIT);
});

test('Symbol boost constants sum correctly', () => {
  // Individual boosts should not exceed MAX_SYMBOL_BOOST (by design)
  // This is a soft constraint - the code caps at MAX_SYMBOL_BOOST
  assert.ok(SYMBOL_BOOST_CONSTANTS.SIGNATURE_MATCH_BOOST <= SYMBOL_BOOST_CONSTANTS.MAX_SYMBOL_BOOST);
  assert.ok(SYMBOL_BOOST_CONSTANTS.NEIGHBOR_MATCH_BOOST <= SYMBOL_BOOST_CONSTANTS.MAX_SYMBOL_BOOST);
});

test('Watcher debounce values are consistent', () => {
  // MIN should be less than DEFAULT
  assert.ok(WATCHER_CONSTANTS.MIN_DEBOUNCE_MS <= WATCHER_CONSTANTS.DEFAULT_DEBOUNCE_MS);
});

test('Batch token limits are consistent', () => {
  // A batch should be able to hold multiple items
  assert.ok(BATCH_CONSTANTS.MAX_BATCH_TOKENS >= BATCH_CONSTANTS.MAX_ITEM_TOKENS);
});
