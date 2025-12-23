# API Providers

> Version 1.8.5 | CodeVault Provider Documentation

This document covers the embedding and chat LLM provider systems in CodeVault, including configuration, model profiles, rate limiting, and integration patterns.

## Table of Contents

- [Overview](#overview)
- [Embedding Providers](#embedding-providers)
  - [EmbeddingProvider Base Class](#embeddingprovider-base-class)
  - [OpenAIProvider](#openaiprovider)
  - [MockEmbeddingProvider](#mockembeddingprovider)
  - [Provider Factory](#provider-factory)
- [Chat LLM Providers](#chat-llm-providers)
  - [ChatLLMProvider Base Class](#chatllmprovider-base-class)
  - [OpenAIChatProvider](#openaichatprovider)
  - [Chat Provider Factory](#chat-provider-factory)
- [Model Profiles](#model-profiles)
  - [Supported Models](#supported-models)
  - [Profile Properties](#profile-properties)
  - [Environment Overrides](#environment-overrides)
- [Token Counting](#token-counting)
- [Rate Limiting](#rate-limiting)
  - [Default Limits](#default-limits)
  - [Configuration](#rate-limit-configuration)
  - [Retry Behavior](#retry-behavior)
- [Configuration Reference](#configuration-reference)
  - [Environment Variables](#environment-variables)
  - [Config File Options](#config-file-options)
  - [Provider Routing (OpenRouter)](#provider-routing-openrouter)
- [Usage Examples](#usage-examples)

---

## Overview

CodeVault uses a provider abstraction layer to support multiple embedding and chat LLM backends. The system is designed around:

- **Pluggable providers**: Swap between OpenAI, Ollama, Nebius, OpenRouter, or custom endpoints
- **Batch processing**: Efficient API usage with automatic batching and token management
- **Rate limiting**: Built-in RPM/TPM throttling with exponential backoff retry
- **Model profiles**: Pre-configured settings for optimal chunking and embedding generation

**Source files:**
- `/src/providers/base.ts` - Base classes and model profiles
- `/src/providers/openai.ts` - OpenAI-compatible embedding provider
- `/src/providers/mock.ts` - Deterministic mock provider for testing
- `/src/providers/chat-llm.ts` - Chat completion provider
- `/src/providers/token-counter.ts` - Token counting utilities
- `/src/providers/index.ts` - Factory functions and exports

---

## Embedding Providers

### EmbeddingProvider Base Class

The abstract base class that all embedding providers must implement.

**Location:** `/src/providers/base.ts`

```typescript
abstract class EmbeddingProvider {
  // Required: Generate embedding for single text
  abstract generateEmbedding(text: string): Promise<number[]>;

  // Required: Return embedding dimensions
  abstract getDimensions(): number;

  // Required: Return provider name (e.g., 'OpenAI')
  abstract getName(): string;

  // Optional: Return model name
  abstract getModelName?(): string;

  // Optional: Initialize provider (lazy loading)
  abstract init?(): Promise<void>;

  // Optional: Batch processing (default: sequential)
  async generateEmbeddings(texts: string[]): Promise<number[][]>;

  // Optional: Rate limiter instance
  rateLimiter?: RateLimiter;
}
```

**Default batch behavior:** The base class provides a default `generateEmbeddings()` implementation that processes texts sequentially. Providers should override this for true batch support.

### OpenAIProvider

The primary embedding provider supporting OpenAI API and compatible endpoints (Ollama, Nebius, OpenRouter).

**Location:** `/src/providers/openai.ts`

**Constructor options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | `CODEVAULT_EMBEDDING_API_KEY` or `OPENAI_API_KEY` | API authentication key |
| `baseUrl` | `string` | `CODEVAULT_EMBEDDING_BASE_URL` or `OPENAI_BASE_URL` | API base URL |
| `model` | `string` | `text-embedding-3-large` | Embedding model name |
| `dimensions` | `number` | Model-specific | Override output dimensions |
| `rpm` | `number` | Provider default | Requests per minute limit |
| `tpm` | `number` | Provider default | Tokens per minute limit |
| `routing` | `ProviderRoutingConfig` | `undefined` | OpenRouter provider routing |

**Initialization:**
- Uses lazy initialization via `init()` method
- Creates OpenAI client with 60-second timeout
- Retries are handled externally by batch-indexer (not by the OpenAI SDK)

**Single embedding generation:**
```typescript
const provider = new OpenAIProvider({
  apiKey: 'your-api-key',
  model: 'text-embedding-3-large'
});

await provider.init();
const embedding = await provider.generateEmbedding('function authenticate(user) { ... }');
// Returns: number[] of length 3072 (for text-embedding-3-large)
```

**Batch embedding generation:**

The provider implements efficient batching with the following constraints:
- Texts are truncated to `maxChunkChars` from the model profile
- Items exceeding `maxItemTokens` throw an error (no zero-vector pollution)
- Batches are built until `MAX_BATCH_TOKENS` (100,000) is reached
- Each batch is a single API call

```typescript
const embeddings = await provider.generateEmbeddings([
  'function foo() { return 1; }',
  'class User { constructor(name) { this.name = name; } }',
  'const API_URL = "https://api.example.com";'
]);
// Returns: number[][] with one embedding per input text
```

**Error handling:**
- Throws if text exceeds model's maximum token limit
- Validates response structure (data array, embedding arrays)
- Checks embedding count matches input count

**Dimension detection:**
1. Uses explicit `dimensions` option if provided
2. Checks `CODEVAULT_EMBEDDING_DIMENSIONS` or `CODEVAULT_DIMENSIONS` env vars
3. Infers from model name (`3-small` = 1536, `3-large` = 3072)
4. Falls back to 1536

### MockEmbeddingProvider

A deterministic mock provider for integration tests that generates embeddings without API calls.

**Location:** `/src/providers/mock.ts`

**Constructor:**
```typescript
const mockProvider = new MockEmbeddingProvider(dimensions = 32);
```

**Behavior:**
- Generates SHA-256 hash of input text
- Creates normalized vector from hash bytes
- Same input always produces same output (deterministic)
- No network calls or rate limiting

**Use cases:**
- Integration tests
- Development without API keys
- CI/CD pipelines

### Provider Factory

The `createEmbeddingProvider()` factory function creates the appropriate provider instance.

**Location:** `/src/providers/index.ts`

```typescript
function createEmbeddingProvider(
  providerName = 'auto',
  options: EmbeddingOptions = {}
): EmbeddingProvider
```

**Provider selection:**

| Provider Name | Provider Class | Description |
|---------------|----------------|-------------|
| `auto` | `OpenAIProvider` | Default, uses OpenAI-compatible API |
| `openai` | `OpenAIProvider` | Explicit OpenAI selection |
| `mock` | `MockEmbeddingProvider` | Mock provider for testing |
| `test` | `MockEmbeddingProvider` | Alias for mock |

---

## Chat LLM Providers

### ChatLLMProvider Base Class

Abstract base class for chat completion providers.

**Location:** `/src/providers/chat-llm.ts`

```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionOptions {
  temperature?: number;  // Default: 0.7
  maxTokens?: number;    // Default: 256000
  stream?: boolean;      // Enable streaming
}

abstract class ChatLLMProvider {
  abstract generateCompletion(
    messages: ChatMessage[],
    options?: ChatCompletionOptions
  ): Promise<string>;

  abstract generateStreamingCompletion(
    messages: ChatMessage[],
    options?: ChatCompletionOptions
  ): AsyncGenerator<string>;

  abstract getName(): string;
  abstract getModelName?(): string;
  abstract init?(): Promise<void>;

  rateLimiter?: RateLimiter;
}
```

### OpenAIChatProvider

Chat completion provider supporting OpenAI API and compatible endpoints.

**Location:** `/src/providers/chat-llm.ts`

**Constructor options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | `CODEVAULT_CHAT_API_KEY` or `OPENAI_API_KEY` | API authentication key |
| `baseUrl` | `string` | `CODEVAULT_CHAT_BASE_URL` or `OPENAI_BASE_URL` | API base URL |
| `model` | `string` | `gpt-4o` | Chat model name |
| `maxTokens` | `number` | 256000 | Maximum output tokens |
| `temperature` | `number` | 0.7 | Sampling temperature |
| `routing` | `ProviderRoutingConfig` | `undefined` | OpenRouter provider routing |

**Initialization:**
- Uses lazy initialization via `init()` method
- Creates OpenAI client with 120-second timeout (longer for chat responses)
- Uses 'OpenAI' rate limiter profile (50 RPM default)

**Non-streaming completion:**
```typescript
const chatProvider = new OpenAIChatProvider({
  apiKey: 'your-api-key',
  model: 'gpt-4o'
});

const response = await chatProvider.generateCompletion([
  { role: 'system', content: 'You are a helpful code assistant.' },
  { role: 'user', content: 'Explain this function: function add(a, b) { return a + b; }' }
]);
```

**Streaming completion:**
```typescript
const stream = chatProvider.generateStreamingCompletion([
  { role: 'user', content: 'How does authentication work?' }
]);

for await (const chunk of stream) {
  process.stdout.write(chunk);
}
```

### Chat Provider Factory

```typescript
function createChatLLMProvider(
  providerName = 'auto',
  options: ChatOptions = {}
): ChatLLMProvider
```

Currently only supports OpenAI-compatible providers (`auto`, `openai`).

---

## Model Profiles

Model profiles define token limits, chunk sizes, and embedding dimensions for different embedding models.

**Location:** `/src/providers/base.ts`

### Supported Models

| Model | Max Tokens | Optimal Tokens | Dimensions | Tokenizer |
|-------|------------|----------------|------------|-----------|
| `text-embedding-3-large` | 8191 | 4000 | 3072 | tiktoken (cl100k_base) |
| `text-embedding-3-small` | 8191 | 4000 | 1536 | tiktoken (cl100k_base) |
| `text-embedding-ada-002` | 8191 | 4000 | 1536 | tiktoken (cl100k_base) |
| `nomic-embed-text` | 8192 | 4000 | 768 | tiktoken (cl100k_base) |
| `Qwen/Qwen3-Embedding-8B` | 32000 | 16000 | 4096 | tiktoken (cl100k_base) |
| `qwen3-embedding:0.6b` | 32000 | 26000 | 1024 | tiktoken (cl100k_base) |
| `gemini-embedding-001` | 2048 | 1600 | 768 | tiktoken (cl100k_base) |
| `google/gemini-embedding-001` | 2048 | 1600 | 768 | tiktoken (cl100k_base) |
| `default` | 512 | 400 | 384 | Character estimation |

### Profile Properties

```typescript
interface ModelProfile {
  // Token-based limits
  maxTokens: number;         // Absolute maximum tokens per chunk
  optimalTokens: number;     // Target tokens for best quality
  minChunkTokens: number;    // Minimum tokens (skip smaller chunks)
  maxChunkTokens: number;    // Maximum tokens per chunk
  overlapTokens: number;     // Overlap between chunks

  // Character-based limits (fallback when tokens unavailable)
  optimalChars: number;
  minChunkChars: number;
  maxChunkChars: number;
  overlapChars: number;

  // Model configuration
  dimensions: number;        // Output embedding dimensions
  useTokens: boolean;        // Use token counting (vs characters)
  tokenizerType: string;     // 'tiktoken' or 'estimate'
  encoding?: string;         // Tiktoken encoding name

  // Runtime
  tokenCounter?: (text: string) => number | Promise<number>;
}
```

### Environment Overrides

Model profiles can be customized via environment variables:

| Variable | Effect |
|----------|--------|
| `CODEVAULT_EMBEDDING_MAX_TOKENS` | Overrides `maxTokens` and scales related limits |
| `CODEVAULT_MAX_TOKENS` | Alias for above |
| `CODEVAULT_EMBEDDING_DIMENSIONS` | Overrides `dimensions` |
| `CODEVAULT_DIMENSIONS` | Alias for above |

**Scaling behavior:** When `maxTokens` is overridden, related limits are scaled proportionally:
- `optimalTokens` = 82% of new maxTokens
- `maxChunkTokens` = 95% of new maxTokens
- `minChunkTokens` and `overlapTokens` are scaled by ratio

---

## Token Counting

Accurate token counting is essential for staying within model limits.

**Location:** `/src/providers/token-counter.ts`

**Tiktoken integration:**
- Uses `tiktoken` library for OpenAI models
- Falls back to character estimation (4 chars per token) when unavailable
- Caches encoder instance for performance

```typescript
async function getTokenCounter(
  modelName: string
): Promise<((text: string) => number) | null>
```

**Model detection:**
- Models containing `text-embedding` or `ada-002` use tiktoken
- Other models use character estimation (text.length / 4)

**Character estimation:**
Used when tiktoken is unavailable or for unknown models:
```typescript
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

---

## Rate Limiting

Built-in rate limiting prevents API throttling errors.

**Location:** `/src/utils/rate-limiter.ts`

### Default Limits

| Provider | RPM | TPM |
|----------|-----|-----|
| OpenAI | 50 | null |
| Qwen | 10000 | 600000 |
| Other | null (no limit) | null (no limit) |

### Rate Limit Configuration

**Environment variables:**
```bash
# Requests per minute
CODEVAULT_EMBEDDING_RATE_LIMIT_RPM=100
CODEVAULT_RATE_LIMIT_RPM=100
CODEVAULT_RATE_LIMIT=100  # Legacy

# Tokens per minute
CODEVAULT_EMBEDDING_RATE_LIMIT_TPM=100000
CODEVAULT_RATE_LIMIT_TPM=100000
```

**Config file:**
```json
{
  "rateLimit": {
    "rpm": 100,
    "tpm": 100000
  }
}
```

**Programmatic:**
```typescript
const limiter = new RateLimiter(
  100,    // requestsPerMinute
  10000,  // tokensPerMinute
  10000   // maxQueueSize (default: 10000)
);
```

### Retry Behavior

When rate limits are hit (HTTP 429 or error message contains "rate limit"):

1. Exponential backoff with delays: 1s, 2s, 5s, 10s
2. Maximum 4 retries
3. Request is re-queued after delay
4. Queue size is capped at 10,000 to prevent memory exhaustion

**Detection:**
```typescript
// Rate limit error detection
status === 429 ||
message.includes('429') ||
message.includes('rate limit') ||
message.includes('too many requests')
```

**Queue overflow:**
If the queue reaches capacity, new requests are rejected with:
```
Error: Rate limiter queue is full (10000 items). Too many concurrent requests.
```

---

## Configuration Reference

### Environment Variables

#### Embedding Provider

| Variable | Description | Default |
|----------|-------------|---------|
| `CODEVAULT_EMBEDDING_API_KEY` | API key for embedding provider | - |
| `OPENAI_API_KEY` | Fallback API key | - |
| `CODEVAULT_EMBEDDING_BASE_URL` | API base URL | OpenAI default |
| `OPENAI_BASE_URL` | Fallback base URL | - |
| `CODEVAULT_EMBEDDING_MODEL` | Embedding model name | `text-embedding-3-large` |
| `CODEVAULT_OPENAI_EMBEDDING_MODEL` | Legacy model name (deprecated) | - |
| `OPENAI_MODEL` | Legacy model name (deprecated) | - |
| `CODEVAULT_EMBEDDING_DIMENSIONS` | Override dimensions | Model default |
| `CODEVAULT_EMBEDDING_MAX_TOKENS` | Override max tokens | Model default |

#### Chat Provider

| Variable | Description | Default |
|----------|-------------|---------|
| `CODEVAULT_CHAT_API_KEY` | API key for chat provider | - |
| `CODEVAULT_CHAT_BASE_URL` | API base URL | OpenAI default |
| `CODEVAULT_CHAT_MODEL` | Chat model name | `gpt-4o` |
| `CODEVAULT_OPENAI_CHAT_MODEL` | Legacy model name (deprecated) | - |
| `CODEVAULT_CHAT_TEMPERATURE` | Sampling temperature | `0.7` |
| `CODEVAULT_CHAT_MAX_TOKENS` | Max output tokens | `256000` |

#### Rate Limiting

| Variable | Description | Default |
|----------|-------------|---------|
| `CODEVAULT_EMBEDDING_RATE_LIMIT_RPM` | Requests per minute | Provider default |
| `CODEVAULT_RATE_LIMIT_RPM` | Fallback RPM | - |
| `CODEVAULT_RATE_LIMIT` | Legacy RPM | - |
| `CODEVAULT_EMBEDDING_RATE_LIMIT_TPM` | Tokens per minute | Provider default |
| `CODEVAULT_RATE_LIMIT_TPM` | Fallback TPM | - |

#### Miscellaneous

| Variable | Description | Default |
|----------|-------------|---------|
| `BATCH_SIZE` | Chunks per embedding batch | `100` |
| `CODEVAULT_BATCH_SIZE` | Alias for BATCH_SIZE | `100` |
| `CODEVAULT_QUIET` | Suppress warnings | `false` |
| `CODEVAULT_LOG_LEVEL` | Log level (debug for verbose) | - |

### Config File Options

Configuration can be set in `~/.codevault/config.json` (global) or `codevault.config.json` (project).

```json
{
  "providers": {
    "openai": {
      "apiKey": "your-api-key",
      "baseUrl": "https://api.studio.nebius.com/v1",
      "model": "Qwen/Qwen3-Embedding-8B",
      "dimensions": 4096,
      "routing": {
        "only": ["nebius"],
        "allow_fallbacks": false
      }
    }
  },
  "chatLLM": {
    "openai": {
      "apiKey": "your-api-key",
      "baseUrl": "https://openrouter.ai/api/v1",
      "model": "anthropic/claude-sonnet-4.5",
      "maxTokens": 256000,
      "temperature": 0.7,
      "routing": {
        "sort": "throughput"
      }
    }
  },
  "rateLimit": {
    "rpm": 100,
    "tpm": 100000
  },
  "maxTokens": 32000
}
```

### Provider Routing (OpenRouter)

When using OpenRouter as the base URL, provider routing options control which underlying providers handle requests.

**Location:** `/src/config/types.ts`

```typescript
interface ProviderRoutingConfig {
  order?: string[];              // Provider priority order
  allow_fallbacks?: boolean;     // Allow fallback to other providers
  require_parameters?: boolean;  // Require exact parameter support
  data_collection?: 'allow' | 'deny';  // Data collection policy
  zdr?: boolean;                 // Zero Data Retention
  enforce_distillable_text?: boolean;
  only?: string[];               // Only use these providers
  ignore?: string[];             // Never use these providers
  quantizations?: string[];      // Allowed quantization levels
  sort?: 'price' | 'throughput' | 'latency';  // Sorting priority
  max_price?: {
    prompt?: number;
    completion?: number;
    request?: number;
    image?: number;
  };
}
```

**Example: Force Nebius with ZDR:**
```json
{
  "providers": {
    "openai": {
      "baseUrl": "https://openrouter.ai/api/v1",
      "model": "qwen/qwen3-embedding-8b",
      "routing": {
        "only": ["nebius"],
        "allow_fallbacks": false,
        "zdr": true,
        "data_collection": "deny"
      }
    }
  }
}
```

---

## Usage Examples

### Using Nebius for Embeddings

```bash
# Environment variables
export CODEVAULT_EMBEDDING_API_KEY=your-nebius-key
export CODEVAULT_EMBEDDING_BASE_URL=https://api.studio.nebius.com/v1
export CODEVAULT_EMBEDDING_MODEL=Qwen/Qwen3-Embedding-8B
export CODEVAULT_EMBEDDING_DIMENSIONS=4096
export CODEVAULT_EMBEDDING_MAX_TOKENS=32000

# Index your project
codevault index
```

### Using Ollama Locally

```bash
# Start Ollama with embedding model
ollama pull nomic-embed-text

# Configure CodeVault
export CODEVAULT_EMBEDDING_BASE_URL=http://localhost:11434/v1
export CODEVAULT_EMBEDDING_MODEL=nomic-embed-text

# Index your project
codevault index
```

### Using OpenRouter for Chat

```bash
export CODEVAULT_CHAT_API_KEY=your-openrouter-key
export CODEVAULT_CHAT_BASE_URL=https://openrouter.ai/api/v1
export CODEVAULT_CHAT_MODEL=anthropic/claude-sonnet-4.5

codevault ask "How does authentication work?"
```

### Programmatic Usage

```typescript
import { createEmbeddingProvider, createChatLLMProvider } from 'codevault';

// Create embedding provider
const embeddingProvider = createEmbeddingProvider('openai', {
  apiKey: process.env.API_KEY,
  model: 'text-embedding-3-large'
});

await embeddingProvider.init();
const embedding = await embeddingProvider.generateEmbedding('your code here');

// Create chat provider
const chatProvider = createChatLLMProvider('openai', {
  apiKey: process.env.API_KEY,
  model: 'gpt-4o'
});

const response = await chatProvider.generateCompletion([
  { role: 'user', content: 'Explain this code...' }
]);
```

### Custom Rate Limits

```typescript
import { OpenAIProvider } from 'codevault';

const provider = new OpenAIProvider({
  apiKey: 'your-key',
  rpm: 100,    // 100 requests per minute
  tpm: 50000   // 50,000 tokens per minute
});
```

---

## Batching Constants

Defined in `/src/providers/base.ts`:

| Constant | Default | Description |
|----------|---------|-------------|
| `BATCH_SIZE` | 100 | Maximum chunks per batch (configurable via env) |
| `MAX_BATCH_TOKENS` | 100,000 | Maximum tokens per API call |
| `MAX_ITEM_TOKENS` | 8,191 | Default per-item token limit |

---

## Error Handling

### Common Errors

**Text exceeds token limit:**
```
Error: Text at index 5 exceeds maximum token limit for text-embedding-3-large
(10000 > 8191). This would create corrupted embeddings.
```
**Solution:** Reduce chunk size or increase `CODEVAULT_EMBEDDING_MAX_TOKENS`.

**Rate limit exceeded:**
```
Error: Rate limit exceeded after 4 retries: 429 Too Many Requests
```
**Solution:** Reduce `rpm`/`tpm` settings or wait for rate limit window to reset.

**Invalid API response:**
```
Error: Invalid API response: expected data array, got undefined
```
**Solution:** Check API key, base URL, and model name are correct.

**Queue overflow:**
```
Error: Rate limiter queue is full (10000 items).
```
**Solution:** Reduce concurrent operations or increase queue size.

---

## See Also

- [Configuration Guide](CONFIGURATION.md) - Complete configuration options
- [CLI Reference](CLI_REFERENCE.md) - Command line interface
- [MCP Setup Guide](MCP_SETUP.md) - Claude Desktop integration
