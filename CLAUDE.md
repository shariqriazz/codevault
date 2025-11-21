# CodeVault - AI-Powered Semantic Code Search

CodeVault is an intelligent code indexing and search system that enables AI assistants to understand and navigate codebases using semantic search, symbol-aware ranking, and hybrid retrieval techniques.

## Project Overview

This is a TypeScript/Node.js project (v1.7.3) that provides:
- **Semantic code search** using vector embeddings with 25+ languages
- **MCP (Model Context Protocol)** integration for AI assistants
- **Symbol-aware ranking** for better code understanding
- **Hybrid retrieval** combining vector embeddings with BM25 keyword matching via Reciprocal Rank Fusion
- **CLI and MCP server** for flexible usage
- **Incremental indexing** with Merkle tree-based change detection
- **LRU caching** for performance optimization
- **Batch processing** with retry logic and fallbacks
- **Integration tests** covering index → search → encryption → watch flows
- **CI/CD** with typecheck/lint/tests on PR/main and npm publish on version bumps (NPM_TOKEN)

## Architecture

### Core Components

- `src/core/` - Core indexing and search functionality
  - `indexer.ts` - Code indexing with Tree-sitter parsing, Merkle tree for incremental updates
  - `search.ts` - Hybrid search (vector + BM25) with LRU caching, symbol boost, API reranking
  - `symbol-extractor.ts` - Extract functions, classes, types with parameter/signature analysis
  - `batch-indexer.ts` - Efficient batch embedding generation (50 chunks/batch) with retry logic
  - `metadata.ts` - Chunk metadata and file information management
  - `types.ts` - Core type definitions

- `src/database/` - SQLite storage layer
  - `db.ts` - Database operations for chunks, embeddings, metadata; binary embeddings, PRAGMAs configurable

- `src/indexer/` - Incremental indexing system
  - `merkle.ts` - Merkle tree for detecting file changes and deletions (path-safe)
  - `update.ts` - Partial re-indexing for changed/deleted files
  - `watch.ts` - File watching with debounced change detection and provider reuse

- `src/mcp/` - Model Context Protocol server
  - `tools/ask-codebase.ts` - LLM-synthesized Q&A with Zod validation
  - `tools/use-context-pack.ts` - Context management for saved scopes

- `src/synthesis/` - LLM answer generation
  - `synthesizer.ts` - Generate natural language answers with multi-query support and prompt-injection hardening
  - `prompt-builder.ts` - Build context-aware prompts with code citations
  - `markdown-formatter.ts` - Format responses with file references

- `src/chunking/` - Smart code chunking
  - `semantic-chunker.ts` - AST-based semantic splitting with overlap (20%)
  - `file-grouper.ts` - Group related files for batch processing
  - `token-counter.ts` - Precise token counting with caching

- `src/providers/` - LLM provider integrations
  - `openai.ts` - OpenAI-compatible API with dynamic batching and token estimation
  - `mock.ts` - Deterministic embedding provider for tests
  - `chat-llm.ts` - Chat model abstraction for synthesis
  - `base.ts` - Base provider interface
  - `index.ts` - Provider factory and configuration
  - `token-counter.ts` - Token counting utilities

- `src/ranking/` - Result ranking and reranking
  - `api-reranker.ts` - External API reranking (Cohere, Jina, Novita) with token limits
  - `symbol-boost.ts` - Boost results based on signature/parameter/neighbor matching

- `src/search/` - Search implementations
  - `bm25.ts` - BM25 keyword search with document building
  - `hybrid.ts` - Reciprocal Rank Fusion (RRF) combining vector + BM25
  - `scope.ts` - Search scope filtering (tags, languages, paths)

- `src/storage/` - Storage layer
  - `encrypted-chunks.ts` - AES-256-GCM encryption for code chunks (optional)

- `src/symbols/` - Symbol extraction and analysis
  - `extract.ts` - Extract symbols from parsed code
  - `graph.ts` - Build symbol relationship graphs

