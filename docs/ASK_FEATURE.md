# Ask Feature Guide

> LLM-synthesized answers to natural language questions about your codebase

## 🌟 Overview

The `ask` feature combines semantic search with LLM synthesis to provide natural language answers to questions about your codebase. It uses embeddings to find relevant code, optionally reranks results, and then uses a chat LLM to synthesize a coherent answer with code citations.

## 🚀 Quick Start

### CLI Usage

```bash
# Simple question
codevault ask "How does authentication work?"

# With reranking for better relevance
codevault ask "How do I add a new payment provider?" --reranker on

# Stream the response in real-time
codevault ask "Explain the database schema" --stream

# Complex question with multi-query breakdown
codevault ask "What are the main components and how do they interact?" --multi-query
```

### MCP Usage (Claude Desktop)

```
Use the ask_codebase tool with your question:

ask_codebase({
  question: "How does authentication work in this codebase?",
  reranker: "on",
  max_chunks: 10
})
```

## 📋 How It Works

```
User Question
    ↓
1. Multi-Query Breakdown (optional)
   "How does auth work?" → ["auth middleware", "session management", "user login"]
    ↓
2. Semantic Search (embeddings + BM25)
   Find most relevant code chunks
    ↓
3. Reranking (optional)
   Improve relevance with API reranker (Qwen3-Reranker-8B)
    ↓
4. Code Retrieval
   Get full code for top N chunks
    ↓
5. LLM Synthesis (Claude Sonnet 4.5)
   Generate natural language answer
    ↓
6. Formatted Markdown
   Answer with citations and code blocks
```

## ⚙️ Configuration

### Environment Variables

```bash
# Chat LLM Configuration (OpenRouter + Claude)
export CODEVAULT_CHAT_API_KEY=your-openrouter-api-key
export CODEVAULT_CHAT_BASE_URL=https://openrouter.ai/api/v1
export CODEVAULT_CHAT_MODEL=anthropic/claude-sonnet-4.5
export CODEVAULT_CHAT_MAX_TOKENS=32000
export CODEVAULT_CHAT_TEMPERATURE=0.1

# Ollama (Local Alternative)
export CODEVAULT_CHAT_BASE_URL=http://localhost:11434/v1
export CODEVAULT_CHAT_MODEL=qwen2.5-coder:7b
export CODEVAULT_CHAT_MAX_TOKENS=32000

# Reranking (Novita + Qwen)
export CODEVAULT_RERANK_API_URL=https://api.novita.ai/openai/v1/rerank
export CODEVAULT_RERANK_API_KEY=your-novita-api-key
export CODEVAULT_RERANK_MODEL=qwen/qwen3-reranker-8b
```

### Config File

```json
{
  "chatLLM": {
    "openai": {
      "apiKey": "your-openrouter-api-key",
      "baseUrl": "https://openrouter.ai/api/v1",
      "model": "anthropic/claude-sonnet-4.5",
      "maxTokens": 32000,
      "temperature": 0.1
    }
  },
  "reranker": {
    "apiUrl": "https://api.novita.ai/openai/v1/rerank",
    "apiKey": "your-novita-api-key",
    "model": "qwen/qwen3-reranker-8b"
  }
}
```

## 🎯 CLI Command Reference

### Basic Usage

```bash
codevault ask <question> [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --provider <name>` | Embedding provider (auto\|openai\|ollama) | auto |
| `-c, --chat-provider <name>` | Chat LLM provider (auto\|openai\|ollama) | auto |
| `--path <path>` | Project root directory | . |
| `-k, --max-chunks <num>` | Max code chunks to analyze | 10 |
| `--path_glob <pattern...>` | Filter by file pattern | - |
| `--tags <tag...>` | Filter by tags | - |
| `--lang <language...>` | Filter by language | - |
| `--reranker <on\|off>` | Use API reranking | on |
| `--multi-query` | Break complex questions into sub-queries | false |
| `--temperature <num>` | LLM temperature (0-2) | 0.7 |
| `--stream` | Stream response in real-time | false |
| `--citations` | Add citation footer | false |
| `--no-metadata` | Hide search metadata | false |

## 💡 Example Questions

### Understanding Code Flow

```bash
codevault ask "How does user authentication work in this codebase?"
codevault ask "What happens when a user makes a payment?"
codevault ask "Walk me through the request lifecycle"
```

### Finding Implementations

