# CLI Reference

Complete reference for all CodeVault command-line interface commands.

## 📋 Command Overview

```bash
codevault <command> [options]

Commands:
  config          Configuration management
  index          Index a project
  update         Update existing index
  watch          Watch for changes and auto-update
  search         Semantic search (metadata only)
  search-with-code  Semantic search with full code
  ask            Ask questions, get LLM answers
  chat           Interactive conversation mode
  context        Context pack management
  info           Project statistics
  mcp            Start MCP server
  --version      Show version
  --help         Show help
```

## 🔧 Configuration Commands

### `config init`

Initialize global configuration with interactive wizard.

```bash
codevault config init [options]

Options:
  --force        Overwrite existing config
```

**Example:**
```bash
codevault config init
```

### `config set`

Set configuration value.

```bash
codevault config set [options] <key> <value>

Options:
  --local        Set in project config (default: global)
  --global       Set in global config

Arguments:
  key           Configuration key (dot notation)
  value         Configuration value
```

**Examples:**
```bash
# Global config
codevault config set providers.openai.apiKey sk-xxx
codevault config set providers.openai.model Qwen/Qwen3-Embedding-8B

# Project config
codevault config set --local providers.openai.baseUrl http://localhost:11434/v1
```

### `config get`

Get configuration value.

```bash
codevault config get [options] <key>

Options:
  --local        Get from project config only
  --global       Get from global config only

Arguments:
  key           Configuration key (dot notation)
```

**Examples:**
```bash
codevault config get providers.openai.apiKey
codevault config get --global providers.openai.model
```

### `config list`

List configuration values.

```bash
codevault config list [options]

Options:
  --local        Show project config only
  --global       Show global config only
  --sources      Show all config sources separately
```

**Examples:**
```bash
# Merged configuration
codevault config list

# See all sources
codevault config list --sources
```

### `config unset`

Remove configuration value.

```bash
codevault config unset [options] <key>

Options:
  --local        Remove from project config
  --global       Remove from global config

Arguments:
  key           Configuration key (dot notation)
```

**Examples:**
```bash
codevault config unset providers.openai.apiKey
codevault config unset --local providers.openai.baseUrl
```

### `config path`

Show configuration file paths.

```bash
codevault config path
```

**Output:**
```
Global config: /Users/username/.codevault/config.json
Project config: /path/to/project/.codevault/config.json
```

## 📚 Indexing Commands

### `index`

Index a project for semantic search.

```bash
codevault index [path] [options]

Arguments:
  path          Project path to index (default: current directory)

Options:
  -p, --provider <name>     Embedding provider (auto|openai|ollama)
  --encrypt <on|off>        Enable encryption (default: off)
```

**Examples:**
```bash
# Index current directory
codevault index

# Index specific path
codevault index /path/to/project

# Use Ollama
export CODEVAULT_EMBEDDING_BASE_URL=http://localhost:11434/v1
export CODEVAULT_EMBEDDING_MODEL=nomic-embed-text
codevault index

# With encryption
export CODEVAULT_ENCRYPTION_KEY=$(openssl rand -base64 32)
codevault index --encrypt on
```

### `update`

Update existing index (changed files only).

```bash
codevault update [path] [options]

Arguments:
  path          Project path to update (default: current directory)

Options:
  -p, --provider <name>     Embedding provider (auto|openai|ollama)
```

**Examples:**
```bash
# Update current directory
codevault update

# Update specific path
codevault update /path/to/project
```

### `watch`

Watch for file changes and auto-update index.

```bash
codevault watch [path] [options]

Arguments:
  path          Project path to watch (default: current directory)

Options:
  -p, --provider <name>     Embedding provider (auto|openai|ollama)
  --debounce <ms>          Debounce delay in milliseconds (default: 500)
```

**Examples:**
```bash
# Watch current directory
codevault watch

# Custom debounce (faster updates)
codevault watch --debounce 500

# Watch specific path
codevault watch /path/to/project
```

## 🔍 Search Commands

### `search`

Semantic search (returns metadata only).

```bash
codevault search <query> [path] [options]

Arguments:
  query         Search query
  path          Project path (default: current directory)

Options:
  -p, --provider <name>        Embedding provider (auto|openai|ollama)
  -l, --limit <num>            Max results (default: 10)
  --path_glob <pattern...>     Filter by file pattern
  --tags <tag...>              Filter by tags
  --lang <language...>         Filter by language
  --reranker <on|off>          Use API reranking (default: off)
  --hybrid <on|off>            Hybrid search (default: on)
  --bm25 <on|off>              BM25 keyword search (default: on)
  --symbol_boost <on|off>      Symbol boosting (default: on)
```

