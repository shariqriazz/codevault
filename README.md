# CodeVault

> AI-powered semantic code search via Model Context Protocol (MCP)

CodeVault is an intelligent code indexing and search system that enables AI assistants to understand and navigate your codebase using semantic search, symbol-aware ranking, and hybrid retrieval techniques.

## 🌟 Features

- **🔍 Semantic Search**: Find code by meaning, not just keywords using vector embeddings
- **🤖 MCP Integration**: Native support for Claude Desktop and other MCP clients
- **💬 LLM-Synthesized Answers**: Ask questions in natural language, get markdown responses with code citations
- **🗣️ Interactive Chat Mode**: Have multi-turn conversations about your codebase with conversation history
- **🎯 Symbol-Aware Ranking**: Boost results based on function signatures, parameters, and relationships
- **⚡ Hybrid Retrieval**: Combines vector embeddings with BM25 keyword matching via Reciprocal Rank Fusion
- **🚀 Batch Processing**: Efficient API usage with configurable batching (50 chunks/batch by default)
- **📦 Smart Chunking**: Token-aware semantic code splitting with overlap for optimal context
- **🔄 Context Packs**: Save and reuse search scopes for different features/modules
- **🏠 Local-First**: Works with local models (Ollama) or cloud APIs (OpenAI, Nebius, OpenRouter)
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
# Install latest version
npm install -g codevault

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
npm install --legacy-peer-deps
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

#### Option 2: Quick Setup with Nebius (Qwen Embeddings)

```bash
# Set up Nebius for embeddings (Qwen3-Embedding-8B)
codevault config set providers.openai.apiKey your-nebius-api-key
codevault config set providers.openai.baseUrl https://api.studio.nebius.com/v1
codevault config set providers.openai.model Qwen/Qwen3-Embedding-8B
codevault config set providers.openai.dimensions 4096
codevault config set maxTokens 32000

# Set up OpenRouter for chat (Claude Sonnet 4.5)
codevault config set chatLLM.openai.apiKey your-openrouter-api-key
codevault config set chatLLM.openai.baseUrl https://openrouter.ai/api/v1
codevault config set chatLLM.openai.model anthropic/claude-sonnet-4.5

# Optional: Enable reranking with Novita (Qwen3-Reranker)
codevault config set reranker.apiUrl https://api.novita.ai/openai/v1/rerank
codevault config set reranker.apiKey your-novita-api-key
codevault config set reranker.model qwen/qwen3-reranker-8b
```

#### Option 3: Environment Variables (MCP / CI/CD)

```bash
# Embedding Provider (Nebius + Qwen)
export CODEVAULT_EMBEDDING_API_KEY=your-nebius-api-key
export CODEVAULT_EMBEDDING_BASE_URL=https://api.studio.nebius.com/v1
export CODEVAULT_EMBEDDING_MODEL=Qwen/Qwen3-Embedding-8B
export CODEVAULT_EMBEDDING_DIMENSIONS=4096
export CODEVAULT_EMBEDDING_MAX_TOKENS=32000

# Chat LLM (OpenRouter + Claude)
export CODEVAULT_CHAT_API_KEY=your-openrouter-api-key
export CODEVAULT_CHAT_BASE_URL=https://openrouter.ai/api/v1
export CODEVAULT_CHAT_MODEL=anthropic/claude-sonnet-4.5

# Reranking (Novita + Qwen)
export CODEVAULT_RERANK_API_URL=https://api.novita.ai/openai/v1/rerank
export CODEVAULT_RERANK_API_KEY=your-novita-api-key
export CODEVAULT_RERANK_MODEL=qwen/qwen3-reranker-8b
```

See [Configuration Guide](docs/CONFIGURATION.md) for complete details.

### Index Your Project

```bash
# Using global config (if set via codevault config init)
codevault index

# Using Nebius + Qwen embeddings
export CODEVAULT_EMBEDDING_API_KEY=your-key
export CODEVAULT_EMBEDDING_BASE_URL=https://api.studio.nebius.com/v1
export CODEVAULT_EMBEDDING_MODEL=Qwen/Qwen3-Embedding-8B
codevault index

# Using local Ollama
export CODEVAULT_EMBEDDING_BASE_URL=http://localhost:11434/v1
export CODEVAULT_EMBEDDING_MODEL=nomic-embed-text
codevault index

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

# Ask questions with LLM-synthesized answers
codevault ask "How does authentication work in this codebase?"
codevault ask "How do I add a new payment provider?" --multi-query --stream

# Start interactive chat (NEW!)
codevault chat
# Features:
# - Multi-turn conversations with history
# - Maintains context across questions
# - Commands: /help, /history, /clear, /stats, /exit
# - Configurable history window (--max-history)

# View project stats
codevault info
```

### Use with Claude Desktop

See complete setup guide: **[MCP Setup Guide](docs/MCP_SETUP.md)**

