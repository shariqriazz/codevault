# CodeVault Ask Feature

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
   Improve relevance with API reranker
    ↓
4. Code Retrieval
   Get full code for top N chunks
    ↓
5. LLM Synthesis
   Generate natural language answer
    ↓
6. Formatted Markdown
   Answer with citations and code blocks
```

## ⚙️ Configuration

### Environment Variables

```bash
# Chat LLM Configuration
CODEVAULT_CHAT_API_KEY=your-api-key              # API key for chat LLM
CODEVAULT_CHAT_BASE_URL=https://api.openai.com/v1  # Chat API endpoint
CODEVAULT_CHAT_MODEL=gpt-4o                      # Chat model name
CODEVAULT_CHAT_MAX_TOKENS=4096                   # Max tokens in response
CODEVAULT_CHAT_TEMPERATURE=0.7                   # LLM temperature (0-2)

# Ollama Chat (local alternative)
CODEVAULT_OLLAMA_CHAT_MODEL=llama3.1             # Local chat model

# Can reuse embedding API credentials
# If CODEVAULT_CHAT_* not set, falls back to OPENAI_* or embedding vars
```

### Config File

```json
{
  "chatLLM": {
    "openai": {
      "apiKey": "sk-...",
      "baseUrl": "https://api.openai.com/v1",
      "model": "gpt-4o",
      "maxTokens": 4096,
      "temperature": 0.7
    },
    "ollama": {
      "model": "llama3.1"
    }
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
- Embedding Provider: OpenAI
- Chat Provider: OpenAI-Chat
- Chunks Analyzed: 5

---

# How Authentication Works

The authentication system uses a middleware-based approach with JWT tokens...

[Full synthesized answer with code citations]

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

- Performs semantic search using embeddings
- Applies BM25 keyword matching (hybrid search)
- Boosts results based on symbol matches
- Optionally reranks with API reranker

### 3. Context Building

- Retrieves code for top N chunks
- Builds structured context with metadata
- Includes file paths, symbols, relevance scores
- Truncates long code chunks appropriately

### 4. LLM Synthesis

- Sends system prompt (expert code analyst role)
- Includes all code context and metadata
- Generates natural language answer
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

**OpenAI (Cloud):**
- Best quality responses
- GPT-4o, GPT-4-turbo recommended
- Requires API key
- Use for production

**Ollama (Local):**
- Free, no API costs
- llama3.1, mistral recommended
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

## 🔮 Future Enhancements

Planned features:
- [ ] Conversation history (follow-up questions)
- [ ] Code generation suggestions
- [ ] Diff generation for feature additions
- [ ] Multiple LLM provider support (Anthropic, etc.)
- [ ] Custom system prompts
- [ ] Response caching
- [ ] Interactive mode

## 📚 Examples by Use Case

### Code Review

```bash
codevault ask "Are there any security concerns in the authentication code?" \
  --tags auth,security \
  --temperature 0.5
```

### Onboarding

```bash
codevault ask "What are the main entry points of this application?" \
  --multi-query \
  --max-chunks 15
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
  --reranker on
```

### Documentation

```bash
codevault ask "Explain the API endpoints available in this service" \
  --path_glob "src/routes/**" \
  --citations
```

---

**Version:** 1.3.0+  
**Status:** Experimental (exp-llm-synthesize branch)  
**Last Updated:** January 2025