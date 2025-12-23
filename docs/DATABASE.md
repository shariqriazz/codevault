# Database Layer Documentation

**Version:** 1.8.5
**Location:** `/src/database/db.ts`

## Overview

CodeVault uses SQLite via `better-sqlite3` as its persistence layer for storing code chunks, embeddings, intention caches, and query patterns. The database is designed for high-performance semantic code search with binary embedding storage and prepared statement optimization.

## Architecture

```
CodeVaultDatabase
    |
    +-- code_chunks        (primary storage for indexed code)
    +-- intention_cache    (maps queries to target chunks)
    +-- query_patterns     (tracks search patterns for optimization)
```

## Database Location

The database file is created at:
```
<repository_root>/.codevault/codevault.db
```

## Schema

### code_chunks Table

Primary storage for indexed code chunks with their embeddings.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PRIMARY KEY | Unique chunk identifier |
| `file_path` | TEXT NOT NULL | Relative path to the source file |
| `symbol` | TEXT NOT NULL | Symbol name (function, class, etc.) |
| `sha` | TEXT NOT NULL | SHA hash of the chunk content |
| `lang` | TEXT NOT NULL | Programming language identifier |
| `chunk_type` | TEXT | Type of chunk (default: 'function') |
| `embedding` | BLOB | Binary Float32 vector embedding |
| `embedding_provider` | TEXT | Provider name (e.g., 'openai', 'voyage') |
| `embedding_dimensions` | INTEGER | Vector dimensionality (e.g., 1536, 3072) |
| `codevault_tags` | TEXT | JSON array of semantic tags |
| `codevault_intent` | TEXT | Inferred purpose of the chunk |
| `codevault_description` | TEXT | Human-readable description |
| `doc_comments` | TEXT | Extracted documentation comments |
| `variables_used` | TEXT | JSON array of variable names |
| `context_info` | TEXT | JSON object with additional context |
| `created_at` | DATETIME | Timestamp of creation |
| `updated_at` | DATETIME | Timestamp of last update |

### intention_cache Table

Caches query-to-chunk mappings for faster repeated searches.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PRIMARY KEY | Auto-increment identifier |
| `query_normalized` | TEXT NOT NULL | Normalized search query |
| `original_query` | TEXT NOT NULL | Original query text |
| `target_sha` | TEXT NOT NULL | SHA of the matched chunk |
| `confidence` | REAL | Match confidence score (default: 1.0) |
| `usage_count` | INTEGER | Number of times this mapping was used |
| `created_at` | DATETIME | Timestamp of creation |
| `last_used` | DATETIME | Timestamp of last use |

### query_patterns Table

Tracks search patterns for usage analytics and optimization.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PRIMARY KEY | Auto-increment identifier |
| `pattern` | TEXT UNIQUE | Normalized query pattern |
| `frequency` | INTEGER | Number of occurrences |
| `typical_results` | TEXT | Common results for this pattern |
| `created_at` | DATETIME | Timestamp of creation |
| `updated_at` | DATETIME | Timestamp of last update |

## Indexes

The following indexes are created for query optimization:

```sql
-- code_chunks indexes
CREATE INDEX idx_file_path ON code_chunks(file_path);
CREATE INDEX idx_symbol ON code_chunks(symbol);
CREATE INDEX idx_lang ON code_chunks(lang);
CREATE INDEX idx_provider ON code_chunks(embedding_provider);
CREATE INDEX idx_chunk_type ON code_chunks(chunk_type);
CREATE INDEX idx_codevault_tags ON code_chunks(codevault_tags);
CREATE INDEX idx_codevault_intent ON code_chunks(codevault_intent);
CREATE INDEX idx_lang_provider ON code_chunks(lang, embedding_provider, embedding_dimensions);

-- intention_cache indexes
CREATE INDEX idx_query_normalized ON intention_cache(query_normalized);
CREATE INDEX idx_target_sha ON intention_cache(target_sha);
CREATE INDEX idx_usage_count ON intention_cache(usage_count DESC);

-- query_patterns indexes
CREATE INDEX idx_pattern_frequency ON query_patterns(frequency DESC);
```

