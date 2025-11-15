/**
 * Core constants and configuration values for CodeVault
 */

// Chunking thresholds
export const SIZE_THRESHOLD = 30000;
export const CHUNK_SIZE = 30000;
export const MAX_CHUNK_SIZE = 100000;

// Search and ranking constants
export const RRF_K = 60; // Reciprocal Rank Fusion constant
export const DOC_BOOST = 0.15; // Document boost factor

// Symbol graph constants
export const MAX_NEIGHBORS = 16; // Maximum number of symbol neighbors to track

// UI truncation limits
export const PROMPT_TRUNCATE_LENGTH = 2000; // Characters to truncate prompts to

// Conversational context limits
export const CONVERSATION_MAX_CONTEXT_CHUNKS = 200; // Max distinct chunks retained in conversation cache

// Cache cleanup interval (in milliseconds)
export const DEFAULT_CACHE_CLEAR_INTERVAL_MS = 3600000; // 1 hour
