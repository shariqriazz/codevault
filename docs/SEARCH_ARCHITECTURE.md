# Search Architecture

> Version 1.8.5

This document describes the search implementation in CodeVault, including BM25 keyword search, hybrid fusion with Reciprocal Rank Fusion (RRF), scope filtering, symbol boosting, and API reranking.

## Table of Contents

1. [Overview](#overview)
2. [Search Pipeline](#search-pipeline)
3. [BM25 Keyword Search](#bm25-keyword-search)
4. [Hybrid Fusion (RRF)](#hybrid-fusion-rrf)
5. [Scope Filtering](#scope-filtering)
6. [Symbol Boosting](#symbol-boosting)
7. [API Reranking](#api-reranking)
8. [Caching Strategy](#caching-strategy)
9. [Configuration](#configuration)
10. [API Reference](#api-reference)

---

## Overview

CodeVault implements a multi-stage search pipeline that combines:

- **Vector similarity search** using embedding-based semantic matching
- **BM25 keyword search** for lexical matching
- **Reciprocal Rank Fusion (RRF)** to combine vector and BM25 results
- **Symbol boosting** to prioritize results matching function signatures
- **Optional API reranking** via external services (Cohere, Jina, Novita)

The default configuration uses hybrid search with a 0.7 vector weight and 0.3 BM25 weight, combined via RRF with k=60.

---

## Search Pipeline

The search pipeline is orchestrated by `SearchService` and consists of the following stages:

```
Query Input
    |
    v
Query Normalization (lowercase, trim, remove punctuation)
    |
    v
Scope Filtering (path_glob, tags, lang)
    |
    v
BM25 Prefiltering (optional, reduces vector scoring candidates)
    |
    v
Vector Pool Construction (cosine similarity + boost scores)
    |
    v
Symbol Boosting (signature, parameter, neighbor matching)
    |
    v
Hybrid Fusion (RRF combining vector + BM25 ranks)
    |
    v
API Reranking (optional, external reranker)
    |
    v
Score Normalization (cap at 1.0)
    |
    v
Result Mapping and Output
```

### Core Components

| Component | File | Responsibility |
|-----------|------|----------------|
| `SearchService` | `src/core/SearchService.ts` | Orchestrates the entire search pipeline |
| `CandidateRetriever` | `src/core/search/CandidateRetriever.ts` | Vector similarity and boost score computation |
| `HybridFusion` | `src/core/search/HybridFusion.ts` | BM25 indexing and RRF fusion |
| `ResultMapper` | `src/core/search/ResultMapper.ts` | API reranking and result formatting |
| `BM25Index` | `src/search/bm25.ts` | BM25 index implementation |
| `reciprocalRankFusion` | `src/search/hybrid.ts` | RRF algorithm |
| `applyScope` | `src/search/scope.ts` | Scope filter application |
| `applySymbolBoost` | `src/ranking/symbol-boost.ts` | Symbol-based score boosting |
| `rerankWithAPI` | `src/ranking/api-reranker.ts` | External API reranking |

---

## BM25 Keyword Search

### Implementation

BM25 (Best Matching 25) is implemented via the `wink-bm25-text-search` library in `/Users/shariqriaz/projects/codevault/src/search/bm25.ts`.

### Document Construction

Each chunk is converted to a BM25 document by concatenating:

1. Symbol name (function/class name)
2. File path
3. CodeVault description (AI-generated)
4. CodeVault intent (semantic intent)
5. Actual code text

```typescript
function buildBm25Document(
  chunk: { symbol?: string; file_path?: string; codevault_description?: string; codevault_intent?: string } | null,
  codeText: string | null
): string
```

### Text Preprocessing

The default preprocessing pipeline:

1. Convert to lowercase
2. Replace non-alphanumeric characters with spaces (Unicode-aware)
3. Split on whitespace
4. Filter empty tokens

```typescript
function defaultPrep(text: string): string[] {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/u)
    .filter(Boolean);
}
```

### BM25Index Class

```typescript
class BM25Index {
  constructor()
  addDocument(id: string, text: string): void
  addDocuments(entries: Array<{ id: string; text: string }>): void
  consolidate(): void  // Must be called before searching
  search(query: string, limit?: number): Array<{ id: string; score: number }>
}
```

**Key behaviors:**

- Duplicate document IDs are silently ignored
- Consolidation is required before searching (called automatically)
- Minimum 3 documents required for consolidation (wink-bm25 requirement)
- Empty or whitespace-only documents are skipped

---

## Hybrid Fusion (RRF)

### Reciprocal Rank Fusion Algorithm

RRF combines results from multiple ranking systems by considering rank positions rather than raw scores. This makes it robust to score scale differences between vector and BM25 systems.

Implementation location: `/Users/shariqriaz/projects/codevault/src/search/hybrid.ts`

### Formula

For each document appearing in any result list:

```
RRF_score = sum(1 / (k + rank_i))
```

Where:
- `k` is a constant (default: 60)
- `rank_i` is the rank position in each result list (0-indexed)

### Interface

```typescript
interface ReciprocalRankFusionOptions {
  vectorResults?: SearchItem[];  // Vector search results
  bm25Results?: SearchItem[];    // BM25 search results
  limit?: number;                // Max results to return (default: 10)
  k?: number;                    // RRF constant (default: 60)
}

function reciprocalRankFusion(options: ReciprocalRankFusionOptions): FusedItem[]
```

### Output Structure

Each fused result includes:

```typescript
interface FusedItem {
  id: string;
  score: number;           // Combined RRF score
  vectorRank: number | null;   // Rank in vector results (null if absent)
  bm25Rank: number | null;     // Rank in BM25 results (null if absent)
  vectorScore: number | null;  // Original vector score
  bm25Score: number | null;    // Original BM25 score
}
```

### Tie-Breaking

When RRF scores are equal:
1. Prefer lower vector rank
2. If vector ranks equal, prefer lower BM25 rank

---

## Scope Filtering

Scope filtering restricts search results to specific subsets of the codebase.

Implementation location: `/Users/shariqriaz/projects/codevault/src/search/scope.ts`

### Available Filters

| Filter | Type | Description |
|--------|------|-------------|
| `path_glob` | `string[]` | Glob patterns for file paths (e.g., `["src/**/*.ts"]`) |
| `tags` | `string[]` | CodeVault semantic tags (case-insensitive) |
| `lang` | `string[]` | Programming languages (case-insensitive) |
| `provider` | `string` | Override embedding provider |
| `reranker` | `RerankMode` | Reranking mode: `"off"` or `"api"` |
| `hybrid` | `boolean` | Enable/disable hybrid search (default: true) |
| `bm25` | `boolean` | Enable/disable BM25 component (default: true) |
| `symbol_boost` | `boolean` | Enable/disable symbol boosting (default: true) |

### Normalization

The `normalizeScopeFilters` function processes raw scope input:

```typescript
function normalizeScopeFilters(scope: Partial<ScopeFilters> = {}): ScopeFilters
```

- Arrays are flattened and trimmed
- Tags and languages are lowercased
- Boolean toggles accept strings: `"on"`, `"true"`, `"1"`, `"yes"`, `"enable"`, `"enabled"` (and inverses)
- Unknown reranker values fall back to `"off"`

### Application

The `applyScope` function filters database chunks:

```typescript
function applyScope(chunks: DatabaseChunk[], scope: ScopeFilters = {}): DatabaseChunk[]
```

**Path glob matching** uses `micromatch` with `dot: true` option (matches dotfiles).

**Tag matching** parses the `codevault_tags` JSON field and checks for any intersection with requested tags.

**Language matching** compares against the `lang` field (case-insensitive).

---

## Symbol Boosting

Symbol boosting increases scores for results whose function signatures, parameters, or related symbols match the query.

Implementation location: `/Users/shariqriaz/projects/codevault/src/ranking/symbol-boost.ts`

### Boost Components

| Source | Max Boost | Description |
|--------|-----------|-------------|
| Signature | 0.30 | Query matches function name or signature |
| Parameter | 0.35 per match | Query matches parameter names |
| Neighbor | 0.15 | Query matches related functions (via symbol graph) |

**Total boost is capped at 0.45** to prevent symbol matches from dominating semantic relevance.

### Signature Match Scoring

The `computeSignatureMatchStrength` function calculates a weight (0-1) based on:

1. **Full symbol match** (+4 weight): Query contains the full symbol name
2. **Signature match** (+3.5 weight): Query contains the full function signature
3. **Token matches** (+1 base, +0.5 per additional): Individual words from the symbol name match
4. **Parameter matches** (+0.35 each): Query contains parameter names

The final strength is normalized: `min(weight / 4, 1)`

### Application

```typescript
function applySymbolBoost(
  results: SearchResult[],
  { query, codemap }: { query: string; codemap: Codemap }
): void
```

Mutates results in place, adding:
- `symbolBoost`: The applied boost value
- `symbolBoostSources`: Array of boost sources (`["signature", "neighbor"]`)
- `symbolMatchStrength`: Signature match strength (0-1)
- `symbolNeighborStrength`: Best neighbor match strength (0-1)

### Performance

- Uses LRU cache (1000 entries) for compiled regex patterns
- Token length minimum of 3 characters to avoid matching common words

---

## API Reranking

External reranking services can be used to improve result ordering.

Implementation location: `/Users/shariqriaz/projects/codevault/src/ranking/api-reranker.ts`

### Supported Providers

- Cohere (`rerank-v3.5`)
- Jina AI
- Novita AI (`qwen/qwen3-reranker-8b`)
- Any provider following the standard reranking API format

### Configuration

| Environment Variable | Description |
|---------------------|-------------|
| `CODEVAULT_RERANK_API_URL` | Reranking API endpoint |
| `CODEVAULT_RERANK_API_KEY` | API authentication key |
| `CODEVAULT_RERANK_MODEL` | Model name (default: `rerank-v3.5`) |
| `CODEVAULT_RERANK_TIMEOUT_MS` | Request timeout (default: 15000) |
| `CODEVAULT_RERANKER_MAX` | Max candidates to rerank (default: 50) |
| `CODEVAULT_RERANKER_MAX_TOKENS` | Max tokens per document (default: 8191) |

### API Interface

```typescript
async function rerankWithAPI(
  query: string,
  candidates: Candidate[],
  options?: {
    max?: number;
    maxTokens?: number;
    getText?: (candidate: Candidate) => string;
    getTextAsync?: (candidate: Candidate) => Promise<string>;
    apiUrl?: string;
    apiKey?: string;
    model?: string;
  }
): Promise<Candidate[]>
```

### Behavior

- Text is truncated to `maxTokens * 4` characters before sending
- Supports both sync and async text extraction functions
- On failure, silently falls back to original ordering (logs warning)
- Response format auto-detection: `{results: [...]}`, `{data: [...]}`, or direct array

---

## Caching Strategy

### BM25 Index Cache

- **Type**: LRU (Least Recently Used)
- **Size**: 10 indices (configurable via `CODEVAULT_MAX_BM25_CACHE`)
- **Key**: `${basePath}::${providerName}::${dimensions}`
- **Behavior**: Indices are incrementally updated with new chunks

### Chunk Text Cache

- **Type**: LRU
- **Size**: 1000 entries (configurable via `CODEVAULT_MAX_CHUNK_CACHE`)
- **Key**: `${basePath}::${sha}`
- **Behavior**: Caches code text read from disk (including null for missing files)

### Regex Cache (Symbol Boost)

- **Type**: LRU
- **Size**: 1000 patterns
- **Key**: Token string
- **Behavior**: Caches compiled regex for token matching

### Cache Clearing

```typescript
// Clear all search caches
searchService.clearCaches();

// Clear hybrid fusion caches only
hybridFusion.clearCaches();
```

Recommended for long-running processes: call `clearCaches()` periodically or on configuration changes.

---

## Configuration

### Constants

Defined in `/Users/shariqriaz/projects/codevault/src/config/constants.ts`:

```typescript
SEARCH_CONSTANTS = {
  RERANKER_MAX_CANDIDATES: 50,    // Max candidates for reranking
  MAX_CHUNK_SIZE: 100_000,        // Max chunk size in bytes
  DEFAULT_SEARCH_LIMIT: 10,       // Default result count
  MAX_SEARCH_LIMIT: 200,          // Maximum result count
  BM25_PREFILTER_LIMIT: 500,      // Max BM25 candidates for prefiltering
  SELECTION_BUDGET_MULTIPLIER: 60,
  RRF_K_CONSTANT: 60              // RRF k parameter
}

SYMBOL_BOOST_CONSTANTS = {
  SIGNATURE_MATCH_BOOST: 0.3,
  NEIGHBOR_MATCH_BOOST: 0.15,
  MAX_SYMBOL_BOOST: 0.45,
  MIN_TOKEN_LENGTH: 3,
  MAX_PARAMETERS: 12
}

CACHE_CONSTANTS = {
  MAX_BM25_CACHE_SIZE: 10,
  MAX_CHUNK_TEXT_CACHE_SIZE: 1000,
  CACHE_CLEAR_INTERVAL_MS: 3600000  // 1 hour
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CODEVAULT_MAX_BM25_CACHE` | 10 | BM25 index cache size |
| `CODEVAULT_MAX_CHUNK_CACHE` | 1000 | Chunk text cache size |
| `CODEVAULT_MAX_QUERY_CHARS` | 5000 | Maximum query length |
| `CODEVAULT_BM25_PREFILTER_LIMIT` | 500 | BM25 prefilter candidate limit |

---

## API Reference

### SearchService

```typescript
class SearchService {
  // Warm up caches for a project
  async warmup(workingPath?: string, provider?: string): Promise<void>

  // Clear all caches
  clearCaches(): void

  // Perform search
  async search(
    query: string,
    limit?: number,
    provider?: string,
    workingPath?: string,
    scopeOptions?: ScopeFilters
  ): Promise<SearchCodeResult>

  // Get project overview (no query)
  async getOverview(limit?: number, workingPath?: string): Promise<SearchCodeResult>

  // Get a specific chunk by SHA
  async getChunk(sha: string, workingPath?: string): Promise<GetChunkResult>

  // Normalize query string
  normalizeQuery(query: string): string
}
```

### Search Result Structure

```typescript
interface SearchCodeResult {
  success: boolean;
  query?: string;
  error?: string;
  message?: string;
  searchType?: 'hybrid' | 'vector';
  vectorResults?: number;
  provider?: string;
  scope?: ScopeFilters;
  reranker?: RerankMode;
  hybrid?: {
    enabled: boolean;
    bm25Enabled: boolean;
    fused?: boolean;
    bm25Candidates?: number;
  };
  symbolBoost?: {
    enabled: boolean;
    boosted: boolean;
  };
  chunkLoadingFailures?: {
    totalAttempted: number;
    failed: number;
    reasons: Record<string, number>;
  };
  warnings?: string[];
  results: SearchResult[];
}

interface SearchResult {
  type: 'code';
  lang: string;
  path: string;
  sha: string;
  data: null;
  meta: {
    id: string;
    symbol: string;
    score: number;
    intent?: string;
    description?: string;
    searchType?: string;
    vectorScore?: number;
    hybridScore?: number;
    bm25Score?: number;
    bm25Rank?: number;
    vectorRank?: number;
    rerankerScore?: number;
    rerankerRank?: number;
    symbolBoost?: number;
    symbolBoostSources?: string[];
    scoreRaw?: number;
  };
}
```

---

## Usage Examples

### Basic Search

```typescript
import { SearchService } from 'codevault';

const searchService = new SearchService();
await searchService.warmup('/path/to/project');

const results = await searchService.search('authentication middleware', 10);
```

### Filtered Search

```typescript
const results = await searchService.search(
  'payment processing',
  20,
  'auto',
  '/path/to/project',
  {
    path_glob: ['src/payments/**/*.ts'],
    lang: ['typescript'],
    tags: ['stripe', 'checkout'],
    hybrid: true,
    bm25: true,
    symbol_boost: true,
    reranker: 'api'
  }
);
```

### Direct BM25 Usage

```typescript
import { BM25Index, buildBm25Document } from 'codevault/search/bm25';

const index = new BM25Index();

// Add documents
index.addDocuments([
  { id: 'chunk1', text: buildBm25Document(chunk1, code1) },
  { id: 'chunk2', text: buildBm25Document(chunk2, code2) }
]);

// Consolidate before searching
index.consolidate();

// Search
const results = index.search('authentication', 10);
// Returns: [{ id: 'chunk1', score: 0.85 }, ...]
```

### Direct RRF Usage

```typescript
import { reciprocalRankFusion } from 'codevault/search/hybrid';

const fused = reciprocalRankFusion({
  vectorResults: [
    { id: 'a', score: 0.9 },
    { id: 'b', score: 0.8 }
  ],
  bm25Results: [
    { id: 'b', score: 15.2 },
    { id: 'c', score: 12.1 }
  ],
  limit: 10,
  k: 60
});
// Returns items sorted by RRF score with rank metadata
```

---

## Performance Considerations

1. **BM25 Prefiltering**: When hybrid search is enabled, BM25 is used to prefilter candidates before vector scoring. This reduces the number of expensive cosine similarity computations.

2. **Cache Warming**: Call `warmup()` before searching to initialize caches and avoid cold-start latency.

3. **Query Length**: Queries are limited to 5000 characters by default. Adjust via `CODEVAULT_MAX_QUERY_CHARS`.

4. **Long-Running Processes**: Call `clearCaches()` periodically (default: every hour) to prevent memory growth.

5. **Symbol Boost Overhead**: Symbol boosting adds latency proportional to result count and codemap size. Disable via `symbol_boost: false` if not needed.

6. **API Reranking Latency**: External reranking adds network latency. The top 50 candidates are sent by default to balance quality and speed.

---

## Source Files

| File | Description |
|------|-------------|
| `/Users/shariqriaz/projects/codevault/src/search/bm25.ts` | BM25 index implementation |
| `/Users/shariqriaz/projects/codevault/src/search/hybrid.ts` | Reciprocal Rank Fusion algorithm |
| `/Users/shariqriaz/projects/codevault/src/search/scope.ts` | Scope filter normalization and application |
| `/Users/shariqriaz/projects/codevault/src/core/SearchService.ts` | Main search orchestrator |
| `/Users/shariqriaz/projects/codevault/src/core/search/CandidateRetriever.ts` | Vector similarity and boosting |
| `/Users/shariqriaz/projects/codevault/src/core/search/HybridFusion.ts` | BM25 caching and fusion |
| `/Users/shariqriaz/projects/codevault/src/core/search/ResultMapper.ts` | Result formatting and reranking |
| `/Users/shariqriaz/projects/codevault/src/ranking/symbol-boost.ts` | Symbol-based boosting |
| `/Users/shariqriaz/projects/codevault/src/ranking/api-reranker.ts` | External API reranking |
| `/Users/shariqriaz/projects/codevault/src/types/search.ts` | Type definitions |
| `/Users/shariqriaz/projects/codevault/src/config/constants.ts` | Configuration constants |