- `src/languages/` - Multi-language support
  - `rules.ts` - Tree-sitter parsing rules for 25+ languages
  - `tree-sitter-loader.ts` - Dynamic Tree-sitter parser loading

- `src/utils/` - Utility functions
  - `cli-ui.ts` - CLI progress bars and spinners
  - `indexer-with-progress.ts` - Indexing with progress tracking
  - `rate-limiter.ts` - RPM/TPM-based rate limiting with retry

- `src/config/` - Configuration management
  - `loader.ts` - Load config from env/project/global
  - `apply-env.ts` - Apply environment variable overrides
  - `types.ts` - Configuration type definitions

- `src/context/` - Context pack management
  - `packs.ts` - Save/load search scopes for reuse

## Code Standards

### TypeScript Guidelines
- Use strict TypeScript with proper types (no `any` unless absolutely necessary)
- Prefer interfaces for public APIs, types for internal use
- Use async/await over promises
- Export types alongside implementations

### Error Handling
- Use try/catch for async operations
- Provide meaningful error messages with context
- Log errors with appropriate severity levels

### Testing
- Write tests for core functionality
- Use descriptive test names
- Mock external dependencies (APIs, file system)

### Dependencies
- Minimize external dependencies
- Prefer well-maintained packages
- Use exact versions for critical dependencies
- Install via npm with legacy peer resolution (`npm install --legacy-peer-deps`) to avoid peer conflicts

## GitHub PR Review Guidelines

When reviewing pull requests, focus on:

### Code Quality
- **Type Safety**: Ensure proper TypeScript types, no unsafe casts
- **Error Handling**: Check for proper error handling in async operations
- **Performance**: Look for inefficient algorithms, unnecessary iterations
- **Memory Management**: Check for potential memory leaks (unclosed streams, large caches)

### Architecture
- **Separation of Concerns**: Each module should have a single responsibility
- **API Design**: Public APIs should be intuitive and well-documented
- **Extensibility**: Code should be easy to extend without modification

### Security
- **Input Validation**: Validate all external inputs (API keys, file paths, queries)
- **Injection Prevention**: Sanitize inputs used in SQL, shell commands, or prompts
- **Secrets Management**: Never hardcode API keys or sensitive data

### Testing
- **Coverage**: New features should include tests
- **Edge Cases**: Test error conditions and boundary cases
- **Integration**: Test interactions between components

### Documentation
- **Code Comments**: Complex logic should be explained
- **API Documentation**: Public functions need JSDoc comments
- **README Updates**: Update docs if behavior changes

### Specific to CodeVault

#### Chunking and Indexing
- **Semantic Preservation**: Changes to chunking must preserve semantic meaning via AST analysis
- **Overlap Requirement**: Statement-level chunks must have 20% overlap for context
- **Size Optimization**: Track chunk statistics (reduction ratio should be 20-50% via grouping)
- **Merkle Integrity**: Verify Merkle tree updates for incremental indexing (check `merkleDirty` flag)
- **Dimension Matching**: Ensure provider dimensions match database (warn on mismatch)

#### Search and Ranking
- **Hybrid Fusion**: Test Reciprocal Rank Fusion with default weights (0.7 vector, 0.3 BM25)
- **Score Bounds**: Symbol boost must cap at 0.45, total scores never exceed 1.0
- **Reranking Fallbacks**: API reranking failures must degrade gracefully (no throw)
- **Cache Management**: Verify LRU cache limits (BM25: 10 indices, chunks: 1000 items)
- **Query Normalization**: Queries must be lowercase and trimmed before search

#### Performance and Efficiency
- **Batch Efficiency**: Verify batch size (50 chunks/batch), track API call reduction (~98%)
- **Retry Logic**: Confirm exponential backoff (3 retries max) on rate limits (429)
- **Token Estimation**: Use character pre-filtering (4x multiplier) before expensive token counting
- **Cache Eviction**: Call `clearSearchCaches()` periodically in long-running processes
- **Memory Leaks**: Check for unclosed database connections (always use try/finally)