## Configuration

### SQLite PRAGMAs

The database is configured with the following performance optimizations:

| PRAGMA | Default | Environment Variable | Description |
|--------|---------|---------------------|-------------|
| `journal_mode` | WAL | - | Write-Ahead Logging for better concurrency |
| `synchronous` | NORMAL | - | Balance between safety and speed |
| `cache_size` | -16000 (~16MB) | `CODEVAULT_DB_CACHE_SIZE` | Page cache size (negative = KB) |
| `mmap_size` | 268435456 (256MB) | `CODEVAULT_DB_MMAP_SIZE` | Memory-mapped I/O size |
| `temp_store` | MEMORY | `CODEVAULT_DB_TEMP_STORE` | Location for temp tables (MEMORY or FILE) |

### Environment Variables

```bash
# Set cache size to 32MB
export CODEVAULT_DB_CACHE_SIZE=-32000

# Set mmap size to 512MB
export CODEVAULT_DB_MMAP_SIZE=536870912

# Use file-based temp storage
export CODEVAULT_DB_TEMP_STORE=FILE
```

## API Reference

### CodeVaultDatabase Class

#### Constructor

```typescript
constructor(dbPath: string)
```

Opens or creates a database at the specified path. Automatically:
- Enables WAL mode
- Applies performance PRAGMAs
- Creates tables if they do not exist
- Migrates legacy JSON embeddings to binary format

#### Initialization

```typescript
initialize(dimensions: number): void
```

Creates additional tables (`intention_cache`, `query_patterns`) and indexes. Must be called after construction for full functionality.

**Parameters:**
- `dimensions`: Expected embedding dimensions (used for future compatibility checks)

#### Chunk Operations

##### insertChunk

```typescript
insertChunk(params: InsertChunkParams): void
```

Inserts or replaces a single chunk with its embedding.

**InsertChunkParams:**
```typescript
interface InsertChunkParams {
  id: string;                          // Unique identifier
  file_path: string;                   // Relative file path
  symbol: string;                      // Symbol name
  sha: string;                         // Content hash
  lang: string;                        // Language identifier
  chunk_type: string;                  // Chunk type (function, class, etc.)
  embedding: ArrayLike<number>;        // Vector embedding
  embedding_provider: string;          // Provider name
  embedding_dimensions: number;        // Vector dimensions
  codevault_tags: string[];            // Semantic tags
  codevault_intent: string | null;     // Inferred intent
  codevault_description: string | null; // Description
  doc_comments: string | null;         // Documentation comments
  variables_used: string[];            // Variable names
  context_info: Record<string, unknown>; // Additional context
}
```

##### insertChunks

```typescript
insertChunks(chunks: InsertChunkParams[]): void
```

Batch inserts multiple chunks within a single transaction. More efficient than individual inserts.

##### deleteChunks

```typescript
deleteChunks(chunkIds: string[]): void
```

Deletes chunks by their IDs.

##### deleteChunksByFilePath

```typescript
deleteChunksByFilePath(filePath: string): void
```

Deletes all chunks associated with a specific file path. Used for incremental updates when a file is removed.

##### getChunks

```typescript
getChunks(providerName: string, dimensions: number): DatabaseChunk[]
```

Retrieves all chunks matching the specified provider and dimensions.

**Returns:**
```typescript
interface DatabaseChunk {
  id: string;
  file_path: string;
  symbol: string;
  sha: string;
  lang: string;
  chunk_type: string;
  embedding: Buffer;           // Binary Float32 data
  embedding_provider: string;
  embedding_dimensions: number;
  codevault_tags?: string;     // JSON string
  codevault_intent?: string;
  codevault_description?: string;
  doc_comments?: string;
  variables_used?: string;     // JSON string
  context_info?: string;       // JSON string
  created_at?: string;
  updated_at?: string;
}
```

