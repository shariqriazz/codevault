# Code Chunking System

Version: 1.8.5

This document describes CodeVault's intelligent code chunking system, which transforms source files into semantically meaningful chunks optimized for vector embedding and search.

## Overview

The chunking system in `/src/chunking/` consists of three main modules:

| Module | Purpose |
|--------|---------|
| `semantic-chunker.ts` | AST-based semantic analysis and splitting |
| `file-grouper.ts` | Groups small nodes into optimal-sized chunks |
| `token-counter.ts` | Token counting with caching and pre-filtering |

These modules work together to produce chunks that:
- Preserve semantic meaning by respecting AST boundaries
- Stay within embedding model token limits
- Maintain 20% overlap between statement-level chunks for context preservation
- Minimize API calls through intelligent grouping

## Architecture

```
Source File
    |
    v
[Tree-sitter Parser] --> AST
    |
    v
[ASTTraverser] --> Candidate Nodes (functions, classes, methods)
    |
    v
[ChunkGrouper] --> NodeGroup[] (semantic groups)
    |
    v
[ChunkPipeline.yieldChunk] --> Size Analysis
    |
    +---> [Normal] --> Single chunk
    |
    +---> [Too Large + Subdivisions] --> Recursive subdivision
    |
    +---> [Too Large + No Subdivisions] --> Statement-level split with overlap
    |
    +---> [Too Small] --> Skip or merge with others
```

## Module Reference

### semantic-chunker.ts

Provides AST-aware semantic analysis and splitting functions.

#### Functions

##### `findSemanticSubdivisions(node, rule)`

Finds child nodes that can serve as semantic subdivision points.

```typescript
function findSemanticSubdivisions(
  node: TreeSitterNode,
  rule: LanguageRule
): TreeSitterNode[]
```

**Parameters:**
- `node` - The parent AST node to search within
- `rule` - Language-specific rules containing `subdivisionTypes` mapping

**Returns:** Array of child nodes matching configured subdivision types

**Behavior:**
- Uses depth-first traversal starting at depth > 0
- Stops recursion when a matching subdivision type is found
- Returns empty array if node/rule is null or no subdivision types configured

**Example:**
```typescript
const rule = {
  subdivisionTypes: {
    class_declaration: ['method_definition', 'property_definition'],
    module: ['function_declaration', 'class_declaration']
  }
};
const methods = findSemanticSubdivisions(classNode, rule);
```

---

##### `findLastCompleteBoundary(code, maxSize)`

Locates the last complete statement boundary within a size limit.

```typescript
function findLastCompleteBoundary(code: string, maxSize: number): number
```

**Parameters:**
- `code` - Source code string to analyze
- `maxSize` - Maximum character position to search within

**Returns:** Character index of the last complete boundary

**Boundary Priority (highest to lowest):**
1. Closing brace followed by newline: `/\n\s*}\s*$/gm`
2. Semicolon at line end: `/;\s*$/gm`
3. Newline with whitespace: `/\n\s*$/gm`

Falls back to `maxSize` if no boundary is found.

---

##### `extractSignature(node, source)`

Extracts the function/class signature (everything before the opening brace).

```typescript
function extractSignature(node: TreeSitterNode, source: string): string
```

**Returns:** Signature string ending with ` {` or the first line if no brace found

**Example output:** `async function processFile(path: string): Promise<void> {`

---

##### `extractLinesBeforeNode(node, source, numLines)`

Extracts context lines immediately preceding a node.

```typescript
function extractLinesBeforeNode(
  node: TreeSitterNode,
  source: string,
  numLines: number
): string
```

Useful for capturing comments, decorators, or import context.

---

##### `extractParentContext(node, source)`

Extracts signature and line range for a parent node.

```typescript
function extractParentContext(node: TreeSitterNode, source: string): {
  signature: string;
  startLine: number;
  endLine: number;
}
```

---

##### `getLineNumber(byteOffset, source)`

Converts a byte offset to a 1-based line number.

