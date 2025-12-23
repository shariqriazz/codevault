# Ranking and Reranking System

**Version:** 1.8.5

This document describes the ranking and reranking mechanisms used by CodeVault to order search results by relevance. The system employs a multi-stage pipeline: initial retrieval via hybrid search, optional symbol-aware boosting, and optional API-based reranking.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Hybrid Search and Reciprocal Rank Fusion](#hybrid-search-and-reciprocal-rank-fusion)
4. [Symbol Boosting](#symbol-boosting)
5. [API Reranking](#api-reranking)
6. [Configuration](#configuration)
7. [Score Bounds and Normalization](#score-bounds-and-normalization)
8. [Performance Considerations](#performance-considerations)

---

## Overview

CodeVault uses a three-stage ranking pipeline:

1. **Hybrid Retrieval**: Combines vector similarity search with BM25 keyword matching using Reciprocal Rank Fusion (RRF).
2. **Symbol Boosting**: Applies score adjustments based on query matches against function signatures, parameters, and neighbor symbols.
3. **API Reranking**: Optionally reorders top candidates using an external reranking API (Cohere, Jina, Novita, Voyage AI).

Each stage is designed to improve result relevance while maintaining predictable performance characteristics.

---

## Architecture

```
Query
  |
  v
+------------------------+
| Hybrid Search          |
| (Vector + BM25 via RRF)|
+------------------------+
  |
  v
+------------------------+
| Symbol Boosting        |
| (signature/param match)|
+------------------------+
  |
  v
+------------------------+
| API Reranking          |
| (optional, external)   |
+------------------------+
  |
  v
+------------------------+
| Score Normalization    |
| (bounds enforcement)   |
+------------------------+
  |
  v
Final Results
```

### Source Files

| Component | File Path |
|-----------|-----------|
| Symbol Boosting | `/src/ranking/symbol-boost.ts` |
| API Reranking | `/src/ranking/api-reranker.ts` |
| Hybrid Fusion | `/src/search/hybrid.ts` |
| BM25 Index | `/src/search/bm25.ts` |
| Search Service | `/src/core/SearchService.ts` |
| Result Mapper | `/src/core/search/ResultMapper.ts` |
| Constants | `/src/config/constants.ts` |

---

## Hybrid Search and Reciprocal Rank Fusion

Hybrid search combines two retrieval methods:

- **Vector Search**: Uses embedding similarity to find semantically related code chunks.
- **BM25 Search**: Uses keyword matching with term frequency-inverse document frequency weighting.

### Reciprocal Rank Fusion (RRF)

The `reciprocalRankFusion` function in `/src/search/hybrid.ts` merges results from both sources using the RRF formula:

```
score(d) = sum over all rankers R of: 1 / (k + rank_R(d))
```

Where:
- `k` is the RRF constant (default: 60, configurable via `SEARCH_CONSTANTS.RRF_K_CONSTANT`)
- `rank_R(d)` is the 0-based rank of document `d` in ranker `R`

### Function Signature

```typescript
function reciprocalRankFusion({
  vectorResults = [],
  bm25Results = [],
  limit = 10,
  k = 60
}: ReciprocalRankFusionOptions): FusedItem[]
```

### Fused Item Structure

```typescript
interface FusedItem {
  id: string;
  score: number;        // Combined RRF score
  vectorRank: number | null;
  bm25Rank: number | null;
  vectorScore: number | null;
  bm25Score: number | null;
}
```

### Tie-Breaking

When RRF scores are equal, results are ordered by:
1. Vector rank (lower is better)
2. BM25 rank (lower is better)

---

## Symbol Boosting

Symbol boosting adjusts scores based on matches between the query and code symbol metadata. This stage is implemented in `/src/ranking/symbol-boost.ts`.

### Overview

The `applySymbolBoost` function modifies search results in-place, adding boost values to scores based on:

1. **Signature Matching**: Matches between query tokens and function/method names
2. **Parameter Matching**: Matches against function parameter names
3. **Neighbor Matching**: Matches against related symbols (callers, callees)

### Function Signature

```typescript
function applySymbolBoost(
  results: SearchResult[],
  { query, codemap }: { query: string; codemap: Codemap }
): void
```

### Boost Calculation

The total symbol boost is computed as:

```
boost = min(
  MAX_SYMBOL_BOOST,
  SIGNATURE_MATCH_BOOST * signatureStrength +
  NEIGHBOR_MATCH_BOOST * neighborStrength
)
```

Where:
- `SIGNATURE_MATCH_BOOST` = 0.3
- `NEIGHBOR_MATCH_BOOST` = 0.15
- `MAX_SYMBOL_BOOST` = 0.45 (hard cap)

### Signature Match Strength

The `computeSignatureMatchStrength` function calculates a weight from 0.0 to 1.0 based on:

| Match Type | Weight |
|------------|--------|
| Exact symbol name match in query | 4.0 |
| Full signature match in query | 3.5 |
| Each matching symbol token | 1.0 + 0.5 * (additional matches) |
| Each matching parameter | 0.35 |

The raw weight is normalized by dividing by 4 and clamping to [0, 1].

### Token Matching Rules

- Tokens shorter than `MIN_TOKEN_LENGTH` (3 characters) are ignored
- CamelCase and snake_case symbols are split into individual words
- Matching uses word-boundary-aware regular expressions
- A regex cache (LRU, 1000 entries) prevents redundant compilation

### Neighbor Matching

If the query does not strongly match the result's own signature, the system checks for matches against neighbor symbols (defined in `symbol_neighbors`). The strongest neighbor match contributes to the boost via `NEIGHBOR_MATCH_BOOST`.

### Result Metadata

After boosting, results include:

```typescript
interface SearchResult {
  score: number;              // Base score + capped boost
  symbolBoost?: number;       // The boost value applied
  symbolBoostSources?: string[];  // ["signature", "neighbor"]
  symbolMatchStrength?: number;   // Signature match strength
  symbolNeighborStrength?: number; // Best neighbor match strength
}
```

---

## API Reranking

API reranking sends the top candidates to an external reranking service for more sophisticated relevance scoring. This is implemented in `/src/ranking/api-reranker.ts`.

### Supported Providers

The reranking API is compatible with:
- Cohere
- Jina AI
- Novita AI
- Voyage AI

All providers use a similar request/response format.

### Configuration Check

```typescript
function isAPIRerankingConfigured(): boolean
```

Returns `true` if both `CODEVAULT_RERANK_API_URL` and `CODEVAULT_RERANK_API_KEY` are set.

### Main Function

```typescript
async function rerankWithAPI(
  query: string,
  candidates: Candidate[],
  options?: RerankOptions
): Promise<Candidate[]>
```

### Options

```typescript
interface RerankOptions {
  max?: number;           // Max candidates to rerank (default: 50)
  maxTokens?: number;     // Max tokens per document (default: 8191)
  getText?: (c: Candidate) => string;        // Sync text extractor
  getTextAsync?: (c: Candidate) => Promise<string>; // Async text extractor
  apiUrl?: string;        // Override API URL
  apiKey?: string;        // Override API key
  model?: string;         // Override model name
}
```

### Text Truncation

Documents are truncated to `maxTokens * 4` characters before sending to the API. This uses a 4-character-per-token approximation to avoid expensive token counting.

```typescript
function truncateText(text: string, maxTokens: number): string
```

### API Request Format

```json
{
  "model": "rerank-v3.5",
  "query": "user query",
  "documents": ["doc1 text", "doc2 text", ...],
  "top_n": 50
}
```

### Response Handling

The function handles multiple response formats:
- `{ results: [{ index, relevance_score }] }` (standard)
- `{ data: [{ index, score }] }` (alternative)
- Direct array `[{ index, logit }]` (fallback)

### Result Enrichment

Reranked candidates receive additional metadata:

```typescript
candidate.rerankerScore = score;  // Relevance score from API
candidate.rerankerRank = index;   // Position after reranking
```

### Graceful Degradation

If the API call fails (timeout, error, invalid response), the function logs a warning and returns the original unmodified candidates. This ensures search never fails due to reranking issues.

```typescript
try {
  // API call
} catch (error) {
  console.error('API reranking failed, falling back to original ranking:', error.message);
  return candidates;
}
```

### Timeout

The default timeout is 15000ms (15 seconds), configurable via `CODEVAULT_RERANK_TIMEOUT_MS`.

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CODEVAULT_RERANK_API_URL` | (none) | Reranking API endpoint URL |
| `CODEVAULT_RERANK_API_KEY` | (none) | API authentication key |
| `CODEVAULT_RERANK_MODEL` | `rerank-v3.5` | Model name for reranking |
| `CODEVAULT_RERANK_TIMEOUT_MS` | `15000` | API request timeout in milliseconds |
| `CODEVAULT_RERANKER_MAX` | `50` | Maximum candidates to send to reranker |
| `CODEVAULT_RERANKER_MAX_TOKENS` | `8191` | Maximum tokens per document |

### Constants Reference

From `/src/config/constants.ts`:

```typescript
// Search Constants
SEARCH_CONSTANTS = {
  RERANKER_MAX_CANDIDATES: 50,
  RRF_K_CONSTANT: 60,
  BM25_PREFILTER_LIMIT: 500,
  SELECTION_BUDGET_MULTIPLIER: 60
}

// Symbol Boost Constants
SYMBOL_BOOST_CONSTANTS = {
  SIGNATURE_MATCH_BOOST: 0.3,
  NEIGHBOR_MATCH_BOOST: 0.15,
  MAX_SYMBOL_BOOST: 0.45,
  MIN_TOKEN_LENGTH: 3,
  MAX_PARAMETERS: 12
}
```

---

## Score Bounds and Normalization

All final scores are normalized to the range [0, 1]:

```typescript
score = Math.min(1, Math.max(score, 0))
```

This enforcement occurs in `ResultMapper.enforceScoreBounds()` and ensures consistent score interpretation across all ranking stages.

### Score Components

The final score may include contributions from:

| Component | Range | Source |
|-----------|-------|--------|
| Vector similarity | 0-1 | Embedding cosine similarity |
| BM25 contribution | 0+ | RRF rank contribution |
| Symbol boost | 0-0.45 | Signature/parameter matching |
| Reranker score | 0-1 | External API |

When API reranking is enabled, results are sorted by `rerankerScore` first, then by the base score.

---

## Performance Considerations

### Caching

- **Regex Cache**: LRU cache (1000 entries) for compiled regex patterns in symbol matching
- **Codemap Index**: SHA-to-chunk index built once per search for O(1) neighbor lookups
- **BM25 Index Cache**: LRU cache (10 entries) to avoid rebuilding BM25 indices

### Candidate Limits

- API reranking processes at most 50 candidates by default
- Text is pre-truncated using character count (4x multiplier) before sending to API
- BM25 prefiltering limits vector scoring to top 500 candidates

### Graceful Degradation

All ranking stages are designed to degrade gracefully:
- Symbol boost failures are logged and skipped
- API reranking failures return original ordering
- Invalid scores are clamped to valid range

### Memory Management

- Symbol boost operates in-place, modifying the input array
- The regex cache uses automatic LRU eviction
- Temporary SHA indices are garbage-collected after each search

---

## Usage Example

```typescript
import { SearchService } from './core/SearchService.js';

const service = new SearchService();

// Search with all ranking features enabled
const results = await service.search(
  'process payment stripe',
  10,                    // limit
  'auto',               // provider
  '.',                  // working path
  {
    hybrid: true,       // Enable hybrid fusion
    bm25: true,         // Enable BM25
    symbol_boost: true, // Enable symbol boosting
    reranker: 'api'     // Enable API reranking
  }
);

// Access ranking metadata
for (const result of results.results) {
  console.log({
    path: result.path,
    score: result.meta.score,
    vectorScore: result.meta.vectorScore,
    bm25Score: result.meta.bm25Score,
    symbolBoost: result.meta.symbolBoost,
    rerankerScore: result.meta.rerankerScore
  });
}
```

---

## Related Documentation

- [Configuration Guide](./CONFIGURATION.md) - Environment variable configuration
- [Architecture Overview](../CLAUDE.md) - System architecture and code standards
