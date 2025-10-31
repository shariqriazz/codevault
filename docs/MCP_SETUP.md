# MCP Setup Guide

Complete guide to setting up CodeVault with Claude Desktop and other MCP clients.

## 🎯 Quick Setup

**Example config files:** See [examples directory](../examples/) for ready-to-use configs:
- [`claude-desktop-config-npx.example.json`](../examples/claude-desktop-config-npx.example.json) - NPX setup (recommended)
- [`claude-desktop-config.example.json`](../examples/claude-desktop-config.example.json) - Full configuration
- [`claude-desktop-ollama.example.json`](../examples/claude-desktop-ollama.example.json) - Local Ollama setup

### Claude Desktop (NPX - Simplest)

Add to your `claude_desktop_config.json`:

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
        "CODEVAULT_EMBEDDING_MAX_TOKENS": "32000",
        "CODEVAULT_CHAT_API_KEY": "your-openrouter-api-key",
        "CODEVAULT_CHAT_BASE_URL": "https://openrouter.ai/api/v1",
        "CODEVAULT_CHAT_MODEL": "anthropic/claude-sonnet-4.5",
        "CODEVAULT_CHAT_MAX_TOKENS": "32000",
        "CODEVAULT_RERANK_API_URL": "https://api.novita.ai/openai/v1/rerank",
        "CODEVAULT_RERANK_API_KEY": "your-novita-api-key",
        "CODEVAULT_RERANK_MODEL": "qwen/qwen3-reranker-8b"
      }
    }
  }
}
```

### Claude Desktop (Local Installation)

If you've installed CodeVault globally or from source:

```json
{
  "mcpServers": {
    "codevault": {
      "command": "node",
      "args": ["/path/to/codevault/dist/mcp-server.js"],
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

**Find the path:**
```bash
# If installed globally with npm
which codevault
# Then use: /usr/local/lib/node_modules/codevault/dist/mcp-server.js

# If installed from source
cd /path/to/codevault
pwd
# Then use: /path/to/codevault/dist/mcp-server.js
```

## 📍 Config File Locations

### macOS
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

### Windows
```
%APPDATA%\Claude\claude_desktop_config.json
```

### Linux
```
~/.config/Claude/claude_desktop_config.json
```

## 🔧 Configuration Options

### Full Configuration (All Features)

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
        "CODEVAULT_EMBEDDING_MAX_TOKENS": "32000",
        "CODEVAULT_EMBEDDING_RATE_LIMIT_RPM": "10000",
        "CODEVAULT_EMBEDDING_RATE_LIMIT_TPM": "600000",
        "CODEVAULT_CHAT_API_KEY": "your-openrouter-api-key",
        "CODEVAULT_CHAT_BASE_URL": "https://openrouter.ai/api/v1",
        "CODEVAULT_CHAT_MODEL": "anthropic/claude-sonnet-4.5",
        "CODEVAULT_CHAT_MAX_TOKENS": "32000",
        "CODEVAULT_CHAT_TEMPERATURE": "0.1",
        "CODEVAULT_RERANK_API_URL": "https://api.novita.ai/openai/v1/rerank",
        "CODEVAULT_RERANK_API_KEY": "your-novita-api-key",
        "CODEVAULT_RERANK_MODEL": "qwen/qwen3-reranker-8b",
        "CODEVAULT_ENCRYPTION_KEY": ""
      },
      "alwaysAllow": [
        "use_context_pack",
        "search_code",
        "get_code_chunk",
        "index_project",
        "get_project_stats",
        "update_project",
        "search_code_with_chunks",
        "ask_codebase"
      ],
      "timeout": 3600
    }
  }
}
```

### Local Ollama Setup

```json
{
  "mcpServers": {
    "codevault": {
      "command": "npx",
      "args": ["-y", "codevault", "mcp"],
      "env": {
        "CODEVAULT_EMBEDDING_BASE_URL": "http://localhost:11434/v1",
        "CODEVAULT_EMBEDDING_MODEL": "nomic-embed-text",
        "CODEVAULT_EMBEDDING_DIMENSIONS": "768",
        "CODEVAULT_EMBEDDING_MAX_TOKENS": "8192",
        "CODEVAULT_CHAT_BASE_URL": "http://localhost:11434/v1",
        "CODEVAULT_CHAT_MODEL": "qwen2.5-coder:7b",
        "CODEVAULT_CHAT_MAX_TOKENS": "32000"
      }
    }
  }
}
```

## 🛠️ Available MCP Tools

CodeVault provides these tools when used via MCP:

### 1. `search_code`
**Description:** Semantic search returning metadata (paths, symbols, scores)

**Parameters:**
```typescript
{
  query: string;              // Search query
  path?: string;              // Project root (default: cwd)
  limit?: number;             // Max results (default: 10)
  provider?: string;          // Embedding provider
  path_glob?: string[];       // File patterns to include
  tags?: string[];            // Filter by tags
  lang?: string[];            // Filter by language
  reranker?: "on" | "off";    // Use API reranking
  hybrid?: "on" | "off";      // Hybrid search (vector + BM25)
  bm25?: "on" | "off";        // BM25 keyword search
  symbol_boost?: "on" | "off"; // Symbol-based boosting
}
```

**Example Response:**
```json
{
  "results": [
    {
      "path": "src/auth/middleware.ts",
      "symbol": "authenticate",
      "score": 0.89,
      "sha": "abc123...",
      "metadata": {
        "line": 45,
        "type": "function",
        "params": ["req", "res", "next"]
      }
    }
  ],
  "metadata": {
    "provider": "OpenAI",
    "searchType": "hybrid",
    "totalResults": 5
  }
}
```

### 2. `search_code_with_chunks`
**Description:** Search + retrieve full code for each result

**Parameters:**
Same as `search_code` plus:
```typescript
{
  max_code_size?: number;     // Max bytes per chunk (default: 50000)
}
```

**Example Response:**
```json
{
  "results": [
    {
      "path": "src/auth/middleware.ts",
      "symbol": "authenticate",
      "score": 0.89,
      "code": "export function authenticate(req, res, next) {\n  // Full code here...\n}",
      "metadata": {...}
    }
  ]
}
```

### 3. `get_code_chunk`
**Description:** Get specific code chunk by SHA

**Parameters:**
```typescript
{
  sha: string;                // Chunk SHA hash
  path?: string;              // Project root
}
```

### 4. `ask_codebase`
**Description:** Ask questions and get LLM-synthesized answers with code citations

**Parameters:**
```typescript
{
  question: string;           // Your question
  path?: string;              // Project root
  provider?: string;          // Embedding provider
  chat_provider?: string;     // Chat LLM provider
  max_chunks?: number;        // Max chunks to analyze (default: 10)
  path_glob?: string[];       // File patterns
  tags?: string[];            // Filter by tags
  lang?: string[];            // Filter by language
  reranker?: "on" | "off";    // Use reranking (default: on)
  multi_query?: boolean;      // Multi-query breakdown
  temperature?: number;       // LLM temperature 0-2 (default: 0.7)
}
```

**Example Response:**
```markdown
---
**Search Metadata**

