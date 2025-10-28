# CodeVault

> AI-powered semantic code search via Model Context Protocol (MCP)

CodeVault is an intelligent code indexing and search system that enables AI assistants to understand and navigate your codebase using semantic search, symbol-aware ranking, and hybrid retrieval techniques.

## 🌟 Features

- **🔍 Semantic Search**: Find code by meaning, not just keywords using vector embeddings
- **🤖 MCP Integration**: Native support for Claude Desktop and other MCP clients  
- **🎯 Symbol-Aware Ranking**: Boost results based on function signatures, parameters, and relationships
- **⚡ Hybrid Retrieval**: Combines vector embeddings with BM25 keyword matching via Reciprocal Rank Fusion
- **🚀 Batch Processing**: Efficient API usage with configurable batching (50 chunks/batch by default)
- **📦 Smart Chunking**: Token-aware semantic code splitting with overlap for optimal context
- **🔄 Context Packs**: Save and reuse search scopes for different features/modules
- **🏠 Local-First**: Works with local models (Ollama) or cloud APIs (OpenAI, Nebius)
- **🔐 Optional Encryption**: AES-256-GCM encryption for indexed code chunks
- **⚙️ Global Configuration**: One-time setup with interactive wizard for CLI convenience
- **📊 Multi-Language Support**: 25+ programming languages via Tree-sitter
- **🔎 File Watching**: Real-time index updates with debounced change detection
- **⏱️ Rate Limiting**: Intelligent request/token throttling with automatic retry
- **💾 Memory Efficient**: LRU caches with automatic cleanup for long-running processes

## 🚀 Quick Start

### Installation

#### NPM (Global - Recommended)

```bash
# Install latest beta
npm install -g codevault@beta

# Interactive configuration setup (one-time)
codevault config init

# Index your project
cd /path/to/your/project
codevault index
```

#### From Source

```bash
git clone https://github.com/shariqriazz/codevault.git
cd codevault
npm install
npm run build
npm link
```

### Configuration

CodeVault supports multiple configuration methods with clear priority:

**Priority:** Environment Variables > Project Config > Global Config > Defaults

#### Option 1: Interactive Setup (Recommended for CLI)

```bash
codevault config init
```

Guides you through:
- Provider selection (OpenAI, Ollama, Custom API)
- API key configuration  
- Model selection (preset or custom)
- Advanced settings (rate limits, encryption, reranking)

Configuration saved to `~/.codevault/config.json`

#### Option 2: Manual CLI Configuration

```bash
# Set API key
codevault config set providers.openai.apiKey sk-your-key-here
codevault config set providers.openai.model text-embedding-3-large

# View configuration
codevault config list

# See all config sources
codevault config list --sources
```

#### Option 3: Environment Variables (MCP / CI/CD)

```bash
# OpenAI
export OPENAI_API_KEY=sk-your-key-here
export CODEVAULT_OPENAI_EMBEDDING_MODEL=text-embedding-3-large

# Ollama
export CODEVAULT_OLLAMA_MODEL=nomic-embed-text

# Custom settings
export CODEVAULT_MAX_TOKENS=8192
export CODEVAULT_DIMENSIONS=3072
```

#### Option 4: Project-Specific Config

```bash
# Set local config (project-specific)
codevault config set --local provider ollama
codevault config set --local providers.ollama.model nomic-embed-text
```

See [`CONFIGURATION.md`](CONFIGURATION.md) for complete configuration guide.

### Index Your Project

```bash
# Using global config (if set via codevault config init)
codevault index

# Using Ollama (local, no API key required)
codevault index --provider ollama

# Using OpenAI with custom settings
export OPENAI_API_KEY=your-key-here
codevault index --provider openai

# Using Qwen (via Nebius AI Studio)
export OPENAI_API_KEY=your-nebius-api-key
export OPENAI_BASE_URL=https://api.studio.nebius.com/v1/
export CODEVAULT_OPENAI_EMBEDDING_MODEL=Qwen/Qwen3-Embedding-8B
codevault index --provider openai

# With encryption
export CODEVAULT_ENCRYPTION_KEY=$(openssl rand -base64 32)
codevault index --encrypt on

# Watch for changes (auto-update index)
codevault watch --debounce 500
```

### Search Your Code

```bash
# Basic search
codevault search "authentication function"

# Search with filters
codevault search "stripe checkout" --tags stripe --lang php

# Search with full code chunks
codevault search-with-code "database connection" --limit 5

# View project stats
codevault info
```