**Examples:**
```bash
# Basic search
codevault search "authentication function"

# With limit
codevault search "database connection" --limit 5

# With filters
codevault search "stripe checkout" \
  --tags stripe,payment \
  --lang typescript,javascript \
  --path_glob "src/payments/**"

# With reranking
codevault search "user login" --reranker on

# Different search modes
codevault search "api endpoint" --hybrid off --bm25 on
```

### `search-with-code`

Semantic search with full code chunks.

```bash
codevault search-with-code <query> [path] [options]

Arguments:
  query         Search query
  path          Project path (default: current directory)

Options:
  (Same as search command, plus:)
  --max-code-size <bytes>      Max code size per chunk (default: 100000)
```

**Examples:**
```bash
# Search with code
codevault search-with-code "authentication middleware"

# Limit code size
codevault search-with-code "large function" --max-code-size 10000

# With filters and code
codevault search-with-code "payment processing" \
  --tags stripe \
  --lang php \
  --limit 3
```

### `ask`

Ask questions and get LLM-synthesized answers.

```bash
codevault ask <question> [options]

Arguments:
  question      Your question about the codebase

Options:
  -p, --provider <name>        Embedding provider (auto|openai|ollama)
  -c, --chat-provider <name>   Chat LLM provider (auto|openai|ollama)
  --path <path>                Project path (default: current directory)
  -k, --max-chunks <num>       Max code chunks to analyze (default: 10)
  --path_glob <pattern...>     Filter by file pattern
  --tags <tag...>              Filter by tags
  --lang <language...>         Filter by language
  --reranker <on|off>          Use API reranking (default: on)
  --multi-query                Break complex questions into sub-queries
  --temperature <num>          LLM temperature 0-2 (default: 0.7)
  --stream                     Stream response in real-time
  --citations                  Add citation footer
  --no-metadata                Hide search metadata
```

**Examples:**
```bash
# Simple question
codevault ask "How does authentication work?"

# With reranking
codevault ask "How do I add a new payment provider?" --reranker on

# Streaming response
codevault ask "Explain the database schema" --stream

# Multi-query for complex questions
codevault ask "What are the main components and how do they interact?" \
  --multi-query

# With filters
codevault ask "How is Stripe integrated?" \
  --tags stripe \
  --lang typescript \
  --max-chunks 15

# Adjust creativity
codevault ask "How could I improve error handling?" \
  --temperature 1.0

# Using local Ollama
export CODEVAULT_CHAT_BASE_URL=http://localhost:11434/v1
export CODEVAULT_CHAT_MODEL=qwen2.5-coder:7b
codevault ask "How does routing work?"
```

### `chat`

Start interactive conversation mode with conversation history.

```bash
codevault chat [options]

Options:
  -p, --provider <name>        Embedding provider (auto|openai|ollama)
  -c, --chat-provider <name>   Chat LLM provider (auto|openai|ollama)
  --path <path>                Project path (default: current directory)
  --project <path>             Alias for project path
  --directory <path>           Alias for project directory
  -k, --max-chunks <num>       Max code chunks per query (default: 10)
  --path_glob <pattern...>     Filter by file pattern
  --tags <tag...>              Filter by tags
  --lang <language...>         Filter by language
  --reranker <on|off>          Use API reranking (default: on)
  --temperature <num>          LLM temperature 0-2 (default: 0.7)
  --max-history <num>          Max conversation turns to remember (default: 5)
```

**In-Chat Commands:**
- `/help` - Show available commands
- `/exit`, `/quit`, `/q` - Exit chat mode
- `/clear` - Clear conversation history
- `/history` - View conversation history
- `/stats` - Show conversation statistics

**Examples:**
```bash
# Start interactive chat
codevault chat

# With filters
codevault chat --tags auth --lang typescript

# Custom settings
codevault chat \
  --max-chunks 15 \
  --temperature 0.8 \
  --max-history 10

# Using context pack
codevault context use feature-auth
codevault chat

# Example conversation:
# You: How does authentication work?
# Assistant: [explains auth with code citations]
# You: What about session management?
# Assistant: [builds on previous answer]
# You: /stats
# [Shows conversation statistics]
# You: /exit
```

**Features:**
- Multi-turn conversations with history
- Maintains context across questions
- Fresh semantic search for each query
- Combines conversation history + new code chunks
- Conversational responses that build on previous answers
- Commands for managing conversation state

## 📦 Context Pack Commands

### `context list`

List all saved context packs.

```bash
codevault context list [path]

Arguments:
  path          Project path (default: current directory)
```

**Example:**
```bash
codevault context list
```

### `context show`

Show details of a specific context pack.

```bash
codevault context show <name> [path]

Arguments:
  name          Context pack name
  path          Project path (default: current directory)
```

**Example:**
```bash
codevault context show feature-auth
```

### `context use`

Activate a context pack (sets default search scope).

```bash
codevault context use <name> [path]

Arguments:
  name          Context pack name
  path          Project path (default: current directory)
```