##### getOverviewChunks

```typescript
getOverviewChunks(limit: number): Array<{
  id: string;
  file_path: string;
  symbol: string;
  sha: string;
  lang: string;
}>
```

Retrieves a limited set of chunks for overview/summary purposes.

##### getAllFilePaths

```typescript
getAllFilePaths(): string[]
```

Returns all distinct file paths in the database. Used for orphan cleanup during incremental updates.

##### getExistingDimensions

```typescript
getExistingDimensions(): Array<{
  embedding_provider: string;
  embedding_dimensions: number;
}>
```

Returns existing provider/dimension combinations in the database. Used to detect dimension mismatches.

#### Intention and Pattern Tracking

##### recordIntention

```typescript
recordIntention(
  normalizedQuery: string,
  originalQuery: string,
  targetSha: string,
  confidence: number
): void
```

Records or updates a query-to-chunk mapping. Increments usage count if the mapping already exists.

##### searchByIntention

```typescript
searchByIntention(normalizedQuery: string): unknown
```

Looks up the best matching chunk for a normalized query based on previous successful matches.

##### recordQueryPattern

```typescript
recordQueryPattern(pattern: string): void
```

Records or increments frequency of a query pattern.

#### Transaction Management

##### transaction

```typescript
transaction<T>(fn: () => T): T
```

Executes a synchronous function within a database transaction. Automatically commits on success and rolls back on error.

**Important:** `better-sqlite3` requires transactions to be synchronous. Do not return a Promise from the callback.

```typescript
db.transaction(() => {
  db.insertChunk(chunk1);
  db.insertChunk(chunk2);
  // All inserts succeed or all fail
});
```

##### Manual Transaction Control

```typescript
beginTransaction(): void
commit(): void
rollback(): void
```

For cases requiring async operations between transaction steps.

#### Database Lifecycle

##### close

```typescript
close(): void
```

Closes the database connection. **Always call this when finished to avoid resource leaks.**

##### getStats

```typescript
getStats(): {
  isOpen: boolean;
  inTransaction: boolean;
  readonly: boolean;
  memory: boolean;
}
```

Returns database status for monitoring.

### Helper Functions

#### initDatabase

```typescript
function initDatabase(dimensions: number, basePath?: string): void
```

Convenience function that creates the `.codevault` directory, initializes the database, and closes it. Used for initial setup.

#### decodeEmbedding

```typescript
function decodeEmbedding(buffer: Buffer, dimensions?: number): Float32Array
```

Decodes a stored embedding buffer to a Float32Array. Handles both legacy JSON format and current binary format automatically.

## Embedding Storage

### Binary Format

Embeddings are stored as binary Float32 arrays for efficiency:

```typescript
// Encoding (internal)
function encodeEmbedding(embedding: ArrayLike<number>): Buffer {
  const buffer = Buffer.allocUnsafe(embedding.length * 4);
  for (let i = 0; i < embedding.length; i++) {
    buffer.writeFloatLE(Number(embedding[i]) || 0, i * 4);
  }
  return buffer;
}
```

Benefits of binary storage:
- **Size reduction**: 4 bytes per float vs ~8+ bytes for JSON numbers
- **Fast decoding**: Direct buffer view without JSON parsing
- **Memory efficiency**: Float32Array shares buffer memory

### Legacy Migration

The database automatically migrates legacy JSON-encoded embeddings to binary format on startup. The schema version is tracked via SQLite's `user_version` PRAGMA.

Current schema version: **2**

## Usage Patterns

### Basic Usage

