/**
 * Centralized configuration constants for CodeVault
 *
 * This file contains all magic numbers and configuration values used throughout
 * the codebase. Centralizing these values makes the system easier to tune and
 * understand.
 */

/**
 * Parsing and Tree-sitter Configuration
 */
export const PARSING_CONSTANTS = {
  /**
   * Threshold in bytes to switch to streaming parser
   * Large files above this size are parsed in chunks to avoid memory issues
   */
  SIZE_THRESHOLD: 30_000,

  /**
   * Chunk size for streaming parser in bytes
   * Parser will read this many bytes at a time when streaming
   */
  CHUNK_SIZE: 30_000,
} as const;

/**
 * Cache Configuration
 */
export const CACHE_CONSTANTS = {
  /** Maximum number of BM25 indexes to cache (LRU eviction) */
  MAX_BM25_CACHE_SIZE: parseInt(process.env.CODEVAULT_MAX_BM25_CACHE || '10', 10),

  /** Maximum number of code chunks to cache in memory */
  MAX_CHUNK_TEXT_CACHE_SIZE: parseInt(process.env.CODEVAULT_MAX_CHUNK_CACHE || '1000', 10),

  /** Interval for periodic cache cleanup in MCP server (milliseconds) */
  CACHE_CLEAR_INTERVAL_MS: parseInt(process.env.CODEVAULT_CACHE_CLEAR_INTERVAL || '3600000', 10), // 1 hour
} as const;

/**
 * Indexing Configuration
 */
export const INDEXING_CONSTANTS = {
  /** Number of files to process in parallel during indexing */
  DEFAULT_CONCURRENCY: parseInt(process.env.CODEVAULT_INDEXING_CONCURRENCY || '8', 10),
} as const;

/**
 * Search Configuration
 */
export const SEARCH_CONSTANTS = {
  /** Maximum candidates to send to reranking API */
  RERANKER_MAX_CANDIDATES: parseInt(process.env.CODEVAULT_RERANKER_MAX || '50', 10),

  /** Maximum code chunk size to return in bytes (prevents OOM) */
  MAX_CHUNK_SIZE: 100_000,

  /** Default result limit for search queries */
  DEFAULT_SEARCH_LIMIT: 10,

  /** Maximum search results limit */
  MAX_SEARCH_LIMIT: 200,

  /** Maximum BM25 candidates to score with vectors */
  BM25_PREFILTER_LIMIT: parseInt(process.env.CODEVAULT_BM25_PREFILTER_LIMIT || '500', 10),

  /** Selection budget multiplier for hybrid search */
  SELECTION_BUDGET_MULTIPLIER: 60,

  /** Reciprocal rank fusion constant */
  RRF_K_CONSTANT: 60,
} as const;

/**
 * Symbol Boosting Configuration
 */
export const SYMBOL_BOOST_CONSTANTS = {
  /** Boost applied when query matches function signature */
  SIGNATURE_MATCH_BOOST: 0.3,

  /** Boost applied when query matches neighbor functions */
  NEIGHBOR_MATCH_BOOST: 0.15,

  /** Maximum total boost from symbol matching */
  MAX_SYMBOL_BOOST: 0.45,

  /** Minimum token length for symbol matching */
  MIN_TOKEN_LENGTH: 3,

  /** Maximum parameters to extract from signature */
  MAX_PARAMETERS: 12,
} as const;

/**
 * File Watcher Configuration
 */
export const WATCHER_CONSTANTS = {
  /** Default debounce interval in milliseconds */
  DEFAULT_DEBOUNCE_MS: 500,

  /** Minimum debounce interval in milliseconds */
  MIN_DEBOUNCE_MS: 50,

  /** Settle delay for watcher shutdown */
  SETTLE_DELAY_MS: 200,

  /** Stability threshold for file write detection */
  STABILITY_THRESHOLD_MS: 100,

  /** Poll interval for file stability check */
  POLL_INTERVAL_MS: 50,
} as const;

/**
 * Rate Limiting Configuration
 */
export const RATE_LIMIT_CONSTANTS = {
  /** Retry delays for rate limit errors (milliseconds) */
  RETRY_DELAYS: [1000, 2000, 5000, 10000] as const,

  /** Maximum queue size to prevent unbounded growth */
  DEFAULT_MAX_QUEUE_SIZE: 10_000,

  /** Delay buffer added to rate limit calculations */
  DELAY_BUFFER_MS: 100,
} as const;

/**
 * Batch Processing Configuration
 */
export const BATCH_CONSTANTS = {
  /** Maximum retries for failed batches */
  MAX_BATCH_RETRIES: 3,

  /** Initial retry delay for batch failures */
  INITIAL_RETRY_DELAY_MS: 1000,

  /** Maximum tokens per batch for OpenAI */
  MAX_BATCH_TOKENS: 100_000,

  /** Maximum tokens per individual item */
  MAX_ITEM_TOKENS: 8191,

  /** Default batch size for embedding generation */
  DEFAULT_BATCH_SIZE: 50,
} as const;