#### Security and Validation
- **Input Validation**: Validate file paths (check glob patterns in indexer)
- **Prompt Injection**: Sanitize user queries in synthesis prompts (escape special chars)
- **Encryption Keys**: Verify encryption key presence for encrypted mode (required for reads)
- **API Key Safety**: Never log API keys or include in error messages
- **SQL Injection**: Use parameterized queries in all database operations

#### MCP and Integration
- **Schema Validation**: Use Zod schemas for all MCP tool inputs/outputs
- **Protocol Compliance**: Follow MCP standards for tool definitions and responses
- **Error Handling**: Return structured errors with proper MCP error codes
- **Streaming Support**: Test streaming responses in synthesis (multi-query scenarios)

#### Tree-sitter and Languages
- **Parser Rules**: Verify Tree-sitter rules for new languages in `languages/rules.ts`
- **Node Types**: Test semantic subdivision for new node types (methods, classes, etc.)
- **Fallback Behavior**: Ensure statement-level fallback works for unsupported constructs
- **Language Detection**: Validate file extension mapping to Tree-sitter parsers

## Common Patterns

### Embedding Generation with Retry Logic
```typescript
// Always use BatchEmbeddingProcessor for efficiency (50 chunks/batch)
// Includes automatic retry on rate limits (429) and fallback to individual embeddings
const processor = new BatchEmbeddingProcessor(provider, db, BATCH_SIZE);
await processor.addChunk({ id, text, metadata }); // Queues; auto-flushes at threshold
await processor.flush(); // Process remaining; retries up to 3 times with exponential backoff

// Provider-level: Dynamic batching with token estimation
// Skips items > MAX_ITEM_TOKENS, estimates via tiktoken, handles multi-API calls
const embeddings = await provider.generateEmbeddings(texts); // Batches internally
```

### Semantic Chunking with AST Analysis
```typescript
// Use Tree-sitter AST for semantic code splitting with 20% overlap
const analysis = await analyzeNodeForChunking(node, source, rule, modelProfile);

if (analysis.needsSubdivision) {
  // Split large nodes (classes, functions) into smaller semantic units
  const subNodes = findSemanticSubdivisions(node, rule); // e.g., split methods
  const subAnalyses = await batchAnalyzeNodes(subNodes, source, rule, modelProfile);
  // Merge small subdivisions if total size >= minSize; track stats for optimization
}

if (analysis.size > limits.max) {
  // Fallback to statement-level chunking with overlap for oversized nodes
  const stmtChunks = await yieldStatementChunks(
    node, source, limits.max, limits.overlap, modelProfile
  );
  // Each chunk has 20% overlap with previous for context preservation
}

// Track statistics: skippedSmall, mergedSmall, subdivision counts
```

### Hybrid Search with Caching
```typescript
// LRU caching prevents recomputation (BM25: 10 indices, chunks: 1000 items)
const bm25Key = `${basePath}::${provider}::${dims}`;
if (!bm25IndexCache.has(bm25Key)) {
  evictOldestBm25Index(); // Limit to MAX_BM25_CACHE_SIZE
  // Build BM25 index lazily; add documents from DB
}

// Reciprocal Rank Fusion (RRF) combines vector + BM25 with configurable weights
const results = await hybridSearch(query, {
  vectorWeight: 0.7,      // Vector similarity weight
  bm25Weight: 0.3,        // BM25 keyword weight
  symbolBoost: true,      // Boost based on signature/parameter matches
  reranker: config.reranker, // Optional API reranking (Cohere, Jina, Novita)
  k: 60                   // RRF constant (default)
});

// Read chunks with caching to avoid repeated file I/O
const code = readChunkTextCached(sha, chunkDir, basePath); // LRU evicts oldest

// Clear caches for long-running processes to prevent memory leaks
clearSearchCaches(); // Call periodically or on config changes
```