### Use with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "codevault": {
      "command": "npx",
      "args": ["-y", "codevault@beta", "mcp"],
      "env": {
        "OPENAI_API_KEY": "your-api-key-here",
        "CODEVAULT_OPENAI_EMBEDDING_MODEL": "text-embedding-3-large"
      }
    }
  }
}
```

Or use local installation:

```json
{
  "mcpServers": {
    "codevault": {
      "command": "node",
      "args": ["/path/to/codevault/dist/mcp-server.js"],
      "env": {
        "OPENAI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## 📖 Documentation

### CLI Commands

```bash
# Configuration Management
codevault config init                    # Interactive setup wizard
codevault config set <key> <value>       # Set global config value
codevault config set --local <key> <val> # Set project config value
codevault config get <key>               # Get config value
codevault config list                    # Show merged config
codevault config list --sources          # Show all config sources
codevault config unset <key>             # Remove config value
codevault config path                    # Show config file paths

# Indexing
codevault index [path]                   # Index project
codevault index --provider openai        # Use specific provider
codevault index --encrypt on             # Enable encryption
codevault update [path]                  # Update existing index
codevault watch [path]                   # Watch for changes
codevault watch --debounce 1000          # Custom debounce interval

# Searching  
codevault search <query> [path]          # Search code (metadata only)
  --limit <num>                          # Max results (default: 10)
  --provider <name>                      # Embedding provider
  --path_glob <pattern>                  # Filter by file pattern
  --tags <tag...>                        # Filter by tags
  --lang <language...>                   # Filter by language
  --reranker <off|api>                   # Enable API reranking
  --hybrid <on|off>                      # Hybrid search (default: on)
  --bm25 <on|off>                        # BM25 keyword search (default: on)
  --symbol_boost <on|off>                # Symbol boosting (default: on)

codevault search-with-code <query>       # Search with full code chunks
  --max-code-size <bytes>                # Max code size per chunk

# Context Packs
codevault context list                   # List saved contexts
codevault context show <name>            # Show context pack details
codevault context use <name>             # Activate context pack

# Utilities
codevault info                           # Project statistics
codevault mcp                            # Start MCP server
codevault --version                      # Show version
```

### MCP Tools

When used via MCP, CodeVault provides these tools:

- **`search_code`**: Semantic search returning metadata (paths, symbols, scores, SHAs)
- **`search_code_with_chunks`**: Search + retrieve full code for each result
- **`get_code_chunk`**: Get specific code chunk by SHA
- **`index_project`**: Index a new project
- **`update_project`**: Update existing index
- **`get_project_stats`**: Get project overview and statistics
- **`use_context_pack`**: Apply saved search context/scope

### Supported Languages

- **Web**: JavaScript, TypeScript, TSX, HTML, CSS, JSON, Markdown
- **Backend**: Python, PHP, Go, Java, Kotlin, C#, Ruby, Scala, Swift
- **Systems**: C, C++, Rust
- **Functional**: Haskell, OCaml, Elixir
- **Scripting**: Bash, Lua

### Embedding Providers

| Provider | Model | Dimensions | Context | Best For | API Key Required |
|----------|-------|------------|---------|----------|------------------|
| **ollama** | nomic-embed-text | 768 | 8K | Local, no API costs | ❌ No |
| **openai** | text-embedding-3-large | 3072 | 8K | Highest quality | ✅ Yes |
| **openai** | text-embedding-3-small | 1536 | 8K | Faster, cheaper | ✅ Yes |
| **openai** | Qwen/Qwen3-Embedding-8B | 4096 | 32K | Large context, high quality | ✅ Yes (Nebius) |
| **custom** | Your choice | Custom | Custom | Any OpenAI-compatible API | ✅ Yes |

### Environment Variables

```bash
# Provider Configuration
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1  # For custom endpoints
CODEVAULT_OPENAI_EMBEDDING_MODEL=text-embedding-3-large
CODEVAULT_OLLAMA_MODEL=nomic-embed-text

# Chunking Configuration
CODEVAULT_MAX_TOKENS=8192                  # Max tokens per chunk
CODEVAULT_DIMENSIONS=3072                  # Embedding dimensions

# Rate Limiting
CODEVAULT_RATE_LIMIT_RPM=10000            # Requests per minute
CODEVAULT_RATE_LIMIT_TPM=600000           # Tokens per minute

# Encryption
CODEVAULT_ENCRYPTION_KEY=...              # 32-byte key (base64 or hex)

# API Reranking
CODEVAULT_RERANK_API_URL=...
CODEVAULT_RERANK_API_KEY=...
CODEVAULT_RERANK_MODEL=...

# Memory Management
CODEVAULT_CACHE_CLEAR_INTERVAL=3600000    # Cache cleanup interval (ms)
```

## 🏗️ Architecture

### How It Works

1. **Indexing Phase**
   - Parses source files using Tree-sitter
   - Extracts symbols, signatures, and relationships
   - Creates semantic chunks (token-aware, with overlap)
   - Batch generates embeddings (50 chunks/batch)
   - Stores in SQLite + compressed chunks on disk

2. **Search Phase**
   - Generates query embedding
   - Performs vector similarity search
   - Runs BM25 keyword search (if enabled)
   - Applies Reciprocal Rank Fusion
   - Boosts results based on symbol matching
   - Optionally applies API reranking
   - Returns ranked results with metadata

3. **Retrieval Phase**
   - Fetches code chunks by SHA
   - Decompresses and decrypts (if encrypted)
   - Returns full code with context

### Project Structure

```
.codevault/
├── codevault.db              # SQLite: embeddings + metadata
├── chunks/                   # Compressed code chunks
│   ├── <sha>.gz              # Plain compressed
│   └── <sha>.gz.enc          # Encrypted compressed
└── contextpacks/             # Saved search contexts
    └── feature-auth.json     # Example context pack

codevault.codemap.json        # Lightweight index (symbol graph)

~/.codevault/                 # Global CLI configuration
└── config.json               # User-wide settings
```

### Advanced Features

#### Batch Processing

Embeddings are generated in batches of 50 for optimal API efficiency:

```typescript
// Automatic batching - no configuration needed
// Processes 50 chunks per API call
// Falls back to individual processing on error
```

#### Smart Chunking

Token-aware semantic chunking with configurable limits:

- Respects function/class boundaries
- Applies overlap for context continuity
- Subdivides large functions intelligently
- Merges small chunks when beneficial

#### Symbol-Aware Ranking

Boosts search results based on:
- Exact symbol name matches
- Function signature matches  
- Parameter name matches
- Symbol neighbor relationships (calls, imports)

#### Hybrid Search

Combines multiple ranking signals:
- Vector similarity (semantic understanding)
- BM25 keyword matching (exact term matches)
- Symbol boost (code structure awareness)
- Reciprocal Rank Fusion (combines rankings)

#### Context Packs

Save search scopes for reuse:

```json
{
  "key": "feature-auth",
  "name": "Authentication Feature",
  "description": "Login, signup, password reset",
  "scope": {
    "path_glob": ["src/auth/**", "src/middleware/auth.ts"],
    "tags": ["auth", "security"],
    "lang": ["typescript", "javascript"]
  }
}
```

Usage:
```bash
codevault context use feature-auth
codevault search "token validation"  # Scoped to auth files
```

#### File Watching

Real-time index updates with intelligent debouncing:

```bash
codevault watch --debounce 500
```

- Detects file changes, additions, deletions
- Batches rapid changes (debouncing)
- Updates only affected chunks
- Preserves index consistency

#### Encryption

AES-256-GCM encryption for code chunks:

```bash
# Generate secure key
export CODEVAULT_ENCRYPTION_KEY=$(openssl rand -base64 32)

# Index with encryption
codevault index --encrypt on

# Files stored as .gz.enc instead of .gz
# Automatic decryption on read (requires key)
```

## 🔧 Performance & Optimization

### Memory Management

- LRU caches with automatic eviction
- Periodic cache cleanup (configurable interval)
- Graceful shutdown handlers for MCP server
- Token counter caching for repeated operations

### Rate Limiting

Intelligent throttling prevents API errors:

- Configurable RPM (requests per minute)
- Configurable TPM (tokens per minute)  
- Automatic retry with exponential backoff
- Queue size limits prevent memory exhaustion

### Batch Efficiency

- 50 chunks per embedding API call (vs 1 per call)
- Reduces API overhead by ~98%
- Automatic fallback for failed batches
- Preserves partial progress on errors

## 🐛 Troubleshooting

### Common Issues

**"Which config is being used?"**
```bash
codevault config list --sources
```

**"MCP not using my global config"**

This is correct! MCP uses environment variables by design. Global config is for CLI convenience only.

**"Rate limit errors"**
```bash
# Reduce rate limits
codevault config set rateLimit.rpm 100
codevault config set rateLimit.tpm 10000
```

**"Out of memory during indexing"**
```bash
# Reduce batch size via environment
export BATCH_SIZE=25
codevault index
```

**"Encryption key errors"**
```bash
# Generate valid key (32 bytes)
export CODEVAULT_ENCRYPTION_KEY=$(openssl rand -base64 32)
```

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- **GitHub**: https://github.com/shariqriazz/codevault
- **NPM**: https://www.npmjs.com/package/codevault
- **Issues**: https://github.com/shariqriazz/codevault/issues
- **Configuration Guide**: [CONFIGURATION.md](CONFIGURATION.md)

## 🙏 Acknowledgments

Built with:
- [Model Context Protocol](https://modelcontextprotocol.io/) - AI integration framework
- [Tree-sitter](https://tree-sitter.github.io/) - Parsing infrastructure
- [OpenAI](https://openai.com/) - Embedding models
- [Ollama](https://ollama.ai/) - Local model support

---

**Version**: 1.3.0-beta.7  
**Built by**: Shariq Riaz  
**Last Updated**: January 2025