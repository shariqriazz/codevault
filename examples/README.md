# CodeVault Configuration Examples

This directory contains example configuration files for different use cases.

## 📁 Available Examples

### [`nebius-openrouter.example.json`](nebius-openrouter.example.json)
**Recommended setup for best quality**

- **Embeddings:** Nebius + Qwen3-Embedding-8B (4096 dims, 32K context)
- **Chat:** OpenRouter + Claude Sonnet 4.5 (200K context)
- **Reranking:** Novita + Qwen3-Reranker-8B (32K context)
- **Best for:** Production, high-quality results
- **Cost:** ~$10-30/month

### [`ollama-local.example.json`](ollama-local.example.json)
**Full local setup - privacy-focused**

- **Embeddings:** Ollama + nomic-embed-text (768 dims, 8K context)
- **Chat:** Ollama + qwen2.5-coder:7b (32K context)
- **Reranking:** None (local only)
- **Best for:** Privacy, development, testing
- **Cost:** Free (requires local hardware)

### [`full-config.example.json`](full-config.example.json)
**Complete configuration with all options**

Shows all available configuration options with recommended defaults.

## 🚀 Quick Start

### 1. Choose Your Setup

Copy the example that matches your needs:

```bash
# Cloud setup (recommended)
cp examples/nebius-openrouter.example.json ~/.codevault/config.json

# Local setup (privacy-focused)
cp examples/ollama-local.example.json ~/.codevault/config.json
```

### 2. Edit Configuration

Open the file and replace placeholder values:

```bash
# Edit global config
nano ~/.codevault/config.json

# Or use interactive setup
codevault config init
```

### 3. Set API Keys

Replace these placeholders with your actual keys:
- `your-nebius-api-token-here`
- `your-openrouter-api-key-here`
- `your-novita-api-key-here`

### 4. Test Configuration

```bash
# View merged config
codevault config list

# Test with indexing
codevault index
```

## 🔑 Getting API Keys

### Nebius AI Studio (Embeddings)
1. Visit https://nebius.com/
2. Sign up for AI Studio
3. Generate API token
4. Use model: `Qwen/Qwen3-Embedding-8B`

### OpenRouter (Chat LLM)
1. Visit https://openrouter.ai/
2. Sign up and add credits
3. Generate API key
4. Use model: `anthropic/claude-sonnet-4.5`

### Novita AI (Reranking)
1. Visit https://novita.ai/
2. Sign up
3. Generate API key
4. Use model: `qwen/qwen3-reranker-8b`

### Ollama (Local)
1. Install: https://ollama.com/install.sh
2. Pull models:
   ```bash
   ollama pull nomic-embed-text
   ollama pull qwen2.5-coder:7b
   ```
3. No API key needed!

## 📊 Comparison

| Setup | Quality | Privacy | Cost | Speed |
|-------|---------|---------|------|-------|
| **nebius-openrouter** | ⭐⭐⭐⭐⭐ | ⭐⭐ | $$ | ⭐⭐⭐⭐ |
| **ollama-local** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Free | ⭐⭐⭐ |

## 💡 Tips

### For CLI Users
Store config in `~/.codevault/config.json` for automatic use across all projects.

### For MCP Users
Use environment variables in your MCP config instead of config files.

### For Teams
Create project-specific configs in `.codevault/config.json` that override global settings.

### For CI/CD
Use environment variables for maximum flexibility and security.

## 📚 Additional Resources

- [Configuration Guide](../docs/CONFIGURATION.md) - Complete configuration reference
- [MCP Setup Guide](../docs/MCP_SETUP.md) - Claude Desktop integration
- [API Providers Guide](../docs/PROVIDERS.md) - Provider comparison

---

**Questions?** Check the [main README](../README.md) or [open an issue](https://github.com/shariqriazz/codevault/issues).