### Symbol Boosting and Reranking
```typescript
// API reranking: Top 50 candidates, truncate to maxTokens*4 chars
const reranked = await rerankWithAPI(query, candidates.slice(0, 50), {
  getText: c => buildBm25Document(c, readChunkTextCached(c.sha, chunkDir, basePath)),
  maxTokens: 8192 // Provider-specific limit
});
// Handles failures silently (logs error, returns original results)

// Symbol boost: Match query tokens to function signatures, parameters, neighbors
applySymbolBoost(results, { query, codemap });
// Caps boost at 0.45, tracks sources: ['signature', 'parameter', 'neighbor']
// Never exceeds total score of 1.0
```

### Incremental Indexing with Merkle Trees
```typescript
// Detect changes using Merkle tree hashing (SHA-256 of file content)
const currentTree = await buildMerkleTree(basePath);
const previousTree = await loadPreviousMerkleTree(db);

const { changedFiles, deletedFiles } = compareMerkleTrees(currentTree, previousTree);

// Only re-index changed/deleted files (not entire codebase)
await updateIndex(basePath, { changedFiles, deletedFiles });

// Check for dimension mismatches (warns if DB dims != provider dims)
const dbDims = await getStoredDimensions(db);
if (dbDims !== provider.dimensions) {
  console.warn('Dimension mismatch detected. Full re-index recommended.');
}
```

### Error Handling with Context
```typescript
// Provide detailed context in errors for debugging
try {
  await indexProject(path);
} catch (error) {
  throw new Error(`Failed to index project at ${path}: ${error.message}`);
}

// Silent fallbacks for non-critical operations
try {
  applySymbolBoost(results, { query, codemap });
} catch (error) {
  console.error('Symbol boost failed, continuing without boost:', error);
  // Don't throw - degraded functionality is acceptable
}

// Retry logic for transient failures (rate limits, network issues)
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(Math.pow(2, i) * 1000); // Exponential backoff
    }
  }
}
```

### Rate Limiting
```typescript
// RPM/TPM-based throttling with automatic retry
const limiter = new RateLimiter({
  rpm: 100,  // Requests per minute
  tpm: 10000 // Tokens per minute
});

await limiter.acquire(estimatedTokens); // Blocks if limits exceeded
// Automatically queues and retries with exponential backoff

// Queue size limits prevent memory exhaustion
if (limiter.queueSize > MAX_QUEUE_SIZE) {
  throw new Error('Rate limiter queue full');
}
```

### Token Counting with Caching
```typescript
// Precise token counting with LRU cache (avoids repeated tiktoken calls)
const tokens = await countTokens(text, modelProfile);
// Cache hit rate ~80% in typical usage

// Pre-filter by character count before expensive token counting
if (text.length < MIN_CHARS) return; // Skip token counting
if (text.length > MAX_CHARS * 4) return; // Definitely oversized

// Batch token counting for multiple texts
const counts = await batchCountTokens(texts, modelProfile);
```

## Development Workflow

1. **Local Testing**: Test changes locally before pushing
2. **Type Checking**: Run `npm run build` to check for type errors
3. **Formatting**: Code should follow project style (use prettier/eslint)
4. **Commits**: Use descriptive commit messages
5. **PRs**: Keep PRs focused on a single feature/fix

## Configuration

The project supports multiple configuration methods:
- Environment variables (highest priority)
- Project config (`codevault.config.json`)
- Global config (`~/.codevault/config.json`)
- Defaults (lowest priority)

See `docs/CONFIGURATION.md` for complete details.

## Important Notes for AI Reviewers

- **Context is Key**: Always read related files to understand the full impact of changes
- **Ask Questions**: If something is unclear, ask the PR author for clarification
- **Be Constructive**: Suggest improvements with examples
- **Consider Tradeoffs**: Balance code quality with pragmatism
- **Check Dependencies**: Verify that new dependencies are necessary and well-maintained
