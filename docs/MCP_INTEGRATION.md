# MCP Integration Guide

> Model Context Protocol (MCP) Server for CodeVault v1.8.5

This document provides comprehensive technical documentation for the CodeVault MCP server, including all available tools, their parameters, response formats, and integration patterns.

## Table of Contents

- [Overview](#overview)
- [Server Architecture](#server-architecture)
- [Quick Start](#quick-start)
- [Available Tools](#available-tools)
  - [search_code](#search_code)
  - [search_code_with_chunks](#search_code_with_chunks)
  - [get_code_chunk](#get_code_chunk)
  - [index_project](#index_project)
  - [update_project](#update_project)
  - [get_project_stats](#get_project_stats)
  - [use_context_pack](#use_context_pack)
  - [ask_codebase](#ask_codebase)
- [Error Handling](#error-handling)
- [Session State](#session-state)
- [Configuration](#configuration)
- [Performance Considerations](#performance-considerations)

---

## Overview

The CodeVault MCP server exposes semantic code search and analysis capabilities via the Model Context Protocol. It enables AI assistants to:

- Search codebases semantically using vector embeddings
- Retrieve full code chunks by SHA identifier
- Index and update project codebases
- Ask natural language questions and receive LLM-synthesized answers with code citations
- Manage search scopes via context packs

### Transport

The server uses **stdio transport** exclusively. All output is sent through the MCP protocol on stdout. Diagnostic messages are written to stderr to avoid protocol corruption.

### Binary Entry Point

```
codevault-mcp
```

Or via npx:

```bash
npx codevault mcp
```

---

## Server Architecture

### Core Components

```
src/mcp-server.ts           # Main MCP server entry point
src/mcp/
  schemas.ts                # Zod validation schemas for all tool inputs
  handlers/
    index.ts                # Handler exports
    search.ts               # search_code, search_code_with_chunks, get_code_chunk
    project.ts              # index_project, update_project, get_project_stats
    context.ts              # use_context_pack
    synthesis.ts            # ask_codebase
  tools/
    ask-codebase.ts         # Alternative ask_codebase implementation
    use-context-pack.ts     # Alternative use_context_pack implementation
```

### Request Flow

1. Client sends `CallToolRequest` via stdio
2. Server validates input using Zod schemas
3. Handler executes the requested operation
4. Response returned as MCP `content` array with `type: 'text'`

### Logging

Logger is set to `SILENT` mode during MCP operation to prevent stdout corruption. All errors and debug information flow through structured MCP responses.

---

## Quick Start

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "codevault": {
      "command": "npx",
      "args": ["-y", "codevault", "mcp"],
      "env": {
        "CODEVAULT_EMBEDDING_API_KEY": "your-api-key",
        "CODEVAULT_EMBEDDING_BASE_URL": "https://api.studio.nebius.com/v1",
        "CODEVAULT_EMBEDDING_MODEL": "Qwen/Qwen3-Embedding-8B",
        "CODEVAULT_EMBEDDING_DIMENSIONS": "4096",
        "CODEVAULT_CHAT_API_KEY": "your-chat-api-key",
        "CODEVAULT_CHAT_BASE_URL": "https://openrouter.ai/api/v1",
        "CODEVAULT_CHAT_MODEL": "anthropic/claude-sonnet-4.5"
      }
    }
  }
}
```

### Startup

The server writes a startup message to stderr:

```
CodeVault MCP Server v1.8.5 started
```

---

## Available Tools

### search_code

Search code semantically using vector embeddings. Returns metadata about matching code chunks without full source code.

#### Input Schema

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | - | Search query (1-1000 chars) |
| `limit` | number | No | 50 | Maximum results (1-200) |
| `provider` | string | No | "auto" | Embedding provider: "auto" or "openai" |
| `path` | string | No | "." | Project root directory |
| `path_glob` | string/array | No | - | File patterns to filter (e.g., "*.ts", ["src/**/*.js"]) |
| `tags` | string/array | No | - | Tags to filter results |
| `lang` | string/array | No | - | Languages to filter (e.g., "typescript", ["python", "go"]) |
| `reranker` | string | No | "off" | Reranking mode: "off" or "api" |
| `hybrid` | string | No | "on" | Enable hybrid search: "on" or "off" |
| `bm25` | string | No | "on" | Enable BM25 keyword search: "on" or "off" |
| `symbol_boost` | string | No | "on" | Enable symbol-aware ranking: "on" or "off" |

#### Response Format

**Success:**
```
Found 15 results for: "authentication function"
Provider: openai

1. src/auth/login.ts
   Symbol: authenticateUser (typescript)
   Similarity: 0.892
   SHA: abc123def456...

2. src/auth/session.ts
   Symbol: validateSession (typescript)
   Similarity: 0.847
   SHA: 789xyz...
```

**Database Not Found:**
```
Project not indexed!

Database not found: /path/to/project/.codevault/codevault.db

Use index_project tool
```

---

### search_code_with_chunks

Search code and return full code chunks inline. Limited to 50 results maximum to prevent response overflow.

#### Input Schema

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | - | Search query (1-1000 chars) |
| `limit` | number | No | 10 | Maximum results (1-50) |
| `provider` | string | No | "auto" | Embedding provider |
| `path` | string | No | "." | Project root directory |
| `path_glob` | string/array | No | - | File patterns to filter |
| `tags` | string/array | No | - | Tags to filter |
| `lang` | string/array | No | - | Languages to filter |
| `reranker` | string | No | "off" | Reranking mode |
| `hybrid` | string | No | "on" | Enable hybrid search |
| `bm25` | string | No | "on" | Enable BM25 |
| `symbol_boost` | string | No | "on" | Enable symbol boost |

#### Response Format

```
Found 5 results with code

1. src/auth/login.ts
   Symbol: authenticateUser (typescript)
   Similarity: 0.892
   SHA: abc123...

--------------------------------------------------------------------------------
export async function authenticateUser(
  username: string,
  password: string
): Promise<AuthResult> {
  // ... code content ...
}
--------------------------------------------------------------------------------
```

**Truncation Warning:** Chunks exceeding 100,000 characters are truncated with a warning indicator.

---

### get_code_chunk

Retrieve a specific code chunk by its SHA identifier.

#### Input Schema

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `sha` | string | Yes | - | SHA identifier of the code chunk (1-64 chars) |
| `path` | string | No | "." | Project root directory |

#### Response Format

**Success:** Returns the raw code content.

**Truncated (>100KB):**
```
CODE CHUNK TOO LARGE - TRUNCATED

SHA: abc123def456...
Full size: 150000 characters

[code content up to 100000 chars]

[TRUNCATED]
```

**Error:**
```
Error: Chunk not found
```

---

### index_project

Index a project for semantic search. Creates the `.codevault/` directory with the SQLite database and chunk storage.

#### Input Schema

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `path` | string | No | "." | Project root directory |
| `provider` | string | No | "auto" | Embedding provider |

#### Response Format

**Success:**
```
Project indexed successfully!

Statistics:
- Processed chunks: 1547
- Total chunks: 1547
- Provider: openai

Ready to use:
- Quick search: search_code { query, path: "/path/to/project" }
- With code: search_code_with_chunks { query, path: "/path/to/project" }
- Get chunk by SHA: get_code_chunk { sha, path: "/path/to/project" }
- Refresh index: update_project { path: "/path/to/project" }
- Stats overview: get_project_stats { path: "/path/to/project" }
- Ask Q&A: ask_codebase { question, path: "/path/to/project" }
- Context packs: use_context_pack { name, path: "/path/to/project" }
```

**Error:**
```
Indexing failed: [error message]
```

---

### update_project

Incrementally update an existing project index. Uses Merkle tree comparison to detect changed files.

#### Input Schema

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `path` | string | No | "." | Project root directory |
| `provider` | string | No | "auto" | Embedding provider |

#### Response Format

```
Project updated!
Processed: 47 chunks
Total: 1594 chunks
```

---

### get_project_stats

Get project indexing statistics and an overview of main functions.

#### Input Schema

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `path` | string | No | "." | Project root directory |

#### Response Format

```
Project overview (50 main functions):

- src/core/IndexerEngine.ts :: runIndexer (typescript)
- src/core/SearchService.ts :: searchCode (typescript)
- src/mcp-server.ts :: McpServer (typescript)
...
```

**Empty Project:**
```
Project not indexed or empty
```

---

### use_context_pack

Activate a context pack to scope all subsequent searches within the session. Context packs are pre-saved search configurations stored in `.codevault/context-packs/`.

#### Input Schema

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `name` | string | Yes | - | Context pack name, or "clear"/"none"/"default" to reset |
| `path` | string | No | "." | Project root directory |

#### Special Values

- `"clear"` - Clear the active context pack
- `"none"` - Clear the active context pack
- `"default"` - Clear the active context pack

#### Response Format

**Activation:**
```
Context pack "stripe-backend" activated for session

Scope: {
  "path_glob": ["src/payments/**/*.ts"],
  "tags": ["stripe", "billing"],
  "lang": ["typescript"]
}
```

**Clear:**
```
Cleared active context pack for this session
```

---

### ask_codebase

Ask a natural language question about the codebase and receive an LLM-synthesized answer with code citations.

#### Input Schema

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `question` | string | Yes | - | Natural language question (1-2000 chars) |
| `provider` | string | No | "auto" | Embedding provider |
| `chat_provider` | string | No | "auto" | Chat LLM provider |
| `path` | string | No | "." | Project root directory |
| `max_chunks` | number | No | 10 | Maximum code chunks to analyze (1-50) |
| `path_glob` | string/array | No | - | File patterns to filter |
| `tags` | string/array | No | - | Tags to filter |
| `lang` | string/array | No | - | Languages to filter |
| `reranker` | string | No | "on" | Use API reranking: "on" or "off" |
| `multi_query` | boolean | No | false | Break complex questions into sub-queries |
| `temperature` | number | No | 0.7 | LLM temperature (0-2) |

#### Response Format

Returns a formatted markdown response including:

1. The synthesized answer with inline code citations
2. Referenced file paths
3. Metadata (chunks analyzed, providers used, queries if multi_query enabled)

**No Results:**
```
No relevant code found for: "your question"

Suggestions:
- Try broader search terms
- Check if the project is indexed
- Verify file filters aren't too restrictive
```

---

## Error Handling

The MCP server returns structured error responses for all failure cases.

### Error Response Format

```json
{
  "code": "VALIDATION_ERROR",
  "type": "validation",
  "message": "Invalid input parameters",
  "details": {
    "issues": [
      { "path": ["query"], "message": "Query cannot be empty" }
    ]
  },
  "suggestion": "Check parameter types and required fields"
}
```

### Error Types

| Type | Code | Description |
|------|------|-------------|
| `validation` | `VALIDATION_ERROR` | Invalid input parameters (Zod validation failed) |
| `validation` | `PATH_VALIDATION_FAILED` | Requested path outside project root |
| `configuration` | `ENCRYPTION_KEY_REQUIRED` | Missing encryption key for encrypted chunks |
| `permission` | `ENCRYPTION_AUTH_FAILED` | Invalid encryption key or corrupted data |
| `runtime` | `RUNTIME_ERROR` | General execution error |

### Debug Mode

Set `CODEVAULT_MCP_DEBUG=true` to include stack traces in error responses.

---

## Session State

### Context Pack Persistence

The MCP server maintains session state for context packs. Once activated via `use_context_pack`, the scope filters apply to all subsequent `search_code`, `search_code_with_chunks`, and `ask_codebase` calls within the same session.

**Note:** Session state is cleared when the MCP server process terminates.

### Cache Management

The server performs automatic cache cleanup at configurable intervals (default: 1 hour):

- BM25 index cache (max 10 indices)
- Chunk text cache (max 1000 items)
- Token counting cache

Environment variable: `CODEVAULT_CACHE_CLEAR_INTERVAL` (milliseconds)

---

## Configuration

### Environment Variables

All configuration is done via environment variables for MCP deployments:

#### Embedding Provider

| Variable | Description |
|----------|-------------|
| `CODEVAULT_EMBEDDING_API_KEY` | API key for embedding provider |
| `CODEVAULT_EMBEDDING_BASE_URL` | Base URL (e.g., https://api.studio.nebius.com/v1) |
| `CODEVAULT_EMBEDDING_MODEL` | Model name (e.g., Qwen/Qwen3-Embedding-8B) |
| `CODEVAULT_EMBEDDING_DIMENSIONS` | Embedding dimensions (e.g., 4096) |
| `CODEVAULT_EMBEDDING_MAX_TOKENS` | Maximum input tokens |

#### Chat LLM Provider

| Variable | Description |
|----------|-------------|
| `CODEVAULT_CHAT_API_KEY` | API key for chat provider |
| `CODEVAULT_CHAT_BASE_URL` | Base URL (e.g., https://openrouter.ai/api/v1) |
| `CODEVAULT_CHAT_MODEL` | Model name (e.g., anthropic/claude-sonnet-4.5) |

#### Reranking

| Variable | Description |
|----------|-------------|
| `CODEVAULT_RERANK_API_URL` | Reranking API endpoint |
| `CODEVAULT_RERANK_API_KEY` | Reranking API key |
| `CODEVAULT_RERANK_MODEL` | Reranking model |

#### Encryption

| Variable | Description |
|----------|-------------|
| `CODEVAULT_ENCRYPTION_KEY` | 32-byte base64 key for AES-256-GCM encryption |

#### Cache Tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `CODEVAULT_MAX_BM25_CACHE` | 10 | Max BM25 indices to cache |
| `CODEVAULT_MAX_CHUNK_CACHE` | 1000 | Max code chunks to cache |
| `CODEVAULT_CACHE_CLEAR_INTERVAL` | 3600000 | Cache cleanup interval (ms) |

---

## Performance Considerations

### Search Limits

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_SEARCH_LIMIT` | 200 | Maximum results for search_code |
| `MAX_CHUNK_SIZE` | 100,000 | Characters before truncation |
| `RERANKER_MAX_CANDIDATES` | 50 | Candidates sent to reranking API |

### Hybrid Search Weights

Default configuration:
- Vector similarity: 70%
- BM25 keyword matching: 30%
- Reciprocal Rank Fusion constant (k): 60

### Symbol Boost Limits

| Constant | Value | Description |
|----------|-------|-------------|
| `SIGNATURE_MATCH_BOOST` | 0.30 | Boost for function signature matches |
| `NEIGHBOR_MATCH_BOOST` | 0.15 | Boost for related function matches |
| `MAX_SYMBOL_BOOST` | 0.45 | Maximum total symbol boost |

### Batch Processing

- Default batch size: 100 chunks per embedding API call
- Maximum batch tokens: 100,000
- Maximum item tokens: 8,191
- Retry attempts: 3 with exponential backoff

---

## Path Aliases

All path-accepting tools support multiple parameter names for flexibility:

- `path` - Primary path parameter
- `project` - Alias for path
- `directory` - Alias for path

The server uses the first non-empty value in priority order: `path` > `project` > `directory` > "."

---

## Shutdown Handling

The server implements graceful shutdown:

1. Clears cache cleanup timer
2. Resets session context pack
3. Clears search and token caches
4. Closes MCP server connection
5. Exits process

Signals handled: `SIGINT`, `SIGTERM`

---

## Version Information

- **Document Version**: 1.8.5
- **MCP SDK**: @modelcontextprotocol/sdk ^1.20.2
- **Node.js Requirement**: >=18.0.0

---

## Related Documentation

- [Configuration Guide](CONFIGURATION.md) - Complete configuration options
- [MCP Setup Guide](MCP_SETUP.md) - Claude Desktop integration
- [Ask Feature Guide](ASK_FEATURE.md) - LLM-synthesized Q&A details
- [CLI Reference](CLI_REFERENCE.md) - All CLI commands and options
