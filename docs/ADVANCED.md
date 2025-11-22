# Advanced Features Guide

In-depth guide to CodeVault's advanced features and capabilities.

## 📦 Smart Chunking System

CodeVault uses intelligent semantic chunking to create optimal code segments for embedding.

### How It Works

1. **Token-Aware Splitting**
   - Respects function/class boundaries
   - Never splits mid-function
   - Maintains context integrity

2. **Size Management**
   - **Min Size:** 500 tokens (configurable)
   - **Optimal Size:** 4000 tokens (Qwen) / 2000 tokens (OpenAI)
   - **Max Size:** 8000 tokens (Qwen) / 6000 tokens (OpenAI)

3. **Intelligent Merging**
   - Combines small functions into optimal chunks
   - Preserves logical grouping
   - Reduces total chunk count

4. **Subdivision**
   - Splits large functions intelligently
   - Maintains context with overlap
   - Preserves function structure

### Configuration

```bash
# Via environment variables
export CODEVAULT_EMBEDDING_MAX_TOKENS=32000  # Max tokens per chunk
export CODEVAULT_CHUNK_MIN_TOKENS=500        # Min tokens (implied)
export CODEVAULT_CHUNK_OPTIMAL_TOKENS=4000   # Target size (implied)
```

### Example

**Before Chunking:**
```typescript
// File: auth.ts (10,000 tokens)
function login() { ... }      // 2000 tokens
function logout() { ... }     // 2000 tokens
function validate() { ... }   // 6000 tokens (too large!)
```

**After Smart Chunking:**
```
Chunk 1: login() + logout()           // 4000 tokens (merged)
Chunk 2: validate() - part 1          // 3000 tokens (subdivided)
Chunk 3: validate() - part 2          // 3000 tokens (with overlap)
```

---

## 🔍 Hybrid Search

CodeVault combines multiple search techniques for best results.

### Search Methods

1. **Vector Similarity** (Semantic)
   - Uses embeddings to find semantically similar code
   - Understands meaning, not just keywords
   - Best for conceptual searches

2. **BM25 Keyword** (Lexical)
   - Classic keyword matching
   - Exact term matches
   - Best for specific names/identifiers

3. **Symbol Boosting** (Structural)
   - Boosts results matching function signatures
   - Parameter name matching
   - Call graph awareness

4. **Reciprocal Rank Fusion** (Combination)
   - Combines rankings from multiple methods
   - Balances different signals
   - Produces final ranking

### Configuration

```bash
# Enable/disable search methods
codevault search "query" \
  --hybrid on \        # Combine vector + BM25
  --bm25 on \          # Enable BM25
  --symbol_boost on    # Enable symbol boosting
```

### When to Use What

**Vector Only** (`--hybrid off --bm25 off`):
- Conceptual searches
- "authentication flow"
- "error handling pattern"

**BM25 Only** (`--hybrid off --bm25 on`):
- Exact identifier searches
- Function name searches
- Variable name searches

**Hybrid** (default):
- Best for most searches
- Balances precision and recall
- Recommended for general use

---

## 🎯 API Reranking

Optional reranking improves relevance by 5-10%.

### How It Works

1. Initial search returns top 50 results
2. Reranker analyzes query + each result
3. Assigns precise relevance scores
4. Re-ranks results by new scores
5. Returns top N to user

### Providers

**Novita + Qwen3-Reranker-8B** (Recommended):
- 32K context window
- Optimized for code
- Fast and accurate

**Cohere**:
- 4K context window
- $25 free credits
- General-purpose

### Configuration

```bash
# Environment variables
export CODEVAULT_RERANK_API_URL=https://api.novita.ai/openai/v1/rerank
export CODEVAULT_RERANK_API_KEY=your-novita-key
export CODEVAULT_RERANK_MODEL=qwen/qwen3-reranker-8b

# Usage
codevault search "query" --reranker on
codevault ask "question" --reranker on  # Default: on for ask
```

### Cost vs Benefit

| Without Reranking | With Reranking |
|-------------------|----------------|
| Fast | Slightly slower |
| No extra cost | ~$0.001 per query |
| 85% relevant | 92% relevant |

**Recommendation:** Enable for `ask` command, optional for `search`.

---

## 🔐 Encryption

AES-256-GCM encryption for indexed code chunks.

### How It Works

