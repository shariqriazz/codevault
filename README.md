# CodeVault

> AI-powered semantic code search via Model Context Protocol (MCP)

CodeVault is an intelligent code indexing and search system that enables AI assistants to understand and navigate your codebase using semantic search, symbol-aware ranking, and hybrid retrieval techniques.

## 🌟 Features

- **🔍 Semantic Code Search**: Find code by meaning, not just keywords
- **🤖 MCP Integration**: Native support for Claude Desktop and other MCP clients
- **🎯 Symbol-Aware Ranking**: Boost results based on function signatures and relationships
- **⚡ Hybrid Search**: Combines vector embeddings with BM25 keyword matching
- **🔄 Context Packs**: Save and reuse search scopes for different projects
- **📊 Multi-Language Support**: 25+ programming languages via Tree-sitter
- **🏠 Local-First**: Works with local models (Ollama) or cloud APIs
- **🔐 Optional Encryption**: Secure your indexed code chunks
- **📈 Smart Chunking**: Token-aware code splitting for optimal context

## 🚀 Quick Start

### Installation

```bash
npm install
npm run build
npm link
```

### Index Your Project

```bash
# Navigate to your project
cd /path/to/your/project

# Using Ollama (local, no API key required)
codevault index --provider ollama

# Using OpenAI
export OPENAI_API_KEY=your-key-here
codevault index --provider openai

# Using Qwen (via Nebius AI Studio)
export OPENAI_API_KEY=your-nebius-api-key
export OPENAI_BASE_URL=https://api.studio.nebius.com/v1/
export CODEVAULT_OPENAI_EMBEDDING_MODEL=Qwen/Qwen3-Embedding-8B
codevault index --provider openai
```

### Search Your Code

```bash
codevault search "authentication function"
codevault search "stripe checkout" --tags stripe --lang php
```

### Use with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "codevault": {
      "command": "node",
      "args": ["/path/to/codevault-v2/dist/mcp-server.js"],
      "env": {
        "OPENAI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## 📖 Documentation

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
| **openai** | Qwen/Qwen3-Embedding-8B | 4096 | 32K | Large context, high quality | ✅ Yes (Nebius AI) |

### CLI Commands

```bash
# Indexing
codevault index [path]              # Index project
codevault update [path]             # Update existing index
codevault watch [path]              # Watch for changes

# Searching
codevault search <query> [path]     # Search code
  --limit <num>                     # Max results
  --provider <name>                 # Embedding provider
  --path_glob <pattern>             # Filter by file pattern
  --tags <tag...>                   # Filter by tags
  --lang <language...>              # Filter by language

# Context Packs
codevault context list              # List saved contexts
codevault context show <name>       # Show context pack
codevault context use <name>        # Activate context pack

# Utilities
codevault info                      # Project statistics
codevault mcp                       # Start MCP server
```

### MCP Tools

- **`search_code`**: Semantic code search with filters
- **`search_code_with_chunks`**: Search + retrieve full code
- **`get_code_chunk`**: Get specific code by SHA
- **`index_project`**: Index a new project
- **`update_project`**: Update existing index
- **`get_project_stats`**: Project overview
- **`use_context_pack`**: Apply saved search context

### Environment Variables

```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
CODEVAULT_OPENAI_EMBEDDING_MODEL=text-embedding-3-large

# Ollama Configuration
CODEVAULT_OLLAMA_MODEL=nomic-embed-text

# Chunking
CODEVAULT_MAX_TOKENS=8192
CODEVAULT_DIMENSIONS=3072

# Rate Limiting
CODEVAULT_RATE_LIMIT_RPM=10000    # Requests per minute
CODEVAULT_RATE_LIMIT_TPM=600000   # Tokens per minute

# Reranking
CODEVAULT_RERANK_API_URL=...
CODEVAULT_RERANK_API_KEY=...
CODEVAULT_RERANK_MODEL=...

# Encryption
CODEVAULT_ENCRYPTION_KEY=...
```

## 🏗️ Architecture

### Project Structure

```
.codevault/
├── codevault.db          # SQLite database
├── chunks/               # Compressed code chunks
└── contextpacks/         # Saved search contexts
codevault.codemap.json    # Lightweight index
```

## 📄 License

MIT License

---

**Built by Shariq Riaz**