**Quick setup** - Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "codevault": {
      "command": "npx",
      "args": ["-y", "codevault", "mcp"],
      "env": {
        "CODEVAULT_EMBEDDING_API_KEY": "your-nebius-api-key",
        "CODEVAULT_EMBEDDING_BASE_URL": "https://api.studio.nebius.com/v1",
        "CODEVAULT_EMBEDDING_MODEL": "Qwen/Qwen3-Embedding-8B",
        "CODEVAULT_EMBEDDING_DIMENSIONS": "4096",
        "CODEVAULT_CHAT_API_KEY": "your-openrouter-api-key",
        "CODEVAULT_CHAT_BASE_URL": "https://openrouter.ai/api/v1",
        "CODEVAULT_CHAT_MODEL": "anthropic/claude-sonnet-4.5",
        "CODEVAULT_RERANK_API_URL": "https://api.novita.ai/openai/v1/rerank",
        "CODEVAULT_RERANK_API_KEY": "your-novita-api-key",
        "CODEVAULT_RERANK_MODEL": "qwen/qwen3-reranker-8b"
      }
    }
  }
}
```

**Example configs:**
- [NPX (Recommended)](examples/claude-desktop-config-npx.example.json)
- [Full Options](examples/claude-desktop-config.example.json)
- [Ollama Local](examples/claude-desktop-ollama.example.json)

## 📖 Documentation

- **[Configuration Guide](docs/CONFIGURATION.md)** - Complete configuration options
- **[MCP Setup Guide](docs/MCP_SETUP.md)** - Claude Desktop integration
- **[Ask Feature Guide](docs/ASK_FEATURE.md)** - LLM-synthesized Q&A
- **[CLI Reference](docs/CLI_REFERENCE.md)** - All commands and options
- **[API Providers](docs/PROVIDERS.md)** - Embedding, chat, and reranking providers
- **[Advanced Features](docs/ADVANCED.md)** - Chunking, encryption, context packs

### Quick Links

```bash
# Configuration Management
codevault config init                    # Interactive setup wizard
codevault config set <key> <value>       # Set global config value
codevault config list                    # Show merged config

# Indexing
codevault index [path]                   # Index project
codevault update [path]                  # Update existing index
codevault watch [path]                   # Watch for changes

# Searching  
codevault search <query>                 # Search code (metadata only)
codevault search-with-code <query>       # Search with full code chunks
codevault ask <question>                 # Ask questions, get synthesized answers
codevault chat                           # Interactive conversation mode (NEW!)

# Context Packs
codevault context list                   # List saved contexts
codevault context use <name>             # Activate context pack

# Utilities
codevault info                           # Project statistics
codevault mcp                            # Start MCP server
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

3. **LLM Synthesis Phase** (Ask Feature)
   - Searches for relevant code chunks
   - Retrieves full code content
   - Builds context prompt with metadata
   - Generates natural language answer via chat LLM
   - Returns markdown with code citations

4. **Interactive Chat Phase** (Chat Feature)
   - Maintains conversation history (last N turns)
   - Performs fresh semantic search for each question
   - Combines conversation context + new code chunks
   - Generates conversational responses with continuity
   - Supports commands: /help, /history, /clear, /stats

### Supported Languages

- **Web**: JavaScript, TypeScript, TSX, HTML, CSS, JSON, Markdown
- **Backend**: Python, PHP, Go, Java, Kotlin, C#, Ruby, Scala, Swift
- **Systems**: C, C++, Rust
- **Functional**: Haskell, OCaml, Elixir
- **Scripting**: Bash, Lua

### Recommended Providers

| Purpose | Provider | Model | Context | Best For |
|---------|----------|-------|---------|----------|
| **Embeddings** | Nebius | Qwen/Qwen3-Embedding-8B | 32K | High quality, large context |
| **Embeddings** | Ollama | nomic-embed-text | 8K | Local, privacy-focused |
| **Chat LLM** | OpenRouter | anthropic/claude-sonnet-4.5 | 200K | Best code understanding |
| **Chat LLM** | Ollama | qwen2.5-coder:7b | 32K | Local, code-specialized |
| **Reranking** | Novita | qwen/qwen3-reranker-8b | 32K | Best for code reranking |

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

## 🙏 Acknowledgments

Built with:
- [Model Context Protocol](https://modelcontextprotocol.io/) - AI integration framework
- [Tree-sitter](https://tree-sitter.github.io/) - Parsing infrastructure
- [OpenAI](https://openai.com/) - Embedding models
- [Ollama](https://ollama.ai/) - Local model support
- [Nebius AI Studio](https://nebius.com/) - Qwen embeddings
- [OpenRouter](https://openrouter.ai/) - LLM access
- [Novita AI](https://novita.ai/) - Reranking API

---

**Version**: 1.6.0  
**Built by**: Shariq Riaz  
**Last Updated**: November 2025