```typescript
function getLineNumber(byteOffset: number, source: string): number
```

---

##### `analyzeNodeForChunking(node, source, rule, profile)`

Analyzes a single AST node to determine chunking strategy.

```typescript
async function analyzeNodeForChunking(
  node: TreeSitterNode,
  source: string,
  rule: LanguageRule,
  profile: ModelProfile
): Promise<NodeAnalysis>
```

**Returns:**
```typescript
interface NodeAnalysis {
  isSingleChunk: boolean;       // Size <= max threshold
  needsSubdivision: boolean;    // Size > max threshold
  subdivisionCandidates: TreeSitterNode[];
  size: number;                 // Actual size (tokens or characters)
  unit: string;                 // "tokens" or "characters"
  method: string;               // "tokenized" or "chars"
  estimatedSubchunks: number;   // ceil(size / optimal)
}
```

**Size Measurement:**
- Uses `profile.tokenCounter` when `profile.useTokens` is true
- Falls back to character count otherwise

---

##### `batchAnalyzeNodes(nodes, source, rule, profile, isSubdivision?)`

Batch version of `analyzeNodeForChunking` for efficiency.

```typescript
async function batchAnalyzeNodes(
  nodes: TreeSitterNode[],
  source: string,
  rule: LanguageRule,
  profile: ModelProfile,
  isSubdivision?: boolean
): Promise<Array<NodeAnalysis & { node: TreeSitterNode }>>
```

Processes multiple nodes in a single batch, reducing overhead when analyzing subdivision candidates.

---

##### `yieldStatementChunks(node, source, maxSize, overlapSize, profile)`

Splits oversized nodes into statement-level chunks with configurable overlap.

```typescript
async function yieldStatementChunks(
  node: TreeSitterNode,
  source: string,
  maxSize: number,
  overlapSize: number,
  profile: ModelProfile
): Promise<StatementChunk[]>
```

**Returns:**
```typescript
interface StatementChunk {
  code: string;   // Chunk content
  size: number;   // Size in tokens or characters
  unit: string;   // "tokens" or "characters"
}
```

**Overlap Guarantee:**
The function ensures a minimum 20% overlap between consecutive chunks:
```typescript
const MIN_OVERLAP_RATIO = 0.2;
const targetOverlapSize = Math.max(
  overlapSize,
  Math.floor(maxSize * MIN_OVERLAP_RATIO)
);
```

This prevents overlap from degrading to 1-2% for large chunks, maintaining semantic context across boundaries.

**Algorithm:**
1. Split code into lines
2. Count size of each line (tokens or characters)
3. Accumulate lines until `maxSize` exceeded
4. On overflow:
   - Emit current chunk
   - Calculate lines needed to achieve target overlap by walking backwards
   - Keep those lines as start of next chunk
5. Continue until all lines processed

---

### file-grouper.ts

Groups small AST nodes into optimal-sized chunks to reduce fragmentation.

#### Types

```typescript
interface NodeGroup {
  nodes: TreeSitterNode[];
  totalSize: number;
  groupInfo: SemanticGroup[];
}

interface CombinedChunk {
  code: string;
  node: TreeSitterNode & { type: string };
  metadata: {
    isGroup: boolean;
    nodeCount: number;
    totalSize: number;
    groupTypes: string[];
  };
}
```

#### Functions

##### `groupNodesForChunking(nodes, source, profile, rule)`

Groups AST nodes into optimal-sized chunks based on semantic relationships.

```typescript
async function groupNodesForChunking(
  nodes: TreeSitterNode[],
  source: string,
  profile: ModelProfile,
  rule: LanguageRule
): Promise<NodeGroup[]>
```

**Behavior:**
- Returns nodes individually if count <= 10 (grouping overhead not worthwhile)
- For larger node sets:
  1. Analyzes all nodes in batch for size
  2. Identifies semantic groups (containers vs file sections)
  3. Combines groups to approach optimal size

