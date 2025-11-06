# CodeVault Configuration Guide

Complete guide to configuring CodeVault for both CLI and MCP usage.

## 🎯 Quick Start

### For CLI Users (Recommended)

**One-time setup with OpenRouter (locks in Nebius for embeddings, Anthropic for chat):**

```bash
# Initialize global configuration
codevault config init

# Embedding via OpenRouter (locked to Nebius, fallback to DeepInfra)
codevault config set providers.openai.apiKey your-openrouter-api-key
codevault config set providers.openai.baseUrl https://openrouter.ai/api/v1
codevault config set providers.openai.model qwen/qwen3-embedding-8b
codevault config set providers.openai.dimensions 4096
codevault config set providers.openai.providerRouting.order "nebius,deepinfra"
codevault config set providers.openai.providerRouting.allowFallbacks true
codevault config set maxTokens 32000

# Chat via OpenRouter (locked to Anthropic)
codevault config set chatLLM.openai.apiKey your-openrouter-api-key
codevault config set chatLLM.openai.baseUrl https://openrouter.ai/api/v1
codevault config set chatLLM.openai.model anthropic/claude-sonnet-4.5
codevault config set chatLLM.openai.maxTokens 32000
codevault config set chatLLM.openai.providerRouting.order anthropic
codevault config set chatLLM.openai.providerRouting.allowFallbacks true

# Reranking (Novita directly)
codevault config set reranker.apiUrl https://api.novita.ai/openai/v1/rerank
codevault config set reranker.apiKey your-novita-api-key
codevault config set reranker.model qwen/qwen3-reranker-8b

# Now use CodeVault in any project
cd ~/projects/any-project
codevault index
```

**Alternative: Direct Nebius (simpler, no provider routing needed):**

```bash
# Embedding directly from Nebius (no OpenRouter)
codevault config set providers.openai.apiKey your-nebius-api-key
codevault config set providers.openai.baseUrl https://api.studio.nebius.com/v1
codevault config set providers.openai.model Qwen/Qwen3-Embedding-8B
codevault config set providers.openai.dimensions 4096

# Chat via OpenRouter
codevault config set chatLLM.openai.apiKey your-openrouter-api-key
codevault config set chatLLM.openai.baseUrl https://openrouter.ai/api/v1
codevault config set chatLLM.openai.model anthropic/claude-sonnet-4.5
```

### For MCP Users

**Example config files:** See [examples directory](../examples/) for ready-to-use configs.

Use environment variables in your MCP config:

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
        "CODEVAULT_RERANK_API_URL": "https://api.novita.ai/openai/v1/rerank",
        "CODEVAULT_RERANK_API_KEY": "your-novita-api-key",
        "CODEVAULT_RERANK_MODEL": "qwen/qwen3-reranker-8b"
      }
    }
  }
}
```

## 📁 Configuration Locations

### Global Config
- **Path**: `~/.codevault/config.json`
- **Purpose**: User-wide settings (API keys, preferences)
- **Best for**: CLI users who want convenience

### Project Config
- **Path**: `.codevault/config.json` (in project root)
- **Purpose**: Project-specific overrides
- **Best for**: Special requirements per project

### Environment Variables
- **Source**: `.env` file or MCP config
- **Purpose**: Runtime configuration
- **Best for**: MCP usage, CI/CD, temporary overrides

## 🔑 Configuration Priority

Settings are applied in this order (highest to lowest):

1. **Environment Variables** (always wins - MCP uses this)
2. **Project Config** (`.codevault/config.json`)
3. **Global Config** (`~/.codevault/config.json`)
4. **Defaults** (fallback values)

This ensures:
- ✅ MCP always uses environment variables (no change needed)
- ✅ CLI can use convenient global config
- ✅ Projects can override global settings if needed

## 📝 Configuration File Format

### Complete Example (OpenRouter with Provider Routing)

```json
{
  "defaultProvider": "openai",
  "providers": {
    "openai": {
      "apiKey": "your-openrouter-api-key",
      "baseUrl": "https://openrouter.ai/api/v1",
      "model": "qwen/qwen3-embedding-8b",
      "dimensions": 4096,
      "providerRouting": {
        "order": ["nebius", "deepinfra"],
        "allowFallbacks": true
      }
    }
  },
  "chatLLM": {
    "openai": {
      "apiKey": "your-openrouter-api-key",
      "baseUrl": "https://openrouter.ai/api/v1",
      "model": "anthropic/claude-sonnet-4.5",
      "maxTokens": 32000,
      "temperature": 0.1,
      "providerRouting": {
        "order": ["anthropic"],
        "allowFallbacks": true
      }
    }
  },
  "maxTokens": 32000,
  "rateLimit": {
    "rpm": 10000,
    "tpm": 600000
  },
  "encryption": {
    "enabled": false,
    "key": ""
  },
  "reranker": {
    "apiUrl": "https://api.novita.ai/openai/v1/rerank",
    "apiKey": "your-novita-api-key",
    "model": "qwen/qwen3-reranker-8b"
  }
}
```

### Simple Example (Direct Provider - No Routing)

```json
{
  "providers": {
    "openai": {
      "apiKey": "your-nebius-api-key",
      "baseUrl": "https://api.studio.nebius.com/v1",
      "model": "Qwen/Qwen3-Embedding-8B",
      "dimensions": 4096
    }
  },
  "chatLLM": {
    "openai": {
      "apiKey": "your-openai-api-key",
      "model": "gpt-4o"
    }
  }
}
```

## 🛠️ CLI Commands

### Initialize Configuration

```bash
# Create global config with defaults
codevault config init

# Force overwrite existing config
codevault config init --force
```

### Set Configuration Values

```bash
# Set in global config (default)
codevault config set providers.openai.apiKey your-key
codevault config set providers.openai.model Qwen/Qwen3-Embedding-8B
codevault config set maxTokens 32000

# Set in project config
codevault config set --local providers.openai.baseUrl http://localhost:11434/v1
codevault config set --local providers.openai.model nomic-embed-text
```

### Get Configuration Values

```bash
# Get merged value (respects priority)
codevault config get providers.openai.apiKey

# Get from global config only
codevault config get --global providers.openai.model

# Get from project config only
codevault config get --local providers.openai.baseUrl
```

### View Configuration

```bash
# Show merged configuration
codevault config list

# Show global config only
codevault config list --global

# Show project config only
codevault config list --local

# Show all sources separately
codevault config list --sources
```

### Remove Configuration Values

```bash
# Remove from global config
codevault config unset providers.openai.apiKey

# Remove from project config
codevault config unset --local providers.openai.baseUrl
```

### Show Config Paths

```bash
# Display config file locations
codevault config path
```

## 🌐 Environment Variables

### Embedding Provider

```bash
# Nebius + Qwen (Recommended)
export CODEVAULT_EMBEDDING_API_KEY=your-nebius-api-key
export CODEVAULT_EMBEDDING_BASE_URL=https://api.studio.nebius.com/v1
export CODEVAULT_EMBEDDING_MODEL=Qwen/Qwen3-Embedding-8B
export CODEVAULT_EMBEDDING_DIMENSIONS=4096
export CODEVAULT_EMBEDDING_MAX_TOKENS=32000
export CODEVAULT_EMBEDDING_RATE_LIMIT_RPM=10000
export CODEVAULT_EMBEDDING_RATE_LIMIT_TPM=600000

# Ollama (Local)
export CODEVAULT_EMBEDDING_BASE_URL=http://localhost:11434/v1
export CODEVAULT_EMBEDDING_MODEL=nomic-embed-text
export CODEVAULT_EMBEDDING_DIMENSIONS=768
export CODEVAULT_EMBEDDING_MAX_TOKENS=8192
```

### Chat LLM

```bash
# OpenRouter + Claude (Recommended)
export CODEVAULT_CHAT_API_KEY=your-openrouter-api-key
export CODEVAULT_CHAT_BASE_URL=https://openrouter.ai/api/v1
export CODEVAULT_CHAT_MODEL=anthropic/claude-sonnet-4.5
export CODEVAULT_CHAT_MAX_TOKENS=32000
export CODEVAULT_CHAT_TEMPERATURE=0.1

# Ollama (Local)
export CODEVAULT_CHAT_BASE_URL=http://localhost:11434/v1
export CODEVAULT_CHAT_MODEL=qwen2.5-coder:7b
export CODEVAULT_CHAT_MAX_TOKENS=32000
```

### Reranking (Optional)

```bash
# Novita + Qwen (Recommended)
export CODEVAULT_RERANK_API_URL=https://api.novita.ai/openai/v1/rerank
export CODEVAULT_RERANK_API_KEY=your-novita-api-key
export CODEVAULT_RERANK_MODEL=qwen/qwen3-reranker-8b
```

### Provider Routing (Optional - OpenRouter Only)

**⚠️ Only needed when using OpenRouter or similar routing services**

Provider routing allows you to lock in specific providers when using OpenRouter's multi-provider API.

```bash
# Embedding via OpenRouter (lock to Nebius, fallback to DeepInfra)
export CODEVAULT_EMBEDDING_API_KEY=your-openrouter-api-key
export CODEVAULT_EMBEDDING_BASE_URL=https://openrouter.ai/api/v1
export CODEVAULT_EMBEDDING_MODEL=qwen/qwen3-embedding-8b
export CODEVAULT_EMBEDDING_PROVIDER_ORDER=nebius,deepinfra
export CODEVAULT_EMBEDDING_PROVIDER_ALLOW_FALLBACKS=true

# Alternative: Use FP8 quantization for cost savings
export CODEVAULT_EMBEDDING_PROVIDER_ORDER=siliconflow/fp8
export CODEVAULT_EMBEDDING_PROVIDER_ALLOW_FALLBACKS=false

# Chat via OpenRouter (lock to Anthropic, allow fallbacks)
export CODEVAULT_CHAT_API_KEY=your-openrouter-api-key
export CODEVAULT_CHAT_BASE_URL=https://openrouter.ai/api/v1
export CODEVAULT_CHAT_MODEL=anthropic/claude-sonnet-4.5
export CODEVAULT_CHAT_PROVIDER_ORDER=anthropic
export CODEVAULT_CHAT_PROVIDER_ALLOW_FALLBACKS=true

# Reranking via OpenRouter (future support)
export CODEVAULT_RERANK_PROVIDER_ORDER=novita
export CODEVAULT_RERANK_PROVIDER_ALLOW_FALLBACKS=false
```

**Available routing options:**
- `CODEVAULT_*_PROVIDER_ORDER` - Comma-separated list of providers (e.g., "nebius,together")
- `CODEVAULT_*_PROVIDER_ALLOW_FALLBACKS` - Allow fallback to other providers (true/false)
- `CODEVAULT_*_PROVIDER_ONLY` - Only use these providers (e.g., "nebius,anthropic")
- `CODEVAULT_*_PROVIDER_IGNORE` - Ignore these providers (e.g., "openai,azure")

**When NOT to use provider routing:**
- ❌ Direct Nebius (you're already on a single provider)
- ❌ Direct OpenAI (no routing layer)
- ❌ Ollama local (single provider)
- ✅ OpenRouter (to lock specific providers like Nebius, Anthropic, etc.)

### Encryption (Optional)

```bash
# Generate and set encryption key
export CODEVAULT_ENCRYPTION_KEY=$(openssl rand -base64 32)
```

### Legacy Variables (Backward Compatibility)

Old variable names are still supported:
- `OPENAI_API_KEY` → `CODEVAULT_EMBEDDING_API_KEY`
- `OPENAI_BASE_URL` → `CODEVAULT_EMBEDDING_BASE_URL`
- `CODEVAULT_OPENAI_EMBEDDING_MODEL` → `CODEVAULT_EMBEDDING_MODEL`
- `CODEVAULT_OLLAMA_MODEL` → `CODEVAULT_OLLAMA_EMBEDDING_MODEL`

## 🎭 Common Setups

### Setup 1: OpenRouter (Cloud, Provider Routing)

**Use OpenRouter for everything, lock in specific providers**

```bash
# Embeddings: OpenRouter locked to Nebius (with fallback)
codevault config set providers.openai.apiKey your-openrouter-api-key
codevault config set providers.openai.baseUrl https://openrouter.ai/api/v1
codevault config set providers.openai.model qwen/qwen3-embedding-8b
codevault config set providers.openai.dimensions 4096
codevault config set providers.openai.providerRouting.order "nebius,deepinfra"
codevault config set providers.openai.providerRouting.allowFallbacks true

# Chat: OpenRouter locked to Anthropic
codevault config set chatLLM.openai.apiKey your-openrouter-api-key
codevault config set chatLLM.openai.baseUrl https://openrouter.ai/api/v1
codevault config set chatLLM.openai.model anthropic/claude-sonnet-4.5
codevault config set chatLLM.openai.providerRouting.order anthropic
codevault config set chatLLM.openai.providerRouting.allowFallbacks true

# Reranking: Novita (direct)
codevault config set reranker.apiUrl https://api.novita.ai/openai/v1/rerank
codevault config set reranker.apiKey your-novita-api-key
codevault config set reranker.model qwen/qwen3-reranker-8b
```

### Setup 1b: Direct Providers (No Routing Needed)

**Simpler setup when using providers directly**

```bash
# Embeddings: Nebius directly
codevault config set providers.openai.apiKey your-nebius-api-key
codevault config set providers.openai.baseUrl https://api.studio.nebius.com/v1
codevault config set providers.openai.model Qwen/Qwen3-Embedding-8B
codevault config set providers.openai.dimensions 4096

# Chat: OpenRouter (default load balancing)
codevault config set chatLLM.openai.apiKey your-openrouter-api-key
codevault config set chatLLM.openai.baseUrl https://openrouter.ai/api/v1
codevault config set chatLLM.openai.model anthropic/claude-sonnet-4.5

# Reranking: Novita directly
codevault config set reranker.apiUrl https://api.novita.ai/openai/v1/rerank
codevault config set reranker.apiKey your-novita-api-key
codevault config set reranker.model qwen/qwen3-reranker-8b
```

### Setup 2: Full Ollama (Local, Privacy-First)

```bash
# Embeddings: Ollama + Nomic
codevault config set providers.openai.baseUrl http://localhost:11434/v1
codevault config set providers.openai.model nomic-embed-text
codevault config set providers.openai.dimensions 768
codevault config set maxTokens 8192

# Chat: Ollama + Qwen2.5-Coder
codevault config set chatLLM.openai.baseUrl http://localhost:11434/v1
codevault config set chatLLM.openai.model qwen2.5-coder:7b
codevault config set chatLLM.openai.maxTokens 32000

# No reranking (local only)
```

### Setup 3: Hybrid (Local embeddings, Cloud chat)

```bash
# Embeddings: Ollama (local, free)
codevault config set providers.openai.baseUrl http://localhost:11434/v1
codevault config set providers.openai.model nomic-embed-text
codevault config set providers.openai.dimensions 768

# Chat: OpenRouter (cloud, best quality)
codevault config set chatLLM.openai.apiKey your-openrouter-api-key
codevault config set chatLLM.openai.baseUrl https://openrouter.ai/api/v1
codevault config set chatLLM.openai.model anthropic/claude-sonnet-4.5
```

## 🔒 Security Best Practices

### For CLI Users

1. **Use global config for API keys**:
   ```bash
   codevault config set providers.openai.apiKey your-key
   chmod 600 ~/.codevault/config.json
   ```

2. **Never commit config files**:
   ```gitignore
   .codevault/config.json
   ~/.codevault/
   ```

3. **Use environment variables for CI/CD**:
   ```bash
   export CODEVAULT_EMBEDDING_API_KEY=ci-key
   ```

### For MCP Users

- API keys in MCP config files are secure
- MCP manages environment isolation automatically
- Config files are stored in system-specific locations

## 🔀 Provider Routing (OpenRouter)

### What is Provider Routing?

Provider routing is an **optional feature** that allows you to control which backend provider OpenRouter uses for your requests. This is **only relevant when using OpenRouter** as your base URL.

### When to Use Provider Routing

✅ **Use provider routing when:**
- Using OpenRouter's API (`https://openrouter.ai/api/v1`)
- You want to lock in a specific provider (e.g., Nebius, Anthropic, Together AI)
- You want to control fallback behavior
- You need data privacy controls (ZDR, data collection policies)

❌ **Do NOT use provider routing when:**
- Using Nebius directly (`https://api.studio.nebius.com/v1`)
- Using OpenAI directly (`https://api.openai.com/v1`)
- Using Ollama locally (`http://localhost:11434/v1`)
- Using any other single provider directly

### Configuration Options

Add `providerRouting` to your provider config (embedding, chat, or reranking):

```json
{
  "providers": {
    "openai": {
      "baseUrl": "https://openrouter.ai/api/v1",
      "providerRouting": {
        "order": ["nebius"],           // Try these providers in order
        "allowFallbacks": false,        // Don't fallback to other providers
        "requireParameters": false,     // Only use providers supporting all params
        "dataCollection": "deny",       // Only use providers that don't collect data
        "zdr": false,                   // Require Zero Data Retention
        "only": ["nebius", "together"], // Whitelist specific providers
        "ignore": ["openai", "azure"]   // Blacklist specific providers
      }
    }
  }
}
```

### Common Patterns

**Lock to single provider (no fallbacks):**
```json
"providerRouting": {
  "order": ["nebius"],
  "allowFallbacks": false
}
```

**Prefer provider but allow fallbacks:**
```json
"providerRouting": {
  "order": ["anthropic", "openai"],
  "allowFallbacks": true
}
```

**Privacy-focused (no data collection):**
```json
"providerRouting": {
  "dataCollection": "deny",
  "zdr": true
}
```

### Environment Variables

Use environment variables for provider routing in MCP configs:

```bash
# Embedding provider routing
export CODEVAULT_EMBEDDING_PROVIDER_ORDER=nebius
export CODEVAULT_EMBEDDING_PROVIDER_ALLOW_FALLBACKS=false

# Chat provider routing  
export CODEVAULT_CHAT_PROVIDER_ORDER=anthropic,openai
export CODEVAULT_CHAT_PROVIDER_ALLOW_FALLBACKS=true

# Reranking provider routing (future)
export CODEVAULT_RERANK_PROVIDER_ORDER=novita
```

### Provider Names

Common OpenRouter provider names:
- `nebius` - Nebius AI
- `anthropic` - Anthropic (Claude)
- `openai` - OpenAI
- `together` - Together AI
- `deepinfra` - DeepInfra
- `siliconflow` - Silicon Flow
- `azure` - Azure OpenAI
- `novita` - Novita AI (reranking)

See [OpenRouter docs](https://openrouter.ai/docs/provider-routing) for complete list.

### Qwen3 Embedding Model on OpenRouter

When using `qwen/qwen3-embedding-8b` model via OpenRouter, you can choose from multiple providers:

**Model**: `qwen/qwen3-embedding-8b`
**Available Providers**:
- `nebius` - Nebius AI (recommended, high performance)
- `siliconflow/fp8` - Silicon Flow with FP8 quantization (faster, lower cost)
- `deepinfra` - DeepInfra (good balance)

**Example configurations:**

```json
{
  "providers": {
    "openai": {
      "apiKey": "your-openrouter-api-key",
      "baseUrl": "https://openrouter.ai/api/v1",
      "model": "qwen/qwen3-embedding-8b",
      "dimensions": 4096,
      "providerRouting": {
        "order": ["nebius", "deepinfra"],
        "allowFallbacks": true
      }
    }
  }
}
```

**Use FP8 quantization for cost savings:**
```json
{
  "providerRouting": {
    "order": ["siliconflow/fp8"],
    "allowFallbacks": false
  }
}
```

**Note**: When specifying quantization variants like `siliconflow/fp8`, use the exact provider slug including the quantization suffix.

## 🔍 Troubleshooting

### "Which config is being used?"

```bash
# See all config sources and their values
codevault config list --sources
```

### "MCP not using my global config"

**This is correct!** MCP uses environment variables by design. Global config is only for CLI convenience.

### "Provider routing not working"

Check these:
1. Are you using OpenRouter as your base URL?
2. Is `providerRouting` configured correctly?
3. Does the provider support your model?
4. Run `codevault config list --sources` to verify settings

### "Config not taking effect"

Check priority order:
1. Are environment variables set? (they override everything)
2. Is there a project config? (overrides global)
3. Is global config set correctly?

```bash
# Debug: see what's actually being used
codevault config list --sources
```

### "Want to reset everything"

```bash
# Remove global config
rm ~/.codevault/config.json

# Remove project config
rm .codevault/config.json

# Start fresh
codevault config init
```

## ⚠️ Important Notes

1. **Config files are NEVER modified by indexing/searching operations**
   - Only `codevault config set/unset/init` commands write to disk
   - MCP operations never touch config files

2. **Environment variables are ephemeral**
   - They exist only in the current process
   - MCP sets them per-server instance
   - They never persist to config files

3. **Backward compatibility**
   - `.env` files still work
   - Existing MCP setups require no changes
   - Old workflows continue unchanged

---

**Need help?** Run `codevault config --help` for command details.