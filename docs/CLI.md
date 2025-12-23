# CodeVault CLI Reference

**Version:** 1.8.5

CodeVault provides a comprehensive command-line interface for indexing, searching, and querying codebases using semantic search and AI-powered synthesis.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Commands](#commands)
  - [index](#index)
  - [update](#update)
  - [watch](#watch)
  - [search](#search)
  - [search-with-code](#search-with-code)
  - [ask](#ask)
  - [chat](#chat)
  - [config](#config)
  - [context](#context)
  - [info](#info)
  - [mcp](#mcp)
- [Exit Codes](#exit-codes)
- [Environment Variables](#environment-variables)

---

## Installation

```bash
npm install -g codevault
```

After installation, the `codevault` command becomes available globally.

---

## Quick Start

```bash
# Index a project
codevault index /path/to/project

# Search for code
codevault search "authentication middleware" /path/to/project

# Ask a question about the codebase
codevault ask "How does the rate limiter work?"

# Start interactive chat
codevault chat
```

---

## Commands

### index

Index a project and build the `codevault.codemap.json` file with vector embeddings.

```bash
codevault index [path]
```

**Arguments:**

| Argument | Description | Default |
|----------|-------------|---------|
| `path` | Path to the project directory | `.` (current directory) |

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --provider <provider>` | Embedding provider (`auto` or `openai`) | `auto` |
| `--project <path>` | Alias for project path | - |
| `--directory <path>` | Alias for project directory | - |
| `--encrypt <mode>` | Encrypt chunk payloads (`on` or `off`) | - |
| `--concurrency <number>` | Number of files to process concurrently (1-1000) | `200` |
| `--verbose` | Show verbose output instead of progress UI | `false` |

**Examples:**

```bash
# Index current directory with default settings
codevault index

# Index a specific project with encryption
codevault index /path/to/project --encrypt on

# Index with higher concurrency for large codebases
codevault index --concurrency 500

# Index with verbose output for debugging
codevault index --verbose
```

**Output Files:**

- `.codevault/codevault.db` - SQLite database containing embeddings
- `codevault.codemap.json` - Symbol relationship map for code navigation

---

### update

Update the index by re-scanning all files. This command re-indexes the entire project.

```bash
codevault update [path]
```

**Arguments:**

| Argument | Description | Default |
|----------|-------------|---------|
| `path` | Path to the project directory | `.` (current directory) |

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --provider <provider>` | Embedding provider (`auto` or `openai`) | `auto` |
| `--project <path>` | Alias for project path | - |
| `--directory <path>` | Alias for project directory | - |
| `--encrypt <mode>` | Encrypt chunk payloads (`on` or `off`) | - |
| `--concurrency <number>` | Number of files to process concurrently (1-1000) | `200` |

**Examples:**

```bash
# Update index for current directory
codevault update

# Update with specific provider
codevault update --provider openai
```

---

### watch

Watch project files and automatically update the index when changes are detected.

```bash
codevault watch [path]
```

**Arguments:**

| Argument | Description | Default |
|----------|-------------|---------|
| `path` | Path to the project directory | `.` (current directory) |

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --provider <provider>` | Embedding provider (`auto` or `openai`) | `auto` |
| `--project <path>` | Alias for project path | - |
| `--directory <path>` | Alias for project directory | - |
| `-d, --debounce <ms>` | Debounce interval in milliseconds | `500` |
| `--encrypt <mode>` | Encrypt chunk payloads (`on` or `off`) | - |
| `--concurrency <number>` | Number of files to process concurrently (1-1000) | `200` |

**Examples:**

```bash
# Watch current directory
codevault watch

# Watch with longer debounce for high-change environments
codevault watch --debounce 2000

# Watch a specific project directory
codevault watch /path/to/project
```

**Behavior:**

- Monitors file system changes using native watchers
- Batches changes using the debounce interval to avoid excessive re-indexing
- Press `Ctrl+C` to stop the watcher gracefully

---

### search

Search indexed code using semantic search. Returns metadata only (file paths, symbols, scores).

```bash
codevault search <query> [path]
```

**Arguments:**

| Argument | Description | Default |
|----------|-------------|---------|
| `query` | Search query (required) | - |
| `path` | Path to the project directory | `.` (current directory) |

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-k, --limit <num>` | Maximum number of results (1-200) | `10` |
| `-p, --provider <provider>` | Embedding provider | `auto` |
| `--project <path>` | Project path | - |
| `--directory <path>` | Project directory | - |
| `--path_glob <pattern...>` | File patterns to filter results | - |
| `--tags <tag...>` | Filter by tags | - |
| `--lang <language...>` | Filter by programming language | - |
| `--reranker <mode>` | Reranker mode (`off` or `api`) | `off` |
| `--hybrid <mode>` | Enable hybrid search (`on` or `off`) | `on` |
| `--bm25 <mode>` | Enable BM25 keyword search (`on` or `off`) | `on` |
| `--symbol_boost <mode>` | Enable symbol boosting (`on` or `off`) | `on` |

**Examples:**

```bash
# Basic search
codevault search "error handling"

# Search with limit and language filter
codevault search "authentication" --limit 20 --lang typescript

# Search with file pattern filter
codevault search "database connection" --path_glob "src/db/**/*.ts"

# Disable hybrid search (vector only)
codevault search "API endpoint" --hybrid off
```

**Output Format:**

```
1. src/auth/middleware.ts
   validateToken() - typescript
   Score: 85%
```

---

### search-with-code

Search indexed code and display the full code chunks for each result.

```bash
codevault search-with-code <query> [path]
```

**Arguments:**

| Argument | Description | Default |
|----------|-------------|---------|
| `query` | Search query (required) | - |
| `path` | Path to the project directory | `.` (current directory) |

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-k, --limit <num>` | Maximum number of results | `5` |
| `-p, --provider <provider>` | Embedding provider | `auto` |
| `--project <path>` | Project path | - |
| `--directory <path>` | Project directory | - |
| `--path_glob <pattern...>` | File patterns to filter results | - |
| `--tags <tag...>` | Filter by tags | - |
| `--lang <language...>` | Filter by programming language | - |
| `--reranker <mode>` | Reranker mode (`off` or `api`) | `off` |
| `--hybrid <mode>` | Enable hybrid search (`on` or `off`) | `on` |
| `--bm25 <mode>` | Enable BM25 keyword search (`on` or `off`) | `on` |
| `--symbol_boost <mode>` | Enable symbol boosting (`on` or `off`) | `on` |
| `--max-code-size <bytes>` | Maximum code size to display per chunk | `100000` |

**Examples:**

```bash
# Search and show code
codevault search-with-code "rate limiting implementation"

# Limit results and code display size
codevault search-with-code "error handling" --limit 3 --max-code-size 5000
```

---

### ask

Ask a natural language question and receive an LLM-synthesized answer with code citations.

```bash
codevault ask <question>
```

**Arguments:**

| Argument | Description | Default |
|----------|-------------|---------|
| `question` | Natural language question (required) | - |

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --provider <provider>` | Embedding provider (`auto` or `openai`) | `auto` |
| `-c, --chat-provider <provider>` | Chat LLM provider (`auto` or `openai`) | `auto` |
| `--path <path>` | Project root directory | `.` |
| `--project <path>` | Alias for project path | - |
| `--directory <path>` | Alias for project directory | - |
| `-k, --max-chunks <num>` | Maximum code chunks to analyze | `10` |
| `--path_glob <pattern...>` | File patterns to filter | - |
| `--tags <tag...>` | Filter by tags | - |
| `--lang <language...>` | Filter by language | - |
| `--reranker <mode>` | Use API reranking (`on` or `off`) | `on` |
| `--multi-query` | Break complex questions into sub-queries | `false` |
| `--temperature <num>` | LLM temperature (0-2) | `0.7` |
| `--stream` | Stream the response in real-time | `false` |
| `--citations` | Add citation footer to response | `false` |
| `--no-metadata` | Hide search metadata | `false` |

**Examples:**

```bash
# Ask a simple question
codevault ask "How does the authentication system work?"

# Stream response for faster feedback
codevault ask "Explain the caching strategy" --stream

# Ask with more context
codevault ask "What are the rate limits?" --max-chunks 20

# Use multi-query for complex questions
codevault ask "Compare the database layer with the API layer" --multi-query
```

---

### chat

Start an interactive multi-turn conversation about the codebase. Maintains conversation history for context-aware follow-up questions.

```bash
codevault chat
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --provider <provider>` | Embedding provider (`auto` or `openai`) | `auto` |
| `-c, --chat-provider <provider>` | Chat LLM provider (`auto` or `openai`) | `auto` |
| `--path <path>` | Project root directory | `.` |
| `--project <path>` | Alias for project path | - |
| `--directory <path>` | Alias for project directory | - |
| `-k, --max-chunks <num>` | Maximum code chunks per query | `10` |
| `--path_glob <pattern...>` | File patterns to filter | - |
| `--tags <tag...>` | Filter by tags | - |
| `--lang <language...>` | Filter by language | - |
| `--reranker <mode>` | Use API reranking (`on` or `off`) | `on` |
| `--temperature <num>` | LLM temperature (0-2) | `0.7` |
| `--max-history <num>` | Maximum conversation turns to remember | `5` |

**In-Chat Commands:**

| Command | Description |
|---------|-------------|
| `/help` or `/?` | Show available commands |
| `/exit`, `/quit`, or `/q` | Exit chat mode |
| `/clear` | Clear conversation history |
| `/history` | Show conversation history |
| `/stats` | Show conversation statistics |

**Examples:**

```bash
# Start chat session
codevault chat

# Chat with more history context
codevault chat --max-history 10

# Chat focused on specific files
codevault chat --lang typescript --path_glob "src/api/**"
```

**Tips:**

- Ask follow-up questions naturally ("the function you mentioned")
- Reference previous answers for deeper exploration
- Use `/clear` to start a fresh topic
- Use `/stats` to see how much code has been explored

---

### config

Manage CodeVault configuration. Supports global (`~/.codevault/config.json`) and project-level (`.codevault/config.json`) configuration.

#### config init

Initialize global configuration interactively.

```bash
codevault config init
```

**Options:**

| Option | Description |
|--------|-------------|
| `--force` | Overwrite existing configuration |
| `--no-interactive` | Skip interactive prompts, create basic config |

**Examples:**

```bash
# Interactive setup (recommended)
codevault config init

# Force overwrite existing config
codevault config init --force

# Non-interactive basic setup
codevault config init --no-interactive
```

#### config set

Set a configuration value using dot notation.

```bash
codevault config set <key> <value>
```

**Options:**

| Option | Description |
|--------|-------------|
| `-l, --local [path]` | Save to project config instead of global |

**Examples:**

```bash
# Set global API key
codevault config set providers.openai.apiKey YOUR_API_KEY

# Set model
codevault config set providers.openai.model text-embedding-3-large

# Set project-specific configuration
codevault config set --local defaultProvider openai
```

#### config get

Get a configuration value.

```bash
codevault config get <key>
```

**Options:**

| Option | Description |
|--------|-------------|
| `-g, --global` | Get from global config only |
| `-l, --local [path]` | Get from project config only |

**Examples:**

```bash
# Get merged value (project > global)
codevault config get providers.openai.model

# Get from global config only
codevault config get --global defaultProvider
```

#### config list / config show

Show current configuration.

```bash
codevault config list
codevault config show
```

**Options:**

| Option | Description |
|--------|-------------|
| `-g, --global` | Show global config only |
| `-l, --local [path]` | Show project config only |
| `-s, --sources` | Show all configuration sources |

**Examples:**

```bash
# Show merged configuration
codevault config list

# Show all sources with priority
codevault config list --sources

# Show global config only
codevault config show --global
```

#### config unset

Remove a configuration value.

```bash
codevault config unset <key>
```

**Options:**

| Option | Description |
|--------|-------------|
| `-l, --local [path]` | Remove from project config instead of global |

**Examples:**

```bash
# Remove global setting
codevault config unset providers.openai.model

# Remove project setting
codevault config unset --local maxTokens
```

#### config path

Show configuration file paths.

```bash
codevault config path
```

---

### context

Manage context packs for scoped search defaults. Context packs are JSON files stored in `.codevault/contextpacks/`.

#### context list

List available context packs.

```bash
codevault context list [path]
```

**Arguments:**

| Argument | Description | Default |
|----------|-------------|---------|
| `path` | Path to the project directory | `.` |

**Examples:**

```bash
codevault context list
```

**Output:**

```
Context packs in /path/to/project:
  - frontend (Frontend Components) - UI and styling files
  - backend (Backend Services) - API and database files
```

#### context show

Show context pack definition.

```bash
codevault context show <name> [path]
```

**Arguments:**

| Argument | Description | Default |
|----------|-------------|---------|
| `name` | Context pack name (required) | - |
| `path` | Path to the project directory | `.` |

**Examples:**

```bash
codevault context show frontend
```

#### context use

Activate a context pack for subsequent searches.

```bash
codevault context use <name> [path]
```

**Arguments:**

| Argument | Description | Default |
|----------|-------------|---------|
| `name` | Context pack name (required) | - |
| `path` | Path to the project directory | `.` |

**Examples:**

```bash
codevault context use backend
```

---

### info

Display project indexing statistics and information.

```bash
codevault info
```

**Output includes:**

- Total indexed functions
- Functions by language
- Files with most functions (top 10)

**Examples:**

```bash
codevault info
```

**Sample Output:**

```
CodeVault project information

Total indexed functions: 245

By language:
  typescript: 180 functions
  javascript: 45 functions
  json: 20 functions

Files with most functions:
  src/core/IndexerEngine.ts: 15 functions
  src/search/hybrid.ts: 12 functions
```

---

### mcp

Start the Model Context Protocol (MCP) server for AI assistant integration.

```bash
codevault mcp
```

This command launches the MCP server using stdio transport, enabling AI assistants (like Claude) to interact with the indexed codebase.

**Signal Handling:**

- `SIGINT` (Ctrl+C): Graceful shutdown
- `SIGTERM`: Graceful shutdown

---

## Exit Codes

| Code | Name | Description |
|------|------|-------------|
| `0` | SUCCESS | Command completed successfully |
| `1` | ERROR | General error occurred |
| `2` | INVALID_ARGS | Invalid command arguments |
| `130` | INTERRUPTED | Command interrupted (Ctrl+C) |

---

## Environment Variables

CodeVault respects the following environment variables:

| Variable | Description |
|----------|-------------|
| `CODEVAULT_QUIET` | Suppress verbose logging when set to `true` |
| `OPENAI_API_KEY` | OpenAI API key for embeddings and chat |
| `CODEVAULT_ENCRYPTION_KEY` | Encryption key for chunk payloads |

Environment variables take precedence over configuration files.

---

## Configuration Priority

Configuration is resolved in the following order (highest to lowest priority):

1. **Environment Variables** - Override all other settings
2. **Project Config** - `.codevault/config.json` in the project directory
3. **Global Config** - `~/.codevault/config.json` in the user's home directory
4. **Defaults** - Built-in default values

---

## See Also

- [Configuration Guide](./CONFIGURATION.md) - Detailed configuration options
- [CLAUDE.md](../CLAUDE.md) - Project overview and architecture
