# CodeVault Configuration Guide

CodeVault now supports a flexible configuration system that works seamlessly for both CLI and MCP usage.

## 🎯 Quick Start

### For CLI Users

**One-time setup** (recommended):

```bash
# Initialize global configuration
codevault config init

# Set your API key (stored in ~/.codevault/config.json)
codevault config set providers.openai.apiKey sk-your-key-here
codevault config set providers.openai.model text-embedding-3-large

# Now use CodeVault in any project without .env files
cd ~/projects/any-project
codevault index
```

### For MCP Users

**Nothing changes!** Continue using environment variables in your MCP config:

```json
{
  "mcpServers": {
    "codevault": {
      "command": "node",
      "args": ["/path/to/dist/mcp-server.js"],
      "env": {
        "CODEVAULT_EMBEDDING_API_KEY": "sk-your-key-here",
        "CODEVAULT_EMBEDDING_MODEL": "text-embedding-3-large",
        "CODEVAULT_EMBEDDING_DIMENSIONS": "3072",
        "CODEVAULT_EMBEDDING_MAX_TOKENS": "8192"
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

```json
{
  "defaultProvider": "openai",
  "providers": {
    "openai": {
      "apiKey": "sk-...",
      "baseUrl": "https://api.openai.com/v1",
      "model": "text-embedding-3-large",
      "dimensions": 3072
    },
    "ollama": {
      "model": "nomic-embed-text",
      "dimensions": 768
    }
  },
  "maxTokens": 8192,
  "rateLimit": {
    "rpm": 10000,
    "tpm": 600000
  },
  "encryption": {
    "enabled": false,
    "key": "..."
  },
  "reranker": {
    "apiUrl": "https://api.example.com/rerank",
    "apiKey": "...",
    "model": "rerank-model"
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
codevault config set provider openai
codevault config set providers.openai.apiKey sk-...
codevault config set providers.openai.model text-embedding-3-large
codevault config set maxTokens 8192

# Set in project config
codevault config set --local provider ollama
codevault config set --local providers.ollama.model nomic-embed-text
```

### Get Configuration Values

```bash
# Get merged value (respects priority)
codevault config get providers.openai.apiKey

# Get from global config only
codevault config get --global providers.openai.model

# Get from project config only
codevault config get --local provider
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
codevault config unset --local provider
```

### Show Config Paths

```bash
# Display config file locations
codevault config path
```

## 🔒 Security Best Practices

### For CLI Users

1. **Use global config for API keys**:
   ```bash
   codevault config set providers.openai.apiKey sk-...
   ```

2. **Restrict file permissions**:
   ```bash
   chmod 600 ~/.codevault/config.json
   ```

3. **Never commit config files** (already in `.gitignore`):
   ```gitignore
   .codevault/config.json
   ~/.codevault/
   ```

### For MCP Users

- API keys in MCP config files are secure
- MCP manages environment isolation automatically
- No changes needed to your existing setup

## 🎭 Use Cases

### Case 1: Single Developer, Multiple Projects

```bash
# Set up once globally
codevault config init
codevault config set providers.openai.apiKey sk-...

# Use in any project without setup
cd ~/project1 && codevault index
cd ~/project2 && codevault index
cd ~/project3 && codevault index
```

### Case 2: Project with Special Requirements

```bash
# Use Ollama for this project only
cd ~/special-project
codevault config set --local provider ollama
codevault config set --local providers.ollama.model llama2

# Other projects still use global OpenAI config
```

### Case 3: MCP with Different Settings

```json
{
  "mcpServers": {
    "codevault-work": {
      "env": { "OPENAI_API_KEY": "sk-work-key" }
    },
    "codevault-personal": {
      "env": { "OPENAI_API_KEY": "sk-personal-key" }
    }
  }
}
```

### Case 4: CI/CD Pipeline

```bash
# Environment variables override everything
export OPENAI_API_KEY=sk-ci-key
export CODEVAULT_OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Works regardless of config files
codevault index
```

## 🔍 Troubleshooting

### "Which config is being used?"

```bash
# See all config sources and their values
codevault config list --sources
```

### "MCP not using my global config"

**This is correct!** MCP uses environment variables by design. Your global config is only for CLI convenience.

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

## 📚 Examples

### Example: OpenAI Setup

```bash
codevault config set providers.openai.apiKey sk-proj-...
codevault config set providers.openai.baseUrl https://api.openai.com/v1
codevault config set providers.openai.model text-embedding-3-large
codevault config set providers.openai.dimensions 3072
codevault config set maxTokens 8192
```

### Example: Ollama Setup

```bash
codevault config set provider ollama
codevault config set providers.ollama.model nomic-embed-text
codevault config set providers.ollama.dimensions 768
codevault config set maxTokens 8192
```

### Example: Nebius/Qwen Setup

```bash
codevault config set providers.openai.apiKey your-nebius-jwt-token
codevault config set providers.openai.baseUrl https://api.studio.nebius.com/v1
codevault config set providers.openai.model Qwen/Qwen3-Embedding-8B
codevault config set providers.openai.dimensions 4096
codevault config set maxTokens 32000
```

### Example: Rate Limiting

```bash
codevault config set rateLimit.rpm 10000
codevault config set rateLimit.tpm 600000
```

### Example: Encryption

```bash
codevault config set encryption.enabled true
codevault config set encryption.key $(openssl rand -base64 32)
```

## 🚀 Migration from .env Files

If you have existing `.env` files in multiple projects:

```bash
# Option 1: Move to global config (recommended)
# Copy your common settings once
codevault config set providers.openai.apiKey $CODEVAULT_EMBEDDING_API_KEY
codevault config set providers.openai.model $CODEVAULT_EMBEDDING_MODEL

# Option 2: Keep .env files (still works)
# No changes needed, .env continues to work

# Option 3: Hybrid approach
# Global config for API keys, .env for project-specific settings
```

---

**Need help?** Run `codevault config --help` for command details.