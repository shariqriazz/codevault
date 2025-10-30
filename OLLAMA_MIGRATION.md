# Ollama Migration Guide

## What Changed?

The dedicated Ollama provider has been removed in favor of using Ollama's OpenAI-compatible API endpoint. This simplifies the codebase while maintaining full functionality.

## Why This Change?

- **Less code to maintain**: One provider instead of two
- **Better performance**: OpenAI provider supports batch processing (50x fewer API calls)
- **No functionality loss**: Ollama's OpenAI-compatible endpoint works identically
- **Fewer dependencies**: Removes the `ollama` npm package

## Migration Steps

### For CLI Users

**Old configuration:**
```bash
codevault config set provider ollama
codevault config set providers.ollama.model nomic-embed-text
codevault config set providers.ollama.dimensions 768
```

**New configuration:**
```bash
codevault config set provider openai
codevault config set providers.openai.baseUrl http://localhost:11434/v1
codevault config set providers.openai.model nomic-embed-text
codevault config set providers.openai.dimensions 768
```

### For Environment Variables

**Old:**
```bash
export CODEVAULT_OLLAMA_EMBEDDING_MODEL=nomic-embed-text
export CODEVAULT_OLLAMA_CHAT_MODEL=llama3.1
export CODEVAULT_DIMENSIONS=768
```

**New:**
```bash
export CODEVAULT_EMBEDDING_BASE_URL=http://localhost:11434/v1
export CODEVAULT_EMBEDDING_MODEL=nomic-embed-text
export CODEVAULT_CHAT_BASE_URL=http://localhost:11434/v1
export CODEVAULT_CHAT_MODEL=llama3.1
export CODEVAULT_DIMENSIONS=768
```

### For Config Files

**Old (`~/.codevault/config.json`):**
```json
{
  "defaultProvider": "ollama",
  "providers": {
    "ollama": {
      "model": "nomic-embed-text",
      "dimensions": 768
    }
  },
  "chatLLM": {
    "ollama": {
      "model": "llama3.1"
    }
  }
}
```

**New:**
```json
{
  "defaultProvider": "openai",
  "providers": {
    "openai": {
      "baseUrl": "http://localhost:11434/v1",
      "model": "nomic-embed-text",
      "dimensions": 768
    }
  },
  "chatLLM": {
    "openai": {
      "baseUrl": "http://localhost:11434/v1",
      "model": "llama3.1"
    }
  }
}
```

### For Command Line Usage

**Old:**
```bash
codevault index --provider ollama
codevault ask "question" --chat-provider ollama
```

**New:**
```bash
# Set baseURL once via config or env vars, then use:
codevault index --provider openai
codevault ask "question" --chat-provider openai

# Or with env vars inline:
CODEVAULT_EMBEDDING_BASE_URL=http://localhost:11434/v1 codevault index
```

## FAQ

**Q: Will my existing index still work?**  
A: Yes! The index format hasn't changed. Only the provider configuration has changed.

**Q: Do I need to reinstall Ollama?**  
A: No. Ollama still works the same way. You're just using its OpenAI-compatible endpoint now.

**Q: What about the `ollama` npm package?**  
A: It's no longer needed and will be removed from dependencies. The OpenAI SDK handles everything.

**Q: Will this affect performance?**  
A: Actually, performance should **improve** because the OpenAI provider supports batch processing.

**Q: Can I still use local models?**  
A: Absolutely! This change is purely about how we communicate with Ollama, not what models you can use.

## Examples

See the updated example configurations:
- `examples/ollama-local.example.json` - Local Ollama setup
- `examples/full-config.example.json` - Complete configuration options