1. Code chunks are compressed (gzip)
2. Encrypted with AES-256-GCM
3. Stored as `.gz.enc` files
4. Automatically decrypted on read

### Setup

```bash
# Generate secure key (32 bytes)
export CODEVAULT_ENCRYPTION_KEY=$(openssl rand -base64 32)

# Index with encryption
codevault index --encrypt on

# Or via config
codevault config set encryption.enabled true
codevault config set encryption.key $(openssl rand -base64 32)
```

### Security Notes

- ✅ Key is never stored in index
- ✅ Key required for all operations
- ✅ AES-256-GCM is industry standard
- ⚠️ Losing key means losing access to code
- ⚠️ Store key securely (password manager, secrets manager)

### Performance Impact

- Encryption: ~10% slower indexing
- Decryption: Negligible impact on search
- Storage: Same size (already compressed)

---

## 📋 Context Packs

Save and reuse search scopes for different features/modules.

### What Are Context Packs?

Pre-defined search scopes that filter by:
- File patterns (glob)
- Tags
- Languages
- Provider settings
- Search settings

### Creating Context Packs

**Via file** (`.codevault/contextpacks/feature-auth.json`):
```json
{
  "key": "feature-auth",
  "name": "Authentication Feature",
  "description": "Login, signup, password reset, session management",
  "scope": {
    "path_glob": [
      "src/auth/**",
      "src/middleware/auth.ts",
      "src/models/user.ts"
    ],
    "tags": ["auth", "security"],
    "lang": ["typescript", "javascript"]
  },
  "reranker": "on",
  "symbol_boost": "on"
}
```

### Using Context Packs

```bash
# List available packs
codevault context list

# Show pack details
codevault context show feature-auth

# Activate pack (sets default scope)
codevault context use feature-auth

# Now searches are scoped to auth files
codevault search "token validation"
codevault ask "How does session management work?"
```

### Via MCP

```typescript
// Activate context pack
use_context_pack({ name: "feature-auth" });

// Subsequent searches use this scope
search_code({ query: "password reset" });
ask_codebase({ question: "How does 2FA work?" });
```

### Example Use Cases

**Feature Development:**
```json
{
  "key": "feature-payments",
  "path_glob": ["src/payments/**", "src/stripe/**"],
  "tags": ["payments", "stripe"]
}
```

**Bug Fixing:**
```json
{
  "key": "error-handling",
  "path_glob": ["**/*.ts"],
  "tags": ["error", "logging"]
}
```

**Code Review:**
```json
{
  "key": "recent-changes",
  "path_glob": ["src/**"],
  "metadata": { "modified_after": "2025-01-01" }
}
```

---

## 🔄 File Watching

Real-time index updates as you code.

### How It Works

1. Monitors project directory for changes
2. Debounces rapid changes (configurable)
3. Detects: additions, modifications, deletions
4. Updates only affected chunks
5. Preserves index consistency

### Usage

```bash
# Start watching with default debounce (1000ms)
codevault watch

# Faster updates (500ms debounce)
codevault watch --debounce 500

# Slower updates (2000ms debounce)
codevault watch --debounce 2000

# Run in background
codevault watch --debounce 500 &
```

### Debounce Strategy

| Debounce | Use Case | Trade-off |
|----------|----------|-----------|
| 500ms | Active development | Faster updates, more API calls |
| 1000ms | Normal (default) | Balanced |
| 2000ms | Low-priority | Fewer API calls, slower updates |

### Performance

- **Change Detection:** <10ms
- **Update Processing:** Depends on provider
- **Memory Usage:** Minimal (event-based)

---

## 🔢 Batch Processing

Efficient API usage through batching.

### How It Works

1. Collects chunks into batches of 50
2. Sends single API request per batch
3. Processes responses in parallel
4. Falls back to individual on errors

### Benefits

- **98% fewer API calls**
- **10x faster indexing**
- **Lower costs**
- **Better rate limit utilization**

### Configuration

```bash
# Batch size (default: 100)
export BATCH_SIZE=100

# Adjust based on API limits or provider guidance
export BATCH_SIZE=50  # Moderate
export BATCH_SIZE=25  # Conservative
export BATCH_SIZE=200 # Aggressive (only if provider supports)
```

### Example

**Without Batching:**
```
1000 chunks = 1000 API calls = ~60 seconds
```