- Search Type: hybrid
- Embedding Provider: OpenAI
- Chat Provider: OpenAI-Chat
- Chunks Analyzed: 5

---

# How Authentication Works

The authentication system uses a middleware-based approach...

[Full synthesized answer with code citations]

---

_Generated using CodeVault semantic search + LLM synthesis_
```

### 5. `index_project`
**Description:** Index a new project

**Parameters:**
```typescript
{
  path: string;               // Project root to index
  provider?: string;          // Embedding provider
  encrypt?: "on" | "off";     // Enable encryption
}
```

### 6. `update_project`
**Description:** Update existing index

**Parameters:**
```typescript
{
  path: string;               // Project root to update
  provider?: string;          // Embedding provider
}
```

### 7. `get_project_stats`
**Description:** Get project overview and statistics

**Parameters:**
```typescript
{
  path?: string;              // Project root (default: cwd)
}
```

**Example Response:**
```json
{
  "totalChunks": 1523,
  "totalFiles": 342,
  "languages": {
    "typescript": 245,
    "python": 67,
    "javascript": 30
  },
  "dbSize": "45.2 MB",
  "codemapSize": "2.1 MB",
  "indexed": true
}
```

### 8. `use_context_pack`
**Description:** Apply saved search context/scope

**Parameters:**
```typescript
{
  name: string;               // Context pack name
  path?: string;              // Project root
}
```

## 💡 Usage Examples

### Basic Search

```
Use the search_code tool to find authentication-related code:

search_code({
  query: "user authentication",
  limit: 5,
  lang: ["typescript", "javascript"]
})
```

### Ask Questions

```
Use the ask_codebase tool to understand how authentication works:

ask_codebase({
  question: "How does user authentication work in this codebase?",
  max_chunks: 10,
  reranker: "on"
})
```

### Index New Project

```
Use the index_project tool to index a new codebase:

index_project({
  path: "/path/to/project",
  provider: "openai"
})
```

### Search with Filters

```
Use search_code with filters to find Stripe-related PHP code:

search_code({
  query: "stripe payment processing",
  path_glob: ["src/payments/**"],
  tags: ["stripe"],
  lang: ["php"],
  reranker: "on"
})
```

## 🔒 Security Considerations

### API Keys

1. **Never commit MCP config files** with real API keys
2. **Use environment-specific configs** for different projects
3. **Rotate keys regularly** if shared in teams
4. **Use read-only keys** when possible

### Example with Separate Keys

```json
{
  "mcpServers": {
    "codevault-work": {
      "command": "npx",
      "args": ["-y", "codevault", "mcp"],
      "env": {
        "CODEVAULT_EMBEDDING_API_KEY": "work-embedding-key",
        "CODEVAULT_CHAT_API_KEY": "work-chat-key"
      }
    },
    "codevault-personal": {
      "command": "npx",
      "args": ["-y", "codevault", "mcp"],
      "env": {
        "CODEVAULT_EMBEDDING_API_KEY": "personal-embedding-key",
        "CODEVAULT_CHAT_API_KEY": "personal-chat-key"
      }
    }
  }
}
```

## 🐛 Troubleshooting

### "MCP server not found"

**Solution:** Ensure CodeVault is installed:
```bash
# Global installation
npm install -g codevault

# Or use npx (no installation needed)
# Just use "npx" in command field
```

### "Connection timeout"

**Solution:** Increase timeout in config:
```json
{
  "timeout": 3600
}
```

### "API key errors"

**Solution:** Verify environment variables are set correctly:
```bash
# Check Claude Desktop logs
# macOS: ~/Library/Logs/Claude/mcp*.log
# Windows: %APPDATA%\Claude\logs\mcp*.log
```

### "Permission denied"

**Solution:** Ensure proper file permissions:
```bash
# macOS/Linux
chmod +x /path/to/codevault/dist/mcp-server.js

# Or use node explicitly
"command": "node"
```

### "Tools not appearing in Claude"

**Solution:**
1. Restart Claude Desktop completely
2. Check MCP server logs for errors
3. Verify config syntax is valid JSON
4. Ensure all required environment variables are set

### "Indexing fails in MCP"

**Solution:**
1. Verify API keys are correct
2. Check rate limits aren't exceeded
3. Ensure project path is accessible
4. Try indexing via CLI first to debug

## 📊 Performance Tips

### 1. Use `alwaysAllow` for Common Tools

```json
{
  "alwaysAllow": [
    "search_code",
    "get_code_chunk",
    "ask_codebase"
  ]
}
```

### 2. Adjust Timeout for Large Projects

```json
{
  "timeout": 7200
}
```

### 3. Enable Reranking for Better Results

```json
{
  "env": {
    "CODEVAULT_RERANK_API_URL": "https://api.novita.ai/openai/v1/rerank",
    "CODEVAULT_RERANK_API_KEY": "your-key",
    "CODEVAULT_RERANK_MODEL": "qwen/qwen3-reranker-8b"
  }
}
```

### 4. Use Rate Limiting for Shared APIs

```json
{
  "env": {
    "CODEVAULT_EMBEDDING_RATE_LIMIT_RPM": "500",
    "CODEVAULT_EMBEDDING_RATE_LIMIT_TPM": "100000"
  }
}
```

## 🔄 Updating CodeVault

### NPX Method (Automatic)

NPX always uses the latest version automatically. No action needed!

### Local Installation Method

```bash
# Update global installation
npm update -g codevault

# Update from source
cd /path/to/codevault
git pull
npm install --legacy-peer-deps
npm run build

# Restart Claude Desktop
```

## 📚 Additional Resources

- [Configuration Guide](CONFIGURATION.md) - Detailed configuration options
- [Ask Feature Guide](ASK_FEATURE.md) - LLM-synthesized Q&A
- [API Providers](PROVIDERS.md) - Provider comparison and setup
- [CLI Reference](CLI_REFERENCE.md) - Command-line usage

---

**Need help?** Check the [GitHub Issues](https://github.com/shariqriazz/codevault/issues) or create a new issue.