```bash
codevault ask "How is error handling implemented?"
codevault ask "Where is logging configured?"
codevault ask "How are database migrations handled?"
```

### Architecture Questions

```bash
codevault ask "What are the main components of this system?"
codevault ask "How do the frontend and backend communicate?"
codevault ask "What design patterns are used here?"
```

### Adding Features

```bash
codevault ask "How do I add a new API endpoint?"
codevault ask "What's the process for adding a new payment provider?"
codevault ask "How can I extend the authentication system?"
```

### With Filters

```bash
# Focus on specific files
codevault ask "How does authentication work?" --path_glob "src/auth/**"

# Focus on specific language
codevault ask "What are the Python utilities?" --lang python

# Focus on tagged code
codevault ask "How is Stripe integrated?" --tags stripe
```

## 📊 Advanced Features

### Multi-Query Breakdown

For complex questions, use `--multi-query` to automatically break them into focused sub-queries:

```bash
codevault ask "What are the main components and how do they interact?" --multi-query
```

This breaks the question into:
1. "main application components"
2. "component dependencies"
3. "component communication patterns"

Then searches for each and synthesizes a comprehensive answer.

### Streaming Responses

Get real-time responses for better UX:

```bash
codevault ask "Explain the caching strategy" --stream
```

### Custom Temperature

Control LLM creativity vs precision:

```bash
# More precise (good for factual questions)
codevault ask "What is the database schema?" --temperature 0.3

# More creative (good for suggestions)
codevault ask "How could I improve error handling?" --temperature 1.0
```

### Reranking for Better Results

Enable API reranking to improve relevance by 5-10%:

```bash
codevault ask "How does the payment flow work?" --reranker on
```

## 🔧 MCP Tool Reference

### Tool: `ask_codebase`

**Description:** Ask questions and get LLM-synthesized answers with code citations

**Parameters:**

```typescript
{
  question: string;           // Required: Your question
  provider?: string;          // Embedding provider (default: "auto")
  chat_provider?: string;     // Chat LLM provider (default: "auto")
  path?: string;              // Project path (default: ".")
  max_chunks?: number;        // Max chunks to analyze (default: 10)
  path_glob?: string[];       // File patterns
  tags?: string[];            // Filter by tags
  lang?: string[];            // Filter by language
  reranker?: "on" | "off";    // Use reranking (default: "on")
  multi_query?: boolean;      // Multi-query breakdown (default: false)
  temperature?: number;       // LLM temperature 0-2 (default: 0.7)
}
```

**Example Response:**

```markdown
---
**Search Metadata**

- Search Type: hybrid
- Embedding Provider: OpenAI (Qwen3-Embedding-8B)
- Chat Provider: OpenAI-Chat (Claude Sonnet 4.5)
- Chunks Analyzed: 5
- Reranking: Enabled (Qwen3-Reranker-8B)

---

# How Authentication Works

The authentication system uses a middleware-based approach with JWT tokens...

## Middleware Implementation

The main authentication middleware is in [`src/auth/middleware.ts`](src/auth/middleware.ts:45):

```typescript
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

## Session Management

Sessions are managed in [`src/auth/session.ts`](src/auth/session.ts:12) using Redis for distributed caching...

---