**With Batching:**
```
1000 chunks ÷ 50 = 20 API calls = ~6 seconds
```

---

## 📊 Symbol Extraction

Extract and analyze code structure.

### What's Extracted

- Function names and signatures
- Parameter names and types
- Return types
- Class names and methods
- Import/export relationships
- Call graphs

### How It's Used

1. **Symbol Boosting**
   - Boosts results matching function signatures
   - Parameter name matching
   - Better precision for specific queries

2. **Call Graph**
   - Understands function relationships
   - Finds callers and callees
   - Improves context awareness

3. **Metadata**
   - Enriches search results
   - Provides structure info
   - Enables filtering

### Example

```typescript
// Extracted symbols
export async function authenticateUser(
  username: string,
  password: string
): Promise<User> {
  // Implementation
}
```

**Extracted Data:**
```json
{
  "name": "authenticateUser",
  "type": "function",
  "async": true,
  "export": true,
  "params": [
    { "name": "username", "type": "string" },
    { "name": "password", "type": "string" }
  ],
  "returnType": "Promise<User>"
}
```

---

## ⏱️ Rate Limiting

Intelligent API throttling.

### How It Works

1. Tracks requests per minute (RPM)
2. Tracks tokens per minute (TPM)
3. Queues requests when limits reached
4. Retries with exponential backoff
5. Prevents queue overflow

### Configuration

```bash
# Requests per minute
export CODEVAULT_EMBEDDING_RATE_LIMIT_RPM=10000

# Tokens per minute
export CODEVAULT_EMBEDDING_RATE_LIMIT_TPM=600000

# Via config
codevault config set rateLimit.rpm 10000
codevault config set rateLimit.tpm 600000
```

### Provider Defaults

| Provider | RPM | TPM |
|----------|-----|-----|
| Nebius | 10,000 | 600,000 |
| OpenAI | 3,000 | 1,000,000 |
| Ollama | Unlimited | Unlimited |

### Error Handling

**Automatic Retry:**
1. First retry: 1 second
2. Second retry: 2 seconds
3. Third retry: 5 seconds
4. Fourth retry: 10 seconds
5. Give up after 4 retries

---

## 💾 Memory Management

Efficient memory usage for long-running processes.

### LRU Caches

**Token Counter Cache:**
- Caches token counts for repeated text
- Max size: 10,000 entries
- Evicts least recently used

**Char-Based Pre-filtering:**
- Estimates tokens from char count
- Avoids expensive tokenization
- 90% accurate, 100x faster

### Periodic Cleanup

```bash
# Cleanup interval (default: 1 hour)
export CODEVAULT_CACHE_CLEAR_INTERVAL=3600000

# More frequent (15 minutes)
export CODEVAULT_CACHE_CLEAR_INTERVAL=900000
```

### MCP Server

- Graceful shutdown handlers
- Cache cleanup on exit
- Memory leak prevention
- Process isolation

---

## 🔧 Performance Tuning

### For Large Projects (10K+ files)

```bash
# Increase batch size
export BATCH_SIZE=100

# Reduce token count precision
export CODEVAULT_EMBEDDING_MAX_TOKENS=16000

# Increase rate limits
export CODEVAULT_EMBEDDING_RATE_LIMIT_RPM=20000
```

### For Limited Resources

```bash
# Smaller batches
export BATCH_SIZE=25

# Local embeddings
export CODEVAULT_EMBEDDING_BASE_URL=http://localhost:11434/v1
export CODEVAULT_EMBEDDING_MODEL=nomic-embed-text

# Disable reranking
codevault search "query" --reranker off
```

### For Best Quality

```bash
# Best embeddings
export CODEVAULT_EMBEDDING_MODEL=Qwen/Qwen3-Embedding-8B
export CODEVAULT_EMBEDDING_DIMENSIONS=4096

# Enable reranking
export CODEVAULT_RERANK_MODEL=qwen/qwen3-reranker-8b

# Best chat model
export CODEVAULT_CHAT_MODEL=anthropic/claude-sonnet-4.5
```

---

## 📚 Additional Resources

- [Configuration Guide](CONFIGURATION.md)
- [MCP Setup Guide](MCP_SETUP.md)
- [CLI Reference](CLI_REFERENCE.md)
- [API Providers](PROVIDERS.md)

---

**Version:** 1.8.4
**Last Updated:** November 2025