**Example:**
```bash
# Activate context pack
codevault context use feature-auth

# Now searches are scoped to that context
codevault search "token validation"
```

## 📊 Utility Commands

### `info`

Show project statistics and index information.

```bash
codevault info [path]

Arguments:
  path          Project path (default: current directory)
```

**Example:**
```bash
codevault info
```

**Output:**
```
Project Statistics
==================
Total Chunks:     1,523
Total Files:      342
Indexed:          Yes
Database Size:    45.2 MB
Codemap Size:     2.1 MB

Languages:
  TypeScript:     245 files
  Python:         67 files
  JavaScript:     30 files

Last Indexed:     2025-01-15 10:30:45
Provider:         OpenAI (Qwen3-Embedding-8B)
```

### `mcp`

Start MCP server for Claude Desktop integration.

```bash
codevault mcp
```

**Note:** Usually called via MCP config, not directly.

### `--version`

Show version information.

```bash
codevault --version
```

### `--help`

Show help information.

```bash
codevault --help
codevault <command> --help
```

## 🌐 Environment Variables

All commands respect environment variables for configuration:

### Embedding Provider

```bash
export CODEVAULT_EMBEDDING_API_KEY=your-key
export CODEVAULT_EMBEDDING_BASE_URL=https://api.studio.nebius.com/v1
export CODEVAULT_EMBEDDING_MODEL=Qwen/Qwen3-Embedding-8B
export CODEVAULT_EMBEDDING_DIMENSIONS=4096
export CODEVAULT_EMBEDDING_MAX_TOKENS=32000
```

### Chat LLM

```bash
export CODEVAULT_CHAT_API_KEY=your-key
export CODEVAULT_CHAT_BASE_URL=https://openrouter.ai/api/v1
export CODEVAULT_CHAT_MODEL=anthropic/claude-sonnet-4.5
export CODEVAULT_CHAT_MAX_TOKENS=32000
export CODEVAULT_CHAT_TEMPERATURE=0.1
```

### Reranking

```bash
export CODEVAULT_RERANK_API_URL=https://api.novita.ai/openai/v1/rerank
export CODEVAULT_RERANK_API_KEY=your-key
export CODEVAULT_RERANK_MODEL=qwen/qwen3-reranker-8b
```

### Rate Limiting

```bash
export CODEVAULT_EMBEDDING_RATE_LIMIT_RPM=10000
export CODEVAULT_EMBEDDING_RATE_LIMIT_TPM=600000
```

### Encryption

```bash
export CODEVAULT_ENCRYPTION_KEY=$(openssl rand -base64 32)
```

## 💡 Common Workflows

### Initial Setup

```bash
# 1. Install
npm install -g codevault

# 2. Configure
codevault config init

# 3. Set API keys
codevault config set providers.openai.apiKey your-nebius-key
codevault config set chatLLM.openai.apiKey your-openrouter-key
codevault config set reranker.apiKey your-novita-key

# 4. Index project
cd /path/to/project
codevault index
```

### Daily Development

```bash
# Watch for changes
codevault watch --debounce 500 &

# Search as you code
codevault search "function name"

# Ask questions
codevault ask "How does this feature work?" --stream

# Interactive chat
codevault chat
```

### Code Review

```bash
# Search for specific patterns
codevault search "error handling" --lang typescript --limit 20

# Ask about code quality
codevault ask "Are there any security concerns in authentication?" \
  --tags auth,security \
  --reranker on
```

### Documentation

```bash
# Find all API endpoints
codevault search "api endpoint" --path_glob "src/routes/**"

# Generate documentation
codevault ask "Explain all API endpoints" \
  --path_glob "src/routes/**" \
  --citations
```

## 🐛 Troubleshooting Commands

### Check Configuration

```bash
# See what config is being used
codevault config list --sources

# Verify specific settings
codevault config get providers.openai.apiKey
codevault config get chatLLM.openai.model
```

### Debug Indexing

```bash
# Check project stats
codevault info

# Re-index with fresh start
rm -rf .codevault/
codevault index
```

### Test Search

```bash
# Simple search test
codevault search "test" --limit 1

# Full search with code
codevault search-with-code "test" --limit 1
```

### Test Ask Feature

```bash
# Simple question
codevault ask "What is this codebase about?" --max-chunks 5

# With streaming
codevault ask "What languages are used?" --stream --no-metadata
```

## 📚 Additional Resources

- [Configuration Guide](CONFIGURATION.md) - Detailed configuration
- [MCP Setup Guide](MCP_SETUP.md) - Claude Desktop integration
- [Ask Feature Guide](ASK_FEATURE.md) - LLM Q&A feature
- [API Providers](PROVIDERS.md) - Provider comparison

---

**Version:** 1.6.0  
**Last Updated:** November 2025