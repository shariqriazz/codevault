# Core Architecture Documentation

**Version:** 1.8.5
**Last Updated:** December 2024

This document provides comprehensive documentation for the CodeVault core indexing and search system located in `src/core/`.

## Table of Contents

1. [Overview](#overview)
2. [Indexing System](#indexing-system)
   - [IndexerEngine](#indexerengine)
   - [IndexContext](#indexcontext)
   - [IndexState](#indexstate)
   - [FileProcessor](#fileprocessor)
   - [ChunkPipeline](#chunkpipeline)
   - [PersistManager](#persistmanager)
   - [IndexFinalizationStage](#indexfinalizationstage)
   - [BatchEmbeddingProcessor](#batchembeddingprocessor)
3. [Search System](#search-system)
   - [SearchService](#searchservice)
   - [SearchContextManager](#searchcontextmanager)
   - [CandidateRetriever](#candidateretriever)
   - [HybridFusion](#hybridfusion)
   - [ResultMapper](#resultmapper)
4. [Data Flow Diagrams](#data-flow-diagrams)
5. [Type Definitions](#type-definitions)
6. [Configuration Options](#configuration-options)
7. [Error Handling](#error-handling)

---

## Overview

The core system is divided into two main pipelines:

1. **Indexing Pipeline**: Processes source code files, extracts semantic chunks, generates embeddings, and stores them in SQLite + file-based storage.

2. **Search Pipeline**: Executes hybrid search queries combining vector similarity with BM25 keyword matching via Reciprocal Rank Fusion (RRF).

### Directory Structure

```
src/core/
├── IndexerEngine.ts      # Main indexing orchestrator
├── SearchService.ts      # Main search orchestrator
├── batch-indexer.ts      # Batch embedding processor with retry logic
├── indexer.ts            # Public indexProject() function
├── search.ts             # Public search functions
├── types.ts              # Core type definitions
├── metadata.ts           # Metadata extraction utilities
├── unified-metadata.ts   # Unified metadata extraction
├── symbol-extractor.ts   # Symbol name extraction from AST
├── indexing/
│   ├── file-scanner.ts          # File discovery
│   ├── FileProcessor.ts         # Individual file processing
│   ├── IndexContext.ts          # Context initialization
│   ├── IndexState.ts            # Mutable state tracking
│   ├── IndexFinalizationStage.ts # Finalization and cleanup
│   ├── PersistManager.ts        # Debounced persistence
│   └── chunk-pipeline.ts        # AST traversal and chunking
└── search/
    ├── SearchContextManager.ts  # Context caching
    ├── CandidateRetriever.ts    # Vector similarity scoring
    ├── HybridFusion.ts          # BM25 + vector fusion
    └── ResultMapper.ts          # Result formatting
```

---

## Indexing System

### IndexerEngine

**Location:** `/Users/shariqriaz/projects/codevault/src/core/IndexerEngine.ts`

The `IndexerEngine` class orchestrates the entire indexing process using a stage-based architecture.

#### Class Definition

```typescript
export class IndexerEngine {
  constructor(private options: IndexProjectOptions = {})
  public async index(): Promise<IndexProjectResult>
}
```

#### Indexing Stages

1. **File Scanning** - Discovers indexable files using glob patterns
2. **Context Preparation** - Initializes database, provider, and state
3. **File Processing** - Processes each file with configurable concurrency
4. **Deleted File Handling** - Removes artifacts for deleted files
5. **Finalization** - Flushes embeddings, builds symbol graph, saves state

#### Concurrency Resolution

The engine determines concurrency using this priority:

1. Explicit `concurrency` option
2. `CODEVAULT_INDEXING_CONCURRENCY` environment variable
3. Dynamic calculation: `min(cpuCount * 2, MAX_CONCURRENCY)`
4. Fallback: `DEFAULT_CONCURRENCY`

#### Key Methods

| Method | Description |
|--------|-------------|
| `index()` | Main entry point that executes the full indexing pipeline |
| `normalizeFileLists()` | Normalizes changed/deleted file paths to project-relative paths |
| `scanFiles()` | Discovers files eligible for indexing |
| `resolveConcurrency()` | Determines optimal concurrency level |
| `runWithConcurrency()` | Executes tasks with controlled parallelism |

#### Usage Example

```typescript
import { IndexerEngine } from './IndexerEngine.js';

const engine = new IndexerEngine({
  repoPath: '/path/to/repo',
  provider: 'openai',
  concurrency: 4,
  onProgress: (event) => console.log(event)
});

const result = await engine.index();
```

---

### IndexContext

**Location:** `/Users/shariqriaz/projects/codevault/src/core/indexing/IndexContext.ts`

Prepares the indexing environment by initializing all required resources.

#### Context Data Structure

```typescript
interface IndexContextData {
  repo: string;                    // Resolved repository path
  repoPath: string;                // Original repoPath option
  provider: string;                // Provider name
  providerInstance: EmbeddingProvider;
  providerName: string;
  modelName: string | null;
  modelProfile: ModelProfile;
  limits: SizeLimits;              // Chunking size limits
  codemapPath: string;             // Path to codevault.codemap.json
  chunkDir: string;                // Path to .codevault/chunks/
  dbPath: string;                  // Path to .codevault/codevault.db
  encryptionPreference: EncryptionPreference;
  codemap: Codemap;                // Loaded codemap
  merkle: MerkleTree;              // Previous merkle tree
  updatedMerkle: MerkleTree;       // Cloned merkle for updates
  db: Database;                    // SQLite connection
  batchProcessor: BatchEmbeddingProcessor;
  isPartialUpdate: boolean;        // True if changedFiles provided
}
```

#### Initialization Flow

1. Validate repository path exists
2. Resolve provider context from configuration
3. Create or reuse embedding provider
4. Get model profile and size limits
5. Initialize database with correct dimensions
6. Check for dimension/provider mismatches
7. Setup encryption preferences
8. Load existing codemap and merkle tree
9. Create batch embedding processor

#### Dimension Mismatch Detection

When existing embeddings have different dimensions or provider than the current configuration, the system logs a warning and recommends a full re-index:

```
WARNING: Dimension/Provider Mismatch Detected!
  existing: [{ provider: 'openai', dimensions: 1536 }]
  current: { provider: 'local', dimensions: 768 }
  recommendation: 'Full re-index recommended'
```

---

### IndexState

**Location:** `/Users/shariqriaz/projects/codevault/src/core/indexing/IndexState.ts`

Tracks mutable state during the indexing process.

#### State Properties

| Property | Type | Description |
|----------|------|-------------|
| `codemap` | `Codemap` | Current codemap being built |
| `updatedMerkle` | `MerkleTree` | Updated merkle tree |
| `merkleDirty` | `boolean` | Whether merkle needs saving |
| `indexMutated` | `boolean` | Whether codemap needs saving |
| `processedChunks` | `number` | Count of processed chunks |
| `errors` | `IndexError[]` | Accumulated errors |
| `chunkingStats` | `ChunkingStats` | Chunking statistics |

#### ChunkingStats Structure

```typescript
interface ChunkingStats {
  totalNodes: number;      // Total AST nodes analyzed
  skippedSmall: number;    // Nodes too small to chunk
  subdivided: number;      // Large nodes that were split
  statementFallback: number; // Oversized nodes using statement chunking
  normalChunks: number;    // Standard-sized chunks
  mergedSmall: number;     // Small chunks merged together
  fileGrouped?: number;    // Files with grouped functions
  functionsGrouped?: number; // Total functions in groups
}
```

---

### FileProcessor

**Location:** `/Users/shariqriaz/projects/codevault/src/core/indexing/FileProcessor.ts`

Handles individual file processing including parsing, chunking, and storage.

#### Processing Flow

1. **Read file** and compute file hash
2. **Skip if unchanged** (compare with previous merkle)
3. **Collect AST nodes** using Tree-sitter
4. **Group nodes** for optimal chunking
5. **Process groups** through the chunk pipeline
6. **Delete stale chunks** no longer in the file
7. **Update merkle tree** with new file hash

#### Fallback Processing

When normal processing fails (parse errors, etc.), the system falls back to whole-file indexing:

```typescript
// Fallback creates a single chunk for the entire file
const fallbackSymbol = path.basename(rel);
const chunkId = `${rel}:fallback:${sha.substring(0, 8)}`;
```

#### Chunk Storage

Each chunk is stored in two locations:

1. **SQLite database** - Metadata and embeddings
2. **File system** - Raw code in `.codevault/chunks/` (optionally encrypted)

---

### ChunkPipeline

**Location:** `/Users/shariqriaz/projects/codevault/src/core/indexing/chunk-pipeline.ts`

Orchestrates AST traversal and semantic chunking with multiple components.

#### Components

1. **ASTTraverser** - Collects candidate nodes from Tree-sitter parse trees
2. **ChunkGrouper** - Groups related nodes for batch processing
3. **StatementOverlapStrategy** - Splits oversized nodes with 20% overlap

#### Node Collection Rules

The traverser collects nodes based on language-specific rules:

- Skips into `export_statement` to find declarations
- Respects `nodeTypes` from language rules
- Handles nested structures (classes containing methods)

#### Chunk Processing Logic

```
For each node:
  1. Analyze size using analyzeNodeForChunking()

  2. If size < min and has parent:
     → Skip (will be included in parent)

  3. If needs subdivision:
     → Recursively process child nodes
     → Merge small children if total >= min or count >= 3

  4. If size > max:
     → Fall back to statement-level chunking with overlap

  5. Otherwise:
     → Create normal chunk
```

#### Chunk ID Format

```
{file_path}:{symbol_name}:{sha_first_8_chars}
```

Example: `src/utils/logger.ts:createLogger:a1b2c3d4`

---

### PersistManager

**Location:** `/Users/shariqriaz/projects/codevault/src/core/indexing/PersistManager.ts`

Manages debounced persistence of codemap and merkle tree to avoid excessive I/O.

#### Debounce Behavior

- Default debounce: 1500ms
- Saves are serialized to prevent race conditions
- `flush()` forces immediate save of pending changes

#### Usage Pattern

```typescript
// During file processing
persistManager.scheduleCodemapSave();
persistManager.scheduleMerkleSave();

// At finalization
await persistManager.flush();
```

---

### IndexFinalizationStage

**Location:** `/Users/shariqriaz/projects/codevault/src/core/indexing/IndexFinalizationStage.ts`

Handles the finalization phase of indexing.

#### Finalization Steps

1. Flush remaining embeddings from batch processor
2. Build symbol relationship graph
3. Clean up orphaned chunks (files no longer exist)
4. Persist codemap and merkle tree
5. Collect token statistics
6. Log chunking statistics
7. Close database connection

#### Orphan Cleanup

Identifies and removes chunks whose source files no longer exist:

```typescript
for (const rel of paths) {
  const full = path.join(base, rel);
  if (!fs.existsSync(full)) {
    orphaned.push(rel);
  }
}
```

---

### BatchEmbeddingProcessor

**Location:** `/Users/shariqriaz/projects/codevault/src/core/batch-indexer.ts`

Efficiently batches embedding generation with sophisticated retry logic.

#### Batch Configuration

| Constant | Default | Description |
|----------|---------|-------------|
| `BATCH_SIZE` | 50 | Chunks per API call |
| `MAX_BATCH_RETRIES` | 3 | Rate limit retries |
| `MAX_TRANSIENT_RETRIES` | 3 | Transient error retries |
| `MAX_FATAL_RETRIES` | 1 | Fatal error retries before fallback |
| `MAX_ANY_RETRIES` | 6 | Total retry cap |
| `INITIAL_RETRY_DELAY_MS` | 1000 | Initial backoff delay |

#### Error Handling Strategy

| Error Type | Detection | Strategy |
|------------|-----------|----------|
| Rate Limit | HTTP 429, "rate limit" | Exponential backoff, retry batch |
| Batch Size | HTTP 413, "too large" | Split batch in half, retry halves |
| Transient | HTTP 5xx, connection errors | Backoff with jitter, retry batch |
| Fatal | HTTP 400/422, invalid response | One retry, then per-chunk fallback |

#### Jitter Formula

```typescript
const withJitter = (base: number): number => {
  const factor = 1 + (Math.random() * 2 - 1) * 0.2; // 0.8-1.2
  return Math.max(0, Math.floor(base * factor));
};
```

#### Per-Chunk Fallback

When batch processing fails completely, chunks are processed individually to minimize data loss:

```typescript
for (const chunk of batch) {
  try {
    const embedding = await provider.generateEmbedding(chunk.text);
    db.insertChunk({ ...chunk, embedding });
  } catch (error) {
    errors.push({ chunkId: chunk.id, error });
    // Continue with remaining chunks
  }
}
```

---

## Search System

### SearchService

**Location:** `/Users/shariqriaz/projects/codevault/src/core/SearchService.ts`

Main orchestrator for the search pipeline using specialized sub-services.

#### Class Definition

```typescript
export class SearchService {
  constructor()
  public async warmup(workingPath?: string, provider?: string): Promise<void>
  public clearCaches(): void
  public async search(
    query: string,
    limit?: number,
    provider?: string,
    workingPath?: string,
    scopeOptions?: ScopeFilters
  ): Promise<SearchCodeResult>
  public async getOverview(limit?: number, workingPath?: string): Promise<SearchCodeResult>
  public async getChunk(sha: string, workingPath?: string): Promise<GetChunkResult>
}
```

#### Search Pipeline Steps

1. **Query Normalization** - Lowercase, trim, remove question marks
2. **Context Warmup** - Initialize provider, load codemap
3. **Scope Filtering** - Apply path, language, tag filters
4. **BM25 Prefiltering** - Narrow candidates using keyword matching
5. **Vector Pool Building** - Compute similarity scores
6. **Symbol Boosting** - Boost based on signature/parameter matches
7. **Hybrid Fusion** - Combine vector + BM25 via RRF
8. **API Reranking** - Optional external reranker
9. **Score Enforcement** - Cap scores at 1.0
10. **Result Mapping** - Format for output

#### Query Length Limit

```typescript
const MAX_QUERY_CHARS = process.env.CODEVAULT_MAX_QUERY_CHARS || 5000;
```

#### Search Result Structure

```typescript
interface SearchCodeResult {
  success: boolean;
  query?: string;
  searchType?: 'vector' | 'hybrid';
  vectorResults?: number;
  provider: string;
  scope?: ScopeFilters;
  reranker?: string;
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
  chunkLoadingFailures?: ChunkLoadingFailures;
  warnings?: string[];
  results: SearchResult[];
  error?: string;
  message?: string;
}
```

---

### SearchContextManager

**Location:** `/Users/shariqriaz/projects/codevault/src/core/search/SearchContextManager.ts`

Manages lazy initialization and caching of search resources.

#### Cached Resources

- Database connection
- Embedding provider (initialized)
- Codemap data
- Chunk cache

#### TTL Configuration

```typescript
// Default: 5 minutes
const defaultTtl = 5 * 60 * 1000;
// Override via environment variable
const envTtl = process.env.CODEVAULT_SEARCH_CONTEXT_TTL_MS;
```

#### Cache Invalidation

Context is invalidated when:

1. Provider name changes
2. TTL expires
3. `cleanup()` is called explicitly

#### Codemap Refresh

The manager automatically refreshes the codemap if the underlying file has been modified (based on mtime comparison).

---

### CandidateRetriever

**Location:** `/Users/shariqriaz/projects/codevault/src/core/search/CandidateRetriever.ts`

Handles vector similarity computation and initial candidate scoring.

#### Scoring Components

1. **Vector Similarity** - Cosine similarity between query and chunk embeddings
2. **Intent Boost** - If chunk intent matches query terms
3. **Tag Boost** - If chunk tags match query terms
4. **Doc Boost** - Bonus for documentation files (README, docs/, .md)

#### Boost Constants

From `config/constants.ts`:

```typescript
DOC_BOOST_CONSTANTS = {
  INTENT_MATCH_BOOST: 0.1,
  TAG_MATCH_BOOST: 0.05
};
DOC_BOOST = 0.05;
```

#### Final Score Calculation

```typescript
const finalScore = Math.min(1, Math.max(0,
  vectorSimilarity + boostScore + docBoost
));
```

#### Cosine Similarity Implementation

```typescript
private cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

---

### HybridFusion

**Location:** `/Users/shariqriaz/projects/codevault/src/core/search/HybridFusion.ts`

Manages BM25 indexing and Reciprocal Rank Fusion of results.

#### Cache Configuration

```typescript
CACHE_CONSTANTS = {
  MAX_BM25_CACHE_SIZE: 10,      // BM25 indices per workspace
  MAX_CHUNK_TEXT_CACHE_SIZE: 1000  // Chunk texts
};
```

#### BM25 Cache Key Format

```
{basePath}::{providerName}::{dimensions}
```

#### Reciprocal Rank Fusion

Combines vector and BM25 results using the RRF formula:

```
RRF_score(d) = sum(1 / (k + rank(d)))
```

Where `k = 60` (default RRF constant).

#### Chunk Loading Statistics

Tracks failures when loading chunk text for BM25:

```typescript
interface ChunkLoadingStats {
  totalAttempted: number;
  failed: number;
  reasons: Map<string, number>;
  // Reason keys: 'encryption_key_required', 'encryption_auth_failed',
  //              'file_not_found', 'unknown_error'
}
```

#### Warning Messages

Generated based on loading failures:

- "Could not load X encrypted chunk(s). Set CODEVAULT_ENCRYPTION_KEY..."
- "Failed to decrypt X chunk(s). The encryption key may be incorrect."
- "X chunk file(s) not found. The index may be out of sync. Try re-indexing."

---

### ResultMapper

**Location:** `/Users/shariqriaz/projects/codevault/src/core/search/ResultMapper.ts`

Formats search candidates into final results and applies reranking.

#### Result Metadata

```typescript
interface SearchResultMeta {
  id?: string;
  symbol: string;
  score: number;           // Capped at 1.0
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
  scoreRaw?: number;       // Original score if > 1.0
}
```

#### API Reranking

When `reranker: 'api'` is specified in scope options:

1. Top candidates are sent to external reranker API
2. Results are reordered based on reranker scores
3. Falls back to original ranking on failure

#### Sorting Priority

1. Reranker score (if available)
2. Final score

---

## Data Flow Diagrams

### Indexing Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        IndexerEngine                             │
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────────┐    │
│  │ FileScanner │───▶│IndexContext │───▶│   IndexState     │    │
│  │             │    │  prepare()  │    │                  │    │
│  └─────────────┘    └─────────────┘    └──────────────────┘    │
│         │                  │                    │               │
│         ▼                  ▼                    ▼               │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────────┐    │
│  │ file list   │    │  provider   │    │    codemap       │    │
│  │             │    │  database   │    │    merkle        │    │
│  │             │    │  codemap    │    │    errors        │    │
│  └─────────────┘    └─────────────┘    └──────────────────┘    │
│         │                  │                    │               │
│         ▼                  ▼                    ▼               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    FileProcessor                         │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │   │
│  │  │ChunkPipeline│─▶│BatchEmbed-  │─▶│ PersistManager  │  │   │
│  │  │             │  │  Processor  │  │                 │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │               IndexFinalizationStage                     │   │
│  │   - Flush embeddings                                     │   │
│  │   - Build symbol graph                                   │   │
│  │   - Clean orphans                                        │   │
│  │   - Save codemap & merkle                                │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 IndexProjectResult                       │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Search Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        SearchService                             │
│                                                                  │
│  Query ──▶ normalizeQuery() ──▶ "how to create session"         │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              SearchContextManager                        │   │
│  │   - Load/cache database                                  │   │
│  │   - Initialize provider                                  │   │
│  │   - Load codemap                                         │   │
│  │   - Cache chunks                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                                                       │
│         ▼                                                       │
│  applyScope() ──▶ filtered chunks                               │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │               HybridFusion.prefilterCandidates()         │   │
│  │   - Build/get cached BM25 index                          │   │
│  │   - Get top BM25 matches                                 │   │
│  │   - Return candidate IDs                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              CandidateRetriever.buildVectorPool()        │   │
│  │   - Generate query embedding                             │   │
│  │   - Compute cosine similarity                            │   │
│  │   - Apply intent/tag/doc boosts                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                                                       │
│         ▼                                                       │
│  applySymbolBoost() ──▶ boosted candidates                      │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                HybridFusion.fuseResults()                │   │
│  │   - Reciprocal Rank Fusion                               │   │
│  │   - Merge vector + BM25 scores                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │               ResultMapper.applyReranker()               │   │
│  │   (optional - if reranker: 'api')                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                                                       │
│         ▼                                                       │
│  enforceScoreBounds() ──▶ mapResults() ──▶ sortByScore()        │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   SearchCodeResult                       │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Type Definitions

### IndexProjectOptions

```typescript
interface IndexProjectOptions {
  repoPath?: string;           // Path to repository (default: '.')
  provider?: string;           // Embedding provider (default: 'auto')
  onProgress?: ((event: ProgressEvent) => void) | null;
  changedFiles?: string[] | null;  // For incremental indexing
  deletedFiles?: string[];         // Files to remove from index
  embeddingProviderOverride?: EmbeddingProvider | null;
  encryptMode?: string;        // 'always' | 'never' | 'auto'
  concurrency?: number;        // Max parallel file processing
}
```

### IndexProjectResult

```typescript
interface IndexProjectResult {
  success: boolean;
  processedChunks: number;
  totalChunks: number;
  provider: string;
  errors: IndexError[];
  chunkingStats?: ChunkingStats;
  tokenStats?: TokenStats;
}
```

### SearchResult

```typescript
interface SearchResult {
  type: 'code';
  lang: string;              // Language identifier
  path: string;              // File path relative to repo
  sha: string;               // Content hash for chunk retrieval
  data: string | null;       // Code content (if loaded)
  meta: {
    id?: string;
    symbol: string;
    score: number;
    searchType?: string;
    intent?: string;
    description?: string;
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

## Configuration Options

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CODEVAULT_INDEXING_CONCURRENCY` | Max parallel file processing | CPU count * 2 |
| `CODEVAULT_MAX_QUERY_CHARS` | Max query length | 5000 |
| `CODEVAULT_SEARCH_CONTEXT_TTL_MS` | Search context cache TTL | 300000 (5 min) |
| `CODEVAULT_ENCRYPTION_KEY` | AES-256 encryption key | - |
| `CODEVAULT_QUIET` | Suppress non-error logs | - |

### Constants

Key constants from `config/constants.ts`:

```typescript
// Indexing
BATCH_SIZE = 50;              // Chunks per embedding API call
DEFAULT_CONCURRENCY = 4;
MAX_CONCURRENCY = 16;

// Search
RRF_K = 60;                   // Reciprocal Rank Fusion constant
DEFAULT_SEARCH_LIMIT = 20;
BM25_PREFILTER_LIMIT = 100;
RERANKER_MAX_CANDIDATES = 50;

// Caching
MAX_BM25_CACHE_SIZE = 10;
MAX_CHUNK_TEXT_CACHE_SIZE = 1000;

// Chunking
SIZE_THRESHOLD = 100000;      // Use streaming parser above this
CHUNK_SIZE = 65536;           // Streaming parser chunk size
```

---

## Error Handling

### Error Types

| Type | Description |
|------|-------------|
| `processing_error` | Failed to process file (parse error, etc.) |
| `fallback_error` | Fallback processing also failed |
| `indexing_error` | Failed to embed/store chunk |
| `finalize_error` | Error during finalization |
| `db_close_error` | Error closing database |

### Error Recovery Strategies

1. **File Processing Errors**
   - Attempt fallback whole-file indexing
   - Record error and continue with other files

2. **Embedding API Errors**
   - Rate limits: Exponential backoff with retry
   - Batch too large: Split and retry
   - Fatal errors: Fall back to per-chunk processing

3. **Search Errors**
   - Return structured error result
   - Include error type and message

### Logging Levels

The system uses structured logging with levels:

- `debug` - Batch processing details, cache operations
- `info` - Configuration, statistics, orphan cleanup
- `warn` - Non-fatal errors, dimension mismatches
- `error` - Critical failures

---

## Public API Functions

### Indexing

```typescript
// Main indexing function
import { indexProject } from './core/indexer.js';

const result = await indexProject({
  repoPath: '/path/to/repo',
  provider: 'openai',
  onProgress: (event) => console.log(event)
});
```

### Search

```typescript
import {
  searchCode,
  getOverview,
  getChunk,
  warmupSearch,
  clearSearchCaches
} from './core/search.js';

// Execute search
const results = await searchCode('user authentication', 10, 'auto', '.', {
  paths: ['src/'],
  language: 'typescript',
  hybrid: true,
  bm25: true,
  symbol_boost: true
});

// Get index overview
const overview = await getOverview(20, '.');

// Retrieve chunk content
const chunk = await getChunk('a1b2c3d4e5f6', '.');

// Preload caches
await warmupSearch('.', 'auto');

// Clear caches
clearSearchCaches();
```

---

## Best Practices

### For Indexing

1. Use incremental updates (`changedFiles`) when possible
2. Set appropriate concurrency for your hardware
3. Monitor `chunkingStats` for optimization opportunities
4. Handle `onProgress` events for user feedback

### For Search

1. Call `warmupSearch()` before first query for faster response
2. Use scope filters to narrow results
3. Clear caches periodically in long-running processes
4. Monitor `chunkLoadingFailures` for index health

### For Error Handling

1. Check `result.success` before processing results
2. Log `result.errors` for debugging
3. Handle `result.warnings` for user feedback
4. Implement retry logic for transient failures
