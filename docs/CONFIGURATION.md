# CodeVault Configuration Reference

**Version**: 1.8.5

This document describes the complete configuration system for CodeVault, including all configuration sources, options, and their precedence.

## Table of Contents

- [Configuration Hierarchy](#configuration-hierarchy)
- [Configuration Sources](#configuration-sources)
  - [Environment Variables](#environment-variables)
  - [Project Configuration](#project-configuration)
  - [Global Configuration](#global-configuration)
- [Configuration Options](#configuration-options)
  - [Embedding Provider](#embedding-provider)
  - [Chat LLM](#chat-llm)
  - [Rate Limiting](#rate-limiting)
  - [Encryption](#encryption)
  - [Reranker](#reranker)
  - [Provider Routing](#provider-routing)
- [System Constants](#system-constants)
- [Examples](#examples)

---

## Configuration Hierarchy

CodeVault uses a layered configuration system with the following priority (highest to lowest):

1. **Environment Variables** (highest priority)
2. **Project Configuration** (`.codevault/config.json` in project root)
3. **Global Configuration** (`~/.codevault/config.json`)
4. **Defaults** (lowest priority)

Later configurations override earlier ones. For nested objects, properties are merged rather than replaced entirely.

---

## Configuration Sources

### Environment Variables

Environment variables take the highest priority and override all file-based configurations. CodeVault supports both new prefixed variables and legacy OpenAI-compatible variables for backward compatibility.

#### Embedding Provider

| Variable | Description | Legacy Fallback |
|----------|-------------|-----------------|
| `CODEVAULT_EMBEDDING_API_KEY` | API key for embedding provider | `OPENAI_API_KEY` |
| `CODEVAULT_EMBEDDING_BASE_URL` | Base URL for embedding API | `OPENAI_BASE_URL` |
| `CODEVAULT_EMBEDDING_MODEL` | Embedding model name | `CODEVAULT_OPENAI_EMBEDDING_MODEL`, `OPENAI_MODEL` |
| `CODEVAULT_EMBEDDING_DIMENSIONS` | Vector dimensions | `CODEVAULT_DIMENSIONS` |
| `CODEVAULT_EMBEDDING_MAX_TOKENS` | Maximum tokens per chunk | `CODEVAULT_MAX_TOKENS` |

#### Rate Limiting

| Variable | Description | Legacy Fallback |
|----------|-------------|-----------------|
| `CODEVAULT_EMBEDDING_RATE_LIMIT_RPM` | Requests per minute | `CODEVAULT_RATE_LIMIT_RPM`, `CODEVAULT_RATE_LIMIT` |
| `CODEVAULT_EMBEDDING_RATE_LIMIT_TPM` | Tokens per minute | `CODEVAULT_RATE_LIMIT_TPM` |

#### Chat LLM

| Variable | Description | Legacy Fallback |
|----------|-------------|-----------------|
| `CODEVAULT_CHAT_API_KEY` | API key for chat LLM | `OPENAI_API_KEY` |
| `CODEVAULT_CHAT_BASE_URL` | Base URL for chat API | `OPENAI_BASE_URL` |
| `CODEVAULT_CHAT_MODEL` | Chat model name | `CODEVAULT_OPENAI_CHAT_MODEL` |
| `CODEVAULT_CHAT_MAX_TOKENS` | Maximum response tokens (capped at 256,000) | - |
| `CODEVAULT_CHAT_TEMPERATURE` | Sampling temperature (0.0-2.0) | - |

#### Encryption

| Variable | Description |
|----------|-------------|
| `CODEVAULT_ENCRYPTION_KEY` | 32-byte encryption key for chunk storage |

#### Reranker

| Variable | Description |
|----------|-------------|
| `CODEVAULT_RERANK_API_URL` | Reranker API endpoint (Cohere, Jina, Novita) |
| `CODEVAULT_RERANK_API_KEY` | Reranker API key |
| `CODEVAULT_RERANK_MODEL` | Reranker model name |

#### System Tuning (Advanced)

| Variable | Default | Description |
|----------|---------|-------------|
| `CODEVAULT_MAX_BM25_CACHE` | `10` | Maximum BM25 indices to cache |
| `CODEVAULT_MAX_CHUNK_CACHE` | `1000` | Maximum chunks in memory cache |
| `CODEVAULT_CACHE_CLEAR_INTERVAL` | `3600000` | Cache cleanup interval (ms) |
| `CODEVAULT_INDEXING_CONCURRENCY` | `200` | Parallel file processing |
| `CODEVAULT_MAX_INDEXING_CONCURRENCY` | `1000` | Maximum concurrency cap |
| `CODEVAULT_RERANKER_MAX` | `50` | Max candidates for reranking |
| `CODEVAULT_BM25_PREFILTER_LIMIT` | `500` | BM25 prefilter candidates |

---

### Project Configuration

Project-specific configuration is stored in `.codevault/config.json` relative to the project root. This allows different projects to use different providers, models, or settings.

**Location**: `<project-root>/.codevault/config.json`

```json
{
  "defaultProvider": "openai",
  "providers": {
    "openai": {
      "apiKey": "sk-...",
      "baseUrl": "https://api.openai.com/v1",
      "model": "text-embedding-3-small",
      "dimensions": 1536
    }
  },
  "chatLLM": {
    "openai": {
      "apiKey": "sk-...",
      "baseUrl": "https://api.openai.com/v1",
      "model": "gpt-4o",
      "maxTokens": 4096,
      "temperature": 0.7
    }
  },
  "rateLimit": {
    "rpm": 500,
    "tpm": 100000
  },
  "maxTokens": 8191,
  "encryption": {
    "enabled": true,
    "key": "your-32-byte-encryption-key-here"
  },
  "reranker": {
    "apiUrl": "https://api.cohere.com/v1/rerank",
    "apiKey": "your-reranker-key",
    "model": "rerank-english-v3.0",
    "maxCandidates": 50,
    "maxTokens": 8192
  }
}
```

---

### Global Configuration

Global configuration applies to all projects and is stored in the user's home directory.

**Location**: `~/.codevault/config.json`

The file format is identical to project configuration. Global settings serve as defaults that can be overridden by project-specific settings or environment variables.

---

## Configuration Options

### Embedding Provider

Configure the embedding model used for semantic code search.

| Property | Type | Description |
|----------|------|-------------|
| `providers.openai.apiKey` | `string` | API key for OpenAI-compatible provider |
| `providers.openai.baseUrl` | `string` | API base URL (for OpenAI-compatible providers) |
| `providers.openai.model` | `string` | Model identifier (e.g., `text-embedding-3-small`) |
| `providers.openai.dimensions` | `number` | Vector dimensions (model-specific) |
| `providers.openai.routing` | `object` | Provider routing configuration (see below) |

### Chat LLM

Configure the chat model used for answer synthesis and Q&A.

| Property | Type | Description |
|----------|------|-------------|
| `chatLLM.openai.apiKey` | `string` | API key for chat provider |
| `chatLLM.openai.baseUrl` | `string` | API base URL |
| `chatLLM.openai.model` | `string` | Model identifier (e.g., `gpt-4o`) |
| `chatLLM.openai.maxTokens` | `number` | Maximum response tokens (capped at 256,000) |
| `chatLLM.openai.temperature` | `number` | Sampling temperature (0.0-2.0) |
| `chatLLM.openai.routing` | `object` | Provider routing configuration (see below) |

### Rate Limiting

Control API request rates to avoid hitting provider limits.

| Property | Type | Description |
|----------|------|-------------|
| `rateLimit.rpm` | `number` | Maximum requests per minute |
| `rateLimit.tpm` | `number` | Maximum tokens per minute |

### Encryption

Enable AES-256-GCM encryption for stored code chunks.

| Property | Type | Description |
|----------|------|-------------|
| `encryption.enabled` | `boolean` | Enable/disable encryption |
| `encryption.key` | `string` | 32-byte encryption key |

**Security Note**: The encryption key must be exactly 32 bytes. Store it securely and never commit it to version control. Use environment variables for production deployments.

### Reranker

Configure optional API-based reranking for improved search quality.

| Property | Type | Description |
|----------|------|-------------|
| `reranker.apiUrl` | `string` | Reranker API endpoint |
| `reranker.apiKey` | `string` | Reranker API key |
| `reranker.model` | `string` | Reranker model name |
| `reranker.maxCandidates` | `number` | Maximum candidates to rerank (default: 50) |
| `reranker.maxTokens` | `number` | Maximum tokens per candidate (default: 8192) |

Supported reranking providers:
- **Cohere**: `https://api.cohere.com/v1/rerank`
- **Jina**: `https://api.jina.ai/v1/rerank`
- **Novita**: `https://api.novita.ai/v1/rerank`

### Provider Routing

Advanced routing configuration for OpenRouter or similar multi-provider services.

| Property | Type | Description |
|----------|------|-------------|
| `routing.order` | `string[]` | Provider preference order |
| `routing.allow_fallbacks` | `boolean` | Allow fallback to other providers |
| `routing.require_parameters` | `boolean` | Require all parameters to be supported |
| `routing.data_collection` | `'allow' \| 'deny'` | Data collection preference |
| `routing.zdr` | `boolean` | Zero data retention mode |
| `routing.enforce_distillable_text` | `boolean` | Enforce distillable text |
| `routing.only` | `string[]` | Only use these providers |
| `routing.ignore` | `string[]` | Never use these providers |
| `routing.quantizations` | `string[]` | Allowed quantization levels |
| `routing.sort` | `'price' \| 'throughput' \| 'latency'` | Sort providers by metric |
| `routing.max_price.prompt` | `number` | Maximum price per prompt token |
| `routing.max_price.completion` | `number` | Maximum price per completion token |
| `routing.max_price.request` | `number` | Maximum price per request |
| `routing.max_price.image` | `number` | Maximum price per image |

---

## System Constants

CodeVault uses centralized constants for system tuning. These can be adjusted via environment variables.

### Parsing and Tree-sitter

| Constant | Default | Description |
|----------|---------|-------------|
| `SIZE_THRESHOLD` | 30,000 bytes | Switch to streaming parser above this size |
| `CHUNK_SIZE` | 30,000 bytes | Streaming parser chunk size |

### Cache Limits

| Constant | Default | Description |
|----------|---------|-------------|
| `MAX_BM25_CACHE_SIZE` | 10 | Maximum BM25 indices cached |
| `MAX_CHUNK_TEXT_CACHE_SIZE` | 1,000 | Maximum chunks in memory |
| `CACHE_CLEAR_INTERVAL_MS` | 3,600,000 (1 hour) | Cache cleanup interval |

### Search and Ranking

| Constant | Default | Description |
|----------|---------|-------------|
| `RERANKER_MAX_CANDIDATES` | 50 | Max reranking candidates |
| `MAX_CHUNK_SIZE` | 100,000 bytes | Maximum returnable chunk size |
| `DEFAULT_SEARCH_LIMIT` | 10 | Default result count |
| `MAX_SEARCH_LIMIT` | 200 | Maximum result count |
| `BM25_PREFILTER_LIMIT` | 500 | BM25 prefilter candidates |
| `RRF_K_CONSTANT` | 60 | Reciprocal Rank Fusion constant |

### Symbol Boosting

| Constant | Default | Description |
|----------|---------|-------------|
| `SIGNATURE_MATCH_BOOST` | 0.3 | Boost for signature matches |
| `NEIGHBOR_MATCH_BOOST` | 0.15 | Boost for neighbor matches |
| `MAX_SYMBOL_BOOST` | 0.45 | Maximum total symbol boost |
| `MIN_TOKEN_LENGTH` | 3 | Minimum token length for matching |

### Batch Processing

| Constant | Default | Description |
|----------|---------|-------------|
| `MAX_BATCH_RETRIES` | 3 | Maximum batch retry attempts |
| `MAX_BATCH_TOKENS` | 100,000 | Maximum tokens per batch |
| `MAX_ITEM_TOKENS` | 8,191 | Maximum tokens per item |
| `DEFAULT_BATCH_SIZE` | 100 | Default embedding batch size |

### Encryption

| Constant | Default | Description |
|----------|---------|-------------|
| `SALT_LENGTH` | 16 bytes | Salt length for key derivation |
| `IV_LENGTH` | 12 bytes | Initialization vector length |
| `TAG_LENGTH` | 16 bytes | Authentication tag length |
| `REQUIRED_KEY_LENGTH` | 32 bytes | Required encryption key length |

### File Watcher

| Constant | Default | Description |
|----------|---------|-------------|
| `DEFAULT_DEBOUNCE_MS` | 500 | Debounce interval for file changes |
| `MIN_DEBOUNCE_MS` | 50 | Minimum debounce interval |
| `STABILITY_THRESHOLD_MS` | 100 | File write stability threshold |

---

## Examples

### Minimal Configuration (Environment Variables)

```bash
# Embedding provider
export CODEVAULT_EMBEDDING_API_KEY="sk-..."
export CODEVAULT_EMBEDDING_MODEL="text-embedding-3-small"

# Chat LLM (for ask/chat commands)
export CODEVAULT_CHAT_API_KEY="sk-..."
export CODEVAULT_CHAT_MODEL="gpt-4o"
```

### Using OpenRouter

```json
{
  "providers": {
    "openai": {
      "apiKey": "sk-or-...",
      "baseUrl": "https://openrouter.ai/api/v1",
      "model": "openai/text-embedding-3-small",
      "dimensions": 1536,
      "routing": {
        "allow_fallbacks": true,
        "sort": "price"
      }
    }
  },
  "chatLLM": {
    "openai": {
      "apiKey": "sk-or-...",
      "baseUrl": "https://openrouter.ai/api/v1",
      "model": "anthropic/claude-3.5-sonnet",
      "routing": {
        "allow_fallbacks": false,
        "data_collection": "deny"
      }
    }
  }
}
```

### Production Configuration with Encryption

```json
{
  "providers": {
    "openai": {
      "model": "text-embedding-3-large",
      "dimensions": 3072
    }
  },
  "chatLLM": {
    "openai": {
      "model": "gpt-4o",
      "maxTokens": 8192,
      "temperature": 0.3
    }
  },
  "rateLimit": {
    "rpm": 1000,
    "tpm": 500000
  },
  "maxTokens": 8191,
  "encryption": {
    "enabled": true
  },
  "reranker": {
    "apiUrl": "https://api.cohere.com/v1/rerank",
    "model": "rerank-english-v3.0",
    "maxCandidates": 50
  }
}
```

For production, set sensitive values via environment variables:

```bash
export CODEVAULT_EMBEDDING_API_KEY="sk-..."
export CODEVAULT_CHAT_API_KEY="sk-..."
export CODEVAULT_ENCRYPTION_KEY="your-32-byte-key"
export CODEVAULT_RERANK_API_KEY="your-reranker-key"
```

### Local Development with Rate Limiting

```json
{
  "providers": {
    "openai": {
      "model": "text-embedding-3-small",
      "dimensions": 1536
    }
  },
  "rateLimit": {
    "rpm": 60,
    "tpm": 10000
  },
  "maxTokens": 8191
}
```

---

## CLI Configuration Commands

CodeVault provides CLI commands for managing configuration:

```bash
# Show effective configuration
codevault config show

# Get a specific value
codevault config get providers.openai.model

# Set a value (project config)
codevault config set providers.openai.model text-embedding-3-large

# Set a value (global config)
codevault config set --global providers.openai.apiKey sk-...

# Interactive configuration builder
codevault config init
```

---

## Troubleshooting

### Configuration Not Applied

1. Check priority order: environment variables override file configs
2. Verify file syntax: use `codevault config show` to see effective config
3. Check file paths: project config must be in `.codevault/config.json`

### Dimension Mismatch Warning

If you see "Dimension mismatch detected", your database was indexed with a different embedding dimension. Options:
1. Re-index with the new model: `codevault index --force`
2. Switch back to the original model

### Rate Limit Errors

If you encounter 429 errors:
1. Lower `rateLimit.rpm` and `rateLimit.tpm` values
2. CodeVault implements exponential backoff (up to 3 retries)
3. Check your provider's actual rate limits

### Encryption Key Errors

- Encryption key must be exactly 32 bytes
- Once enabled, the same key must be used for all operations
- Lost keys cannot be recovered; re-indexing is required