/**
 * Encryption Configuration
 */
export const ENCRYPTION_CONSTANTS = {
  /** Magic header for encrypted files */
  MAGIC_HEADER: 'CVAULTE1',

  /** Salt length in bytes for key derivation */
  SALT_LENGTH: 16,

  /** Initialization vector length in bytes */
  IV_LENGTH: 12,

  /** Authentication tag length in bytes */
  TAG_LENGTH: 16,

  /** HKDF info string for key derivation */
  HKDF_INFO: 'codevault-chunk-v1',

  /** Required encryption key length in bytes */
  REQUIRED_KEY_LENGTH: 32,
} as const;

/**
 * LLM Configuration
 */
export const LLM_CONSTANTS = {
  /** Default temperature for multi-query generation */
  MULTI_QUERY_TEMPERATURE: 0.3,

  /** Default temperature for answer synthesis */
  DEFAULT_TEMPERATURE: 0.7,

  /** Maximum tokens for multi-query response */
  MULTI_QUERY_MAX_TOKENS: 500,

  /** Default maximum tokens for chat responses (256K to support OSS models) */
  DEFAULT_CHAT_MAX_TOKENS: 256000,

  /** Maximum context chunks for answer synthesis */
  DEFAULT_MAX_CHUNKS: 10,
} as const;

/**
 * Chunking Configuration
 */
export const CHUNKING_CONSTANTS = {
  /** Minimum token count for a valid chunk */
  MIN_CHUNK_TOKENS: 50,

  /** Overlap percentage for line-based chunking */
  LINE_OVERLAP_PERCENTAGE: 0.2,

  /** Maximum snippet length for signature extraction */
  MAX_SIGNATURE_SNIPPET: 400,

  /** Maximum snippet length for call extraction */
  MAX_CALL_SNIPPET: 120,

  /** Maximum snippet length for return type detection */
  MAX_RETURN_TYPE_SNIPPET: 80,
} as const;

/**
 * Conversational Chat Configuration
 */
export const CONVERSATION_CONSTANTS = {
  /** Maximum distinct chunks retained in conversation cache */
  MAX_CONTEXT_CHUNKS: 200,

  /** Characters to truncate prompts to */
  PROMPT_TRUNCATE_LENGTH: 2000,
} as const;

/**
 * Documentation boost configuration
 */
export const DOC_BOOST_CONSTANTS = {
  /** Boost applied to README and documentation files */
  DOC_FILE_BOOST: 0.15,

  /** Intent match boost */
  INTENT_MATCH_BOOST: 0.2,

  /** Tag match boost per tag */
  TAG_MATCH_BOOST: 0.1,
} as const;

/**
 * Backward compatibility exports
 * These maintain the old flat constant names for existing code
 */

// Chunking thresholds
export const SIZE_THRESHOLD = PARSING_CONSTANTS.SIZE_THRESHOLD;
export const CHUNK_SIZE = PARSING_CONSTANTS.CHUNK_SIZE;
export const MAX_CHUNK_SIZE = SEARCH_CONSTANTS.MAX_CHUNK_SIZE;

// Search and ranking constants
export const RRF_K = SEARCH_CONSTANTS.RRF_K_CONSTANT;
export const DOC_BOOST = DOC_BOOST_CONSTANTS.DOC_FILE_BOOST;

// Symbol graph constants
export const MAX_NEIGHBORS = SYMBOL_BOOST_CONSTANTS.MAX_PARAMETERS;

// UI truncation limits
export const PROMPT_TRUNCATE_LENGTH = CONVERSATION_CONSTANTS.PROMPT_TRUNCATE_LENGTH;

// Conversational context limits
export const CONVERSATION_MAX_CONTEXT_CHUNKS = CONVERSATION_CONSTANTS.MAX_CONTEXT_CHUNKS;

// Cache cleanup interval (in milliseconds)
export const DEFAULT_CACHE_CLEAR_INTERVAL_MS = CACHE_CONSTANTS.CACHE_CLEAR_INTERVAL_MS;

/**
 * Character estimation (4 chars ≈ 1 token)
 */
export const CHAR_TO_TOKEN_RATIO = 4;

/**
 * Get all constants as a single object (useful for debugging)
 */
export const ALL_CONSTANTS = {
  PARSING: PARSING_CONSTANTS,
  CACHE: CACHE_CONSTANTS,
  SEARCH: SEARCH_CONSTANTS,
  SYMBOL_BOOST: SYMBOL_BOOST_CONSTANTS,
  WATCHER: WATCHER_CONSTANTS,
  RATE_LIMIT: RATE_LIMIT_CONSTANTS,
  BATCH: BATCH_CONSTANTS,
  ENCRYPTION: ENCRYPTION_CONSTANTS,
  LLM: LLM_CONSTANTS,
  CHUNKING: CHUNKING_CONSTANTS,
  CONVERSATION: CONVERSATION_CONSTANTS,
  DOC_BOOST: DOC_BOOST_CONSTANTS,
} as const;