```typescript
import { Database, initDatabase } from './database/db.js';

// Initialize (first time only)
initDatabase(1536, '/path/to/repo');

// Open database
const db = new Database('/path/to/repo/.codevault/codevault.db');
db.initialize(1536);

try {
  // Insert chunk
  db.insertChunk({
    id: 'chunk-123',
    file_path: 'src/utils/helper.ts',
    symbol: 'formatDate',
    sha: 'abc123...',
    lang: 'typescript',
    chunk_type: 'function',
    embedding: new Float32Array(1536),
    embedding_provider: 'openai',
    embedding_dimensions: 1536,
    codevault_tags: ['utility', 'date'],
    codevault_intent: 'format',
    codevault_description: 'Formats a date object',
    doc_comments: '/** Formats date to ISO string */',
    variables_used: ['date', 'locale'],
    context_info: { imports: ['dayjs'] }
  });

  // Query chunks
  const chunks = db.getChunks('openai', 1536);

  // Record intention
  db.recordIntention('format date', 'how to format date', 'abc123...', 0.95);

} finally {
  db.close(); // Always close!
}
```

### Batch Processing

```typescript
import { BatchEmbeddingProcessor } from './core/batch-indexer.js';

const processor = new BatchEmbeddingProcessor(provider, db, 50);

// Queue chunks (auto-flushes at batch size)
for (const chunk of chunks) {
  await processor.addChunk(chunk);
}

// Process remaining
await processor.flush();
```

### Dimension Mismatch Detection

```typescript
const existing = db.getExistingDimensions();
const currentProvider = 'openai';
const currentDimensions = 1536;

const hasMismatch = existing.some(
  row => row.embedding_provider !== currentProvider ||
         row.embedding_dimensions !== currentDimensions
);

if (hasMismatch) {
  console.warn('Provider/dimension mismatch. Full re-index recommended.');
}
```

## Error Handling

All database methods throw errors on failure with contextual information:

```typescript
try {
  db.insertChunk(params);
} catch (error) {
  // Error includes chunk ID for debugging
  console.error('Insert failed:', error.message);
}
```

For non-critical operations like intention recording, errors are logged but do not propagate:

```typescript
// Silently fails, returns null
const result = db.searchByIntention('query');
```

## Performance Considerations

1. **Use batch operations**: `insertChunks()` is significantly faster than repeated `insertChunk()` calls
2. **Close connections**: Always close the database to free file handles
3. **Monitor WAL file**: The WAL file can grow large; SQLite checkpoints automatically
4. **Tune cache size**: Increase `CODEVAULT_DB_CACHE_SIZE` for larger codebases
5. **Use transactions**: Group related operations in transactions for atomicity and speed

## Integration Points

The database integrates with:

- **BatchEmbeddingProcessor** (`/src/core/batch-indexer.ts`): Batch embedding generation with retry logic
- **IndexContext** (`/src/core/indexing/IndexContext.ts`): Database setup during indexing
- **SearchService** (`/src/core/SearchService.ts`): Query execution and result retrieval
- **CandidateRetriever** (`/src/core/search/CandidateRetriever.ts`): Embedding decoding for similarity search
- **SearchContextManager** (`/src/core/search/SearchContextManager.ts`): Database connection caching

## Troubleshooting

### Database Locked

If you see "database locked" errors:
- Ensure you are calling `db.close()` in all code paths
- Check for orphaned processes holding the database
- Consider increasing WAL checkpoint frequency

### Dimension Mismatch Warning

This warning appears when switching embedding providers:
```
Dimension/Provider Mismatch Detected!
```

Resolution: Run a full re-index with `codevault index --force` to regenerate all embeddings.

### Empty Embeddings

If `decodeEmbedding()` returns an empty array:
- Check that the chunk was indexed successfully
- Verify the embedding provider is functioning
- Inspect the raw `embedding` buffer for corruption

### Migration Failures

If legacy embedding migration fails:
- The database may be corrupted
- Delete `.codevault/codevault.db` and re-index
- Check logs for specific error messages