_Generated using CodeVault semantic search + LLM synthesis_
```

## 🎨 Response Format

Responses are formatted in clean markdown with:

- **Clear sections and headings**
- **Code blocks** with syntax highlighting
- **File citations** as clickable links: `[filename.ext](filename.ext:line)`
- **Bullet points** for clarity
- **Bold/italic** for emphasis
- **Metadata section** (optional) with search details

## 🔍 Behind the Scenes

### 1. Query Analysis

If `--multi-query` is enabled and the question is complex, the system:
- Uses LLM to break down the question
- Generates 2-4 focused sub-queries
- Searches for each independently

### 2. Code Search

- Performs semantic search using Qwen3-Embedding-8B (4096 dims, 32K context)
- Applies BM25 keyword matching (hybrid search)
- Boosts results based on symbol matches
- Optionally reranks with Qwen3-Reranker-8B (32K context)

### 3. Context Building

- Retrieves code for top N chunks
- Builds structured context with metadata
- Includes file paths, symbols, relevance scores
- Truncates long code chunks appropriately

### 4. LLM Synthesis

- Sends system prompt (expert code analyst role)
- Includes all code context and metadata
- Generates natural language answer using Claude Sonnet 4.5
- Maintains code citations and formatting

## 💡 Best Practices

### Writing Good Questions

✅ **Good:**
- "How does authentication work in this codebase?"
- "What's the database connection pooling strategy?"
- "How do I add a new API endpoint?"

❌ **Too vague:**
- "Tell me about this code"
- "What does this do?"
- "Explain everything"

### Optimizing Results

1. **Use filters** to narrow scope: `--tags`, `--lang`, `--path_glob`
2. **Enable reranking** for better relevance: `--reranker on`
3. **Adjust chunk count** based on question complexity: `--max-chunks 15`
4. **Use multi-query** for complex questions: `--multi-query`
5. **Lower temperature** for factual questions: `--temperature 0.3`

### Provider Selection

**OpenRouter + Claude (Recommended):**
- Best quality responses
- Claude Sonnet 4.5 for superior code understanding
- Requires API key
- Use for production

**Ollama (Local):**
- Free, no API costs
- qwen2.5-coder:7b, llama3.1 recommended
- Privacy-focused
- Good for development

## 🐛 Troubleshooting

### "No relevant code found"

- Ensure project is indexed: `codevault index`
- Try more specific technical terms
- Check if code exists in indexed files
- Try broader search with fewer filters

### "Chat API error"

- Verify `CODEVAULT_CHAT_API_KEY` is set
- Check `CODEVAULT_CHAT_BASE_URL` is correct
- Ensure chat model is available
- Check rate limits

### Low quality answers

- Increase `--max-chunks` for more context
- Enable `--reranker on` for better relevance
- Try `--multi-query` for complex questions
- Adjust `--temperature` (lower = more focused)

### Responses too long/short

- Adjust `CODEVAULT_CHAT_MAX_TOKENS`
- Change `--max-chunks` to control context
- Use more specific questions

### Reranking errors

- Verify `CODEVAULT_RERANK_API_KEY` is set
- Check `CODEVAULT_RERANK_API_URL` is correct
- Ensure Novita API key has credits
- Try disabling: `--reranker off`

## 📚 Examples by Use Case

### Code Review

```bash
codevault ask "Are there any security concerns in the authentication code?" \
  --tags auth,security \
  --temperature 0.5 \
  --reranker on
```

### Onboarding

```bash
codevault ask "What are the main entry points of this application?" \
  --multi-query \
  --max-chunks 15 \
  --stream
```

### Feature Planning

```bash
codevault ask "How would I add email notifications to this system?" \
  --temperature 0.8 \
  --stream
```

### Debugging

```bash
codevault ask "Where could the memory leak be coming from?" \
  --tags performance,memory \
  --reranker on \
  --max-chunks 12
```

### Documentation

```bash
codevault ask "Explain the API endpoints available in this service" \
  --path_glob "src/routes/**" \
  --citations
```

## 🔮 Tips & Tricks

### 1. Combine Multiple Filters

```bash
codevault ask "How is Stripe checkout implemented?" \
  --tags stripe,payment \
  --lang typescript,javascript \
  --path_glob "src/payments/**"
```

### 2. Use Streaming for Long Answers

```bash
codevault ask "Explain the entire authentication flow from login to logout" \
  --stream \
  --max-chunks 20
```

### 3. Adjust Temperature Based on Task

```bash
# Factual (temperature 0.1-0.3)
codevault ask "What database is being used?" --temperature 0.1

# Balanced (temperature 0.5-0.7)
codevault ask "How does caching work?" --temperature 0.7

# Creative (temperature 0.8-1.2)
codevault ask "How could I improve performance?" --temperature 1.0
```

### 4. Multi-Query for Comprehensive Answers

```bash
codevault ask "What are all the payment integrations and how do they work?" \
  --multi-query \
  --max-chunks 20 \
  --reranker on
```

## 🌟 Recommended Models

### Embeddings
- **Nebius + Qwen3-Embedding-8B** (4096 dims, 32K context) - Best quality
- **Ollama + nomic-embed-text** (768 dims, 8K context) - Local option

### Chat LLM
- **OpenRouter + Claude Sonnet 4.5** (200K context) - Best code understanding
- **Ollama + qwen2.5-coder:7b** (32K context) - Code-specialized local

### Reranking
- **Novita + Qwen3-Reranker-8B** (32K context) - Best for code

---

**Version:** 1.8.4
**Last Updated:** November 2025