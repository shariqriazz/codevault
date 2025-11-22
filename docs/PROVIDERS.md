# API Providers Guide

Complete guide to embedding, chat LLM, and reranking providers supported by CodeVault.

## 🎯 Recommended Setup

For best quality and performance:

```bash
# Embeddings: Nebius + Qwen3-Embedding-8B (4096 dims, 32K context)
export CODEVAULT_EMBEDDING_API_KEY=your-nebius-key
export CODEVAULT_EMBEDDING_BASE_URL=https://api.studio.nebius.com/v1
export CODEVAULT_EMBEDDING_MODEL=Qwen/Qwen3-Embedding-8B
export CODEVAULT_EMBEDDING_DIMENSIONS=4096
export CODEVAULT_EMBEDDING_MAX_TOKENS=32000

# Chat: OpenRouter + Claude Sonnet 4.5 (200K context)
export CODEVAULT_CHAT_API_KEY=your-openrouter-key
export CODEVAULT_CHAT_BASE_URL=https://openrouter.ai/api/v1
export CODEVAULT_CHAT_MODEL=anthropic/claude-sonnet-4.5
export CODEVAULT_CHAT_MAX_TOKENS=32000

# Reranking: Novita + Qwen3-Reranker-8B (32K context)
export CODEVAULT_RERANK_API_URL=https://api.novita.ai/openai/v1/rerank
export CODEVAULT_RERANK_API_KEY=your-novita-key
export CODEVAULT_RERANK_MODEL=qwen/qwen3-reranker-8b
```

## 📊 Embedding Providers

### Nebius AI Studio (Recommended)

**Best for:** High quality embeddings with large context

**Models:**
- **Qwen/Qwen3-Embedding-8B** (4096 dims, 32K context)

**Pros:**
- ✅ Excellent quality for code
- ✅ Very large context window (32K tokens)
- ✅ High dimensions (4096)
- ✅ Competitive pricing
- ✅ Fast API

**Cons:**
- ⚠️ Requires API key and account
- ⚠️ Cloud-based (not local)

**Setup:**
```bash
# Environment variables
export CODEVAULT_EMBEDDING_API_KEY=your-nebius-api-token
export CODEVAULT_EMBEDDING_BASE_URL=https://api.studio.nebius.com/v1
export CODEVAULT_EMBEDDING_MODEL=Qwen/Qwen3-Embedding-8B
export CODEVAULT_EMBEDDING_DIMENSIONS=4096
export CODEVAULT_EMBEDDING_MAX_TOKENS=32000

# Config file
codevault config set providers.openai.apiKey your-nebius-api-token
codevault config set providers.openai.baseUrl https://api.studio.nebius.com/v1
codevault config set providers.openai.model Qwen/Qwen3-Embedding-8B
codevault config set providers.openai.dimensions 4096
codevault config set maxTokens 32000
```

**Rate Limits:**
- 10,000 requests/minute (default)
- 600,000 tokens/minute (default)

**Get API Key:**
1. Visit https://nebius.com/
2. Sign up for AI Studio
3. Generate API token

---

### OpenAI

**Best for:** Reliable, well-tested embeddings

**Models:**
- **text-embedding-3-large** (3072 dims, 8K context)
- **text-embedding-3-small** (1536 dims, 8K context)
- **text-embedding-ada-002** (1536 dims, 8K context)

**Pros:**
- ✅ Very reliable
- ✅ Well-documented
- ✅ Good quality
- ✅ Fast API

**Cons:**
- ⚠️ Smaller context (8K vs 32K)
- ⚠️ Fewer dimensions than Qwen
- ⚠️ More expensive

**Setup:**
```bash
# Environment variables
export CODEVAULT_EMBEDDING_API_KEY=sk-your-openai-key
export CODEVAULT_EMBEDDING_BASE_URL=https://api.openai.com/v1
export CODEVAULT_EMBEDDING_MODEL=text-embedding-3-large
export CODEVAULT_EMBEDDING_DIMENSIONS=3072
export CODEVAULT_EMBEDDING_MAX_TOKENS=8192

# Config file
codevault config set providers.openai.apiKey sk-your-key
codevault config set providers.openai.model text-embedding-3-large
codevault config set providers.openai.dimensions 3072
```