**Container Types:**
The following node types are treated as natural grouping boundaries:
- `class_declaration`
- `class_definition`
- `interface_declaration`
- `module_declaration`
- `namespace_declaration`
- `trait_declaration`
- `enum_declaration`

**Grouping Algorithm:**
1. Separate nodes into semantic groups (containers stay alone, others grouped by file section)
2. Groups larger than `limits.optimal` are emitted immediately
3. Groups are accumulated until adding another would exceed `limits.max`
4. When accumulated size reaches 90% of optimal, emit the group

---

##### `createCombinedChunk(nodeGroup, source)`

Creates a combined chunk from a node group.

```typescript
function createCombinedChunk(
  nodeGroup: NodeGroup,
  source: string
): CombinedChunk | null
```

**Returns:** `null` if nodeGroup is empty

**Behavior:**
- Joins all node code with double newlines
- Creates a synthetic node spanning the full range
- Annotates type as `{originalType}_group_{count}`

---

### token-counter.ts

Provides efficient token counting with LRU caching and character-based pre-filtering.

#### Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| Cache Size | 1000 | Maximum cached token counts |
| Char-to-Token Ratio | 4:1 | Estimation: 4 characters = 1 token |

#### Types

```typescript
interface TokenCountStats {
  totalRequests: number;
  cacheHits: number;
  charFilterSkips: number;
  actualTokenizations: number;
  batchTokenizations: number;
  cacheHitRate: string;      // Percentage
  charFilterRate: string;    // Percentage
  tokenizationRate: string;  // Percentage
}

interface CodeSizeAnalysis {
  size: number;
  decision: 'too_small' | 'too_large' | 'needs_tokenization' | 'optimal';
  method: string;  // 'char_estimate' or 'tokenized'
}
```

#### Functions

##### `analyzeCodeSize(code, limits, tokenCounter, allowEstimateForSkip?)`

Analyzes code size with intelligent pre-filtering.

```typescript
async function analyzeCodeSize(
  code: string,
  limits: SizeLimits,
  tokenCounter: (text: string) => number | Promise<number>,
  allowEstimateForSkip?: boolean
): Promise<CodeSizeAnalysis>
```

**Pre-filtering Strategy:**

The function uses character count to estimate token count before expensive tokenization:

```typescript
function preFilterByChars(code: string, limits: SizeLimits): PreFilterResult {
  const estimatedTokens = Math.ceil(code.length / 4);

  // Apply 20% margin for safety
  if (estimatedTokens < limits.min * 0.8) return 'too_small';
  if (estimatedTokens > limits.max * 1.2) return 'too_large';
  if (estimatedTokens in [limits.optimal * 0.8, limits.optimal * 1.2]) return 'optimal';

  return 'needs_tokenization';
}
```

When `allowEstimateForSkip` is true and pre-filter indicates "too_large", the function returns early without tokenization, saving compute.

---

##### `batchAnalyzeCodeSize(codeSnippets, limits, tokenCounter, allowEstimateForSkip?)`

Batch version of `analyzeCodeSize`.

```typescript
async function batchAnalyzeCodeSize(
  codeSnippets: string[],
  limits: SizeLimits,
  tokenCounter: (text: string) => number | Promise<number>,
  allowEstimateForSkip?: boolean
): Promise<CodeSizeAnalysis[]>
```

Optimizations:
1. Pre-filters all snippets by character count
2. Batches tokenization requests for snippets needing actual counts
3. Leverages shared LRU cache across requests

---

##### `getTokenCountStats()`

Returns current token counting statistics.

```typescript
function getTokenCountStats(): TokenCountStats
```

Typical performance in production:
- Cache hit rate: ~80%
- Char filter skip rate: Variable based on code distribution

---

##### `resetTokenCountStats()`

Resets all statistics counters to zero.

```typescript
function resetTokenCountStats(): void
```

---

##### `clearTokenCache()`

Clears the LRU token count cache.

```typescript
function clearTokenCache(): void
```

Call periodically in long-running processes to prevent stale data and manage memory.

---

## Model Profiles

Chunk size limits are determined by the embedding model profile. Key profiles:

| Model | Max Tokens | Optimal Tokens | Min Chunk | Max Chunk | Overlap |
|-------|-----------|----------------|-----------|-----------|---------|
| text-embedding-3-large | 8191 | 4000 | 400 | 6000 | 100 |
| text-embedding-3-small | 8191 | 4000 | 400 | 6000 | 100 |
| nomic-embed-text | 8192 | 4000 | 400 | 6000 | 100 |
| gemini-embedding-001 | 2048 | 1600 | 200 | 1800 | 50 |
| default | 512 | 400 | 50 | 480 | 30 |

Profiles can be overridden via environment variables:
- `CODEVAULT_EMBEDDING_MAX_TOKENS` or `CODEVAULT_MAX_TOKENS`
- `CODEVAULT_EMBEDDING_DIMENSIONS` or `CODEVAULT_DIMENSIONS`

---

## Integration with Indexing Pipeline

The chunking system integrates with the indexing pipeline through `ChunkPipeline` in `/src/core/indexing/chunk-pipeline.ts`:

```typescript
const pipeline = new ChunkPipeline();

// 1. Collect candidate nodes from source
const nodes = pipeline.collectNodesForFile(source, languageRule);

// 2. Group nodes for optimal chunking
const nodeGroups = await pipeline.groupNodes(nodes, source, profile, rule);

// 3. Process groups into final chunks
await pipeline.processGroups(
  nodeGroups,
  source,
  rule,
  sizeLimits,
  modelProfile,
  relativePath,
  existingChunks,
  merkleHashes,
  onProgress,
  embedAndStoreCallback,
  stats
);
```

### Chunking Statistics

The pipeline tracks detailed statistics:

```typescript
interface ChunkingStats {
  totalNodes: number;       // Total AST nodes processed
  skippedSmall: number;     // Nodes skipped (below min size)
  subdivided: number;       // Large nodes split semantically
  mergedSmall: number;      // Small nodes combined
  statementFallback: number; // Oversized nodes split by statements
  normalChunks: number;     // Nodes emitted as single chunks
  fileGrouped: number;      // Number of grouped chunks created
  functionsGrouped: number; // Total functions in grouped chunks
}
```

---

## Best Practices

### When Adding New Language Support

1. Define `subdivisionTypes` in `/src/languages/rules.ts`:
   ```typescript
   ruby: {
     subdivisionTypes: {
       class: ['method', 'singleton_method'],
       module: ['method', 'class']
     }
   }
   ```

2. Verify Tree-sitter node types match your language grammar

3. Test with files containing:
   - Large classes with many methods (tests subdivision)
   - Small utility functions (tests grouping)
   - Deeply nested structures (tests recursion)

### Performance Optimization

1. **Batch operations**: Use `batchAnalyzeNodes` and `batchAnalyzeCodeSize` for multiple items

2. **Cache management**: Call `clearTokenCache()` periodically in long-running processes

3. **Pre-filtering**: Enable `allowEstimateForSkip` when analyzing candidates for skip decisions

4. **Monitor statistics**: Use `getTokenCountStats()` to verify cache efficiency

### Debugging Chunking Issues

1. Enable verbose logging to see chunk decisions

2. Check `ChunkingStats` after indexing to identify patterns:
   - High `skippedSmall`: Min threshold may be too high
   - High `statementFallback`: Code may lack semantic structure
   - Low `mergedSmall`: Grouping thresholds may need tuning

3. Verify language rules have correct subdivision types for your language's AST

---

## Related Files

- `/src/core/indexing/chunk-pipeline.ts` - Main pipeline orchestrator
- `/src/languages/rules.ts` - Language-specific parsing rules
- `/src/providers/base.ts` - Model profiles and size limits
- `/src/tests/semantic-chunker.test.ts` - Unit tests for chunking functions
