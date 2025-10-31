# CodeVault Configuration Guide

Complete guide to configuring CodeVault for both CLI and MCP usage.

## 🎯 Quick Start

### For CLI Users (Recommended)

**One-time setup with Nebius + OpenRouter:**

```bash
# Initialize global configuration
codevault config init

# Embedding provider (Nebius + Qwen)
codevault config set providers.openai.apiKey your-nebius-api-key
codevault config set providers.openai.baseUrl https://api.studio.nebius.com/v1
codevault config set providers.openai.model Qwen/Qwen3-Embedding-8B
codevault config set providers.openai.dimensions 4096
codevault config set maxTokens 32000

# Chat LLM (OpenRouter + Claude)
codevault config set chatLLM.openai.apiKey your-openrouter-api-key
codevault config set chatLLM.openai.baseUrl https://openrouter.ai/api/v1
codevault config set chatLLM.openai.model anthropic/claude-sonnet-4.5
codevault config set chatLLM.openai.maxTokens 32000

# Reranking (Novita + Qwen)
codevault config set reranker.apiUrl https://api.novita.ai/openai/v1/rerank
codevault config set reranker.apiKey your-novita-api-key
codevault config set reranker.model qwen/qwen3-reranker-8b

# Now use CodeVault in any project
cd ~/projects/any-project
codevault index
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

### Complete Example

```json
{
  "defaultProvider": "openai",
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
      "apiKey": "your-openrouter-api-key",
      "baseUrl": "https://openrouter.ai/api/v1",
      "model": "anthropic/claude-sonnet-4.5",
      "maxTokens": 32000,
      "temperature": 0.1
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

### Setup 1: Nebius + OpenRouter (Cloud, Best Quality)

```bash
# Embeddings: Nebius + Qwen3-Embedding-8B
codevault config set providers.openai.apiKey your-nebius-api-key
codevault config set providers.openai.baseUrl https://api.studio.nebius.com/v1
codevault config set providers.openai.model Qwen/Qwen3-Embedding-8B
codevault config set providers.openai.dimensions 4096
codevault config set maxTokens 32000

# Chat: OpenRouter + Claude Sonnet 4.5
codevault config set chatLLM.openai.apiKey your-openrouter-api-key
codevault config set chatLLM.openai.baseUrl https://openrouter.ai/api/v1
codevault config set chatLLM.openai.model anthropic/claude-sonnet-4.5

# Reranking: Novita + Qwen3-Reranker
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

## 🔍 Troubleshooting

### "Which config is being used?"

```bash
# See all config sources and their values
codevault config list --sources
```

### "MCP not using my global config"

**This is correct!** MCP uses environment variables by design. Global config is only for CLI convenience.

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