**Rate Limits:**
- 3,000 requests/minute (tier 1)
- 1,000,000 tokens/minute (tier 1)

**Get API Key:**
1. Visit https://platform.openai.com/
2. Sign up and add payment method
3. Generate API key

---

### Ollama (Local)

**Best for:** Privacy, local development, no API costs

**Models:**
- **nomic-embed-text** (768 dims, 8K context) - Recommended
- **mxbai-embed-large** (1024 dims, 512 context)
- **all-minilm** (384 dims, 256 context)

**Pros:**
- ✅ Completely free
- ✅ Privacy-focused (local)
- ✅ No API keys needed
- ✅ Fast on good hardware
- ✅ Offline capable

**Cons:**
- ⚠️ Lower dimensions
- ⚠️ Smaller context window
- ⚠️ Requires local installation
- ⚠️ Slower on poor hardware

**Setup:**
```bash
# 1. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2. Pull embedding model
ollama pull nomic-embed-text

# 3. Configure CodeVault
export CODEVAULT_EMBEDDING_BASE_URL=http://localhost:11434/v1
export CODEVAULT_EMBEDDING_MODEL=nomic-embed-text
export CODEVAULT_EMBEDDING_DIMENSIONS=768
export CODEVAULT_EMBEDDING_MAX_TOKENS=8192

# Or via config
codevault config set providers.openai.baseUrl http://localhost:11434/v1
codevault config set providers.openai.model nomic-embed-text
codevault config set providers.openai.dimensions 768
```

**No Rate Limits** (local processing)

---

## 💬 Chat LLM Providers

### OpenRouter (Recommended)

**Best for:** Access to best models (Claude, GPT-4, etc.)

**Recommended Models:**
- **anthropic/claude-sonnet-4.5** (200K context) - Best for code
- **anthropic/claude-3.5-sonnet** (200K context) - Great alternative
- **openai/gpt-4-turbo** (128K context) - Good for code
- **google/gemini-pro-1.5** (1M context) - Huge context

**Pros:**
- ✅ Access to Claude (best for code)
- ✅ Multiple model choices
- ✅ Pay-per-use
- ✅ No monthly subscription
- ✅ Unified API

**Cons:**
- ⚠️ Requires API key
- ⚠️ Usage costs
- ⚠️ Cloud-based

**Setup:**
```bash
# Environment variables
export CODEVAULT_CHAT_API_KEY=your-openrouter-key
export CODEVAULT_CHAT_BASE_URL=https://openrouter.ai/api/v1
export CODEVAULT_CHAT_MODEL=anthropic/claude-sonnet-4.5
export CODEVAULT_CHAT_MAX_TOKENS=32000
export CODEVAULT_CHAT_TEMPERATURE=0.1

# Config file
codevault config set chatLLM.openai.apiKey your-openrouter-key
codevault config set chatLLM.openai.baseUrl https://openrouter.ai/api/v1
codevault config set chatLLM.openai.model anthropic/claude-sonnet-4.5
codevault config set chatLLM.openai.maxTokens 32000
```

**Get API Key:**
1. Visit https://openrouter.ai/
2. Sign up
3. Add credits
4. Generate API key

---

### Ollama (Local)

**Best for:** Privacy, local development, testing

**Recommended Models:**
- **qwen2.5-coder:7b** (32K context) - Best for code
- **llama3.1:8b** (128K context) - General purpose
- **codellama:13b** (16K context) - Code-focused
- **deepseek-coder:6.7b** (16K context) - Code understanding

**Pros:**
- ✅ Completely free
- ✅ Privacy-focused
- ✅ No API keys
- ✅ Fast on good hardware
- ✅ Offline capable

**Cons:**
- ⚠️ Lower quality than Claude
- ⚠️ Requires local resources
- ⚠️ Slower on poor hardware

**Setup:**
```bash
# 1. Pull chat model
ollama pull qwen2.5-coder:7b

# 2. Configure CodeVault
export CODEVAULT_CHAT_BASE_URL=http://localhost:11434/v1
export CODEVAULT_CHAT_MODEL=qwen2.5-coder:7b
export CODEVAULT_CHAT_MAX_TOKENS=32000

# Or via config
codevault config set chatLLM.openai.baseUrl http://localhost:11434/v1
codevault config set chatLLM.openai.model qwen2.5-coder:7b
```

---

## 🎯 Reranking Providers

Reranking improves search relevance by 5-10%. Optional but recommended.

### Novita AI (Recommended)

**Best for:** Code reranking with large context

**Model:**
- **qwen/qwen3-reranker-8b** (32K context)

**Pros:**
- ✅ Very large context (32K tokens)
- ✅ Optimized for code
- ✅ Fast API
- ✅ Good pricing

**Cons:**
- ⚠️ Requires API key
- ⚠️ Usage costs

**Setup:**
```bash
# Environment variables
export CODEVAULT_RERANK_API_URL=https://api.novita.ai/openai/v1/rerank
export CODEVAULT_RERANK_API_KEY=your-novita-key
export CODEVAULT_RERANK_MODEL=qwen/qwen3-reranker-8b

# Config file
codevault config set reranker.apiUrl https://api.novita.ai/openai/v1/rerank
codevault config set reranker.apiKey your-novita-key
codevault config set reranker.model qwen/qwen3-reranker-8b
```

**Get API Key:**
1. Visit https://novita.ai/
2. Sign up
3. Generate API key

---

### Cohere (Alternative)

**Model:**
- **rerank-english-v3.0** (4K context)

**Pros:**
- ✅ $25 free credits
- ✅ Well-established
- ✅ Good quality

**Cons:**
- ⚠️ Smaller context (4K vs 32K)
- ⚠️ Not optimized for code

**Setup:**
```bash
export CODEVAULT_RERANK_API_URL=https://api.cohere.ai/v1/rerank
export CODEVAULT_RERANK_API_KEY=your-cohere-key
export CODEVAULT_RERANK_MODEL=rerank-english-v3.0
```

---

## 🎭 Common Setups

### Setup 1: Cloud - Best Quality

**Best for:** Production, best results, willing to pay

```bash
# Embeddings: Nebius + Qwen3
export CODEVAULT_EMBEDDING_API_KEY=nebius-key
export CODEVAULT_EMBEDDING_BASE_URL=https://api.studio.nebius.com/v1
export CODEVAULT_EMBEDDING_MODEL=Qwen/Qwen3-Embedding-8B
export CODEVAULT_EMBEDDING_DIMENSIONS=4096

# Chat: OpenRouter + Claude
export CODEVAULT_CHAT_API_KEY=openrouter-key
export CODEVAULT_CHAT_BASE_URL=https://openrouter.ai/api/v1
export CODEVAULT_CHAT_MODEL=anthropic/claude-sonnet-4.5

# Reranking: Novita + Qwen3
export CODEVAULT_RERANK_API_URL=https://api.novita.ai/openai/v1/rerank
export CODEVAULT_RERANK_API_KEY=novita-key
export CODEVAULT_RERANK_MODEL=qwen/qwen3-reranker-8b
```

**Cost:** ~$5-20/month depending on usage

---

### Setup 2: Local - Privacy First

**Best for:** Privacy, development, no costs

```bash
# Embeddings: Ollama + Nomic
export CODEVAULT_EMBEDDING_BASE_URL=http://localhost:11434/v1
export CODEVAULT_EMBEDDING_MODEL=nomic-embed-text
export CODEVAULT_EMBEDDING_DIMENSIONS=768

# Chat: Ollama + Qwen2.5-Coder
export CODEVAULT_CHAT_BASE_URL=http://localhost:11434/v1
export CODEVAULT_CHAT_MODEL=qwen2.5-coder:7b
export CODEVAULT_CHAT_MAX_TOKENS=32000

# No reranking (local only)
```

**Cost:** Free (requires decent hardware)

---

### Setup 3: Hybrid - Balanced

**Best for:** Cost-conscious, balanced quality

```bash
# Embeddings: Ollama (local, free)
export CODEVAULT_EMBEDDING_BASE_URL=http://localhost:11434/v1
export CODEVAULT_EMBEDDING_MODEL=nomic-embed-text
export CODEVAULT_EMBEDDING_DIMENSIONS=768

# Chat: OpenRouter + Claude (cloud, best quality)
export CODEVAULT_CHAT_API_KEY=openrouter-key
export CODEVAULT_CHAT_BASE_URL=https://openrouter.ai/api/v1
export CODEVAULT_CHAT_MODEL=anthropic/claude-sonnet-4.5

# Reranking: Novita (cloud, improved relevance)
export CODEVAULT_RERANK_API_URL=https://api.novita.ai/openai/v1/rerank
export CODEVAULT_RERANK_API_KEY=novita-key
export CODEVAULT_RERANK_MODEL=qwen/qwen3-reranker-8b
```

**Cost:** ~$5-10/month

---

## 📊 Provider Comparison

### Embeddings

| Provider | Model | Dims | Context | Quality | Cost | Local |
|----------|-------|------|---------|---------|------|-------|
| **Nebius** | Qwen3-Embedding-8B | 4096 | 32K | ⭐⭐⭐⭐⭐ | $$ | ❌ |
| **OpenAI** | text-embedding-3-large | 3072 | 8K | ⭐⭐⭐⭐ | $$$ | ❌ |
| **OpenAI** | text-embedding-3-small | 1536 | 8K | ⭐⭐⭐ | $ | ❌ |
| **Ollama** | nomic-embed-text | 768 | 8K | ⭐⭐⭐ | Free | ✅ |

### Chat LLM

| Provider | Model | Context | Quality | Cost | Local |
|----------|-------|---------|---------|------|-------|
| **OpenRouter** | Claude Sonnet 4.5 | 200K | ⭐⭐⭐⭐⭐ | $$$ | ❌ |
| **OpenRouter** | GPT-4-Turbo | 128K | ⭐⭐⭐⭐ | $$$$ | ❌ |
| **OpenRouter** | Gemini Pro 1.5 | 1M | ⭐⭐⭐⭐ | $$ | ❌ |
| **Ollama** | qwen2.5-coder:7b | 32K | ⭐⭐⭐ | Free | ✅ |
| **Ollama** | llama3.1:8b | 128K | ⭐⭐⭐ | Free | ✅ |

### Reranking

| Provider | Model | Context | Quality | Cost |
|----------|-------|---------|---------|------|
| **Novita** | qwen3-reranker-8b | 32K | ⭐⭐⭐⭐⭐ | $ |
| **Cohere** | rerank-english-v3.0 | 4K | ⭐⭐⭐⭐ | $$ |

---

## 💡 Recommendations by Use Case

### Personal Projects
- **Embeddings:** Ollama (nomic-embed-text)
- **Chat:** Ollama (qwen2.5-coder:7b)
- **Reranking:** None or Novita
- **Cost:** Free to $5/month

### Professional Development
- **Embeddings:** Nebius (Qwen3-Embedding-8B)
- **Chat:** OpenRouter (Claude Sonnet 4.5)
- **Reranking:** Novita (qwen3-reranker-8b)
- **Cost:** $10-30/month

### Enterprise/Team
- **Embeddings:** Nebius or OpenAI
- **Chat:** OpenRouter (Claude Sonnet 4.5)
- **Reranking:** Novita
- **Cost:** $50-200/month

### Privacy-Critical
- **Embeddings:** Ollama (nomic-embed-text)
- **Chat:** Ollama (qwen2.5-coder:7b)
- **Reranking:** None
- **Cost:** Free (hardware cost)

---

## 🔧 Troubleshooting

### "API key invalid"
- Verify key is correct
- Check if key has credits/quota
- Ensure correct base URL

### "Rate limit exceeded"
- Reduce rate limits in config
- Wait before retrying
- Upgrade API tier

### "Model not found"
- Verify model name is exact
- Check provider documentation
- Ensure model is available in your region

### "Connection timeout"
- Check internet connection
- Verify base URL is correct
- Try increasing timeout

### Ollama not working
```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# Restart Ollama
systemctl restart ollama  # Linux
# Or restart Ollama app on macOS/Windows

# Pull model again
ollama pull nomic-embed-text
```

---

**Version:** 1.8.4
**Last Updated:** November 2025