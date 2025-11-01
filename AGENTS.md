# CodeVault - AI-Powered Semantic Code Search

CodeVault is an intelligent code indexing and search system that enables AI assistants to understand and navigate codebases using semantic search, symbol-aware ranking, and hybrid retrieval techniques.

## Project Overview

This is a TypeScript/Node.js project that provides:
- **Semantic code search** using vector embeddings
- **MCP (Model Context Protocol)** integration for AI assistants
- **Symbol-aware ranking** for better code understanding
- **Hybrid retrieval** combining vector and BM25 search
- **CLI and MCP server** for flexible usage

## Architecture

### Core Components

- `src/core/` - Core indexing and search functionality
  - `indexer.ts` - Code indexing with Tree-sitter parsing
  - `search.ts` - Hybrid search with vector + BM25
  - `symbol-extractor.ts` - Extract functions, classes, types
  - `batch-indexer.ts` - Efficient batch embedding generation

- `src/mcp/` - Model Context Protocol server
  - `tools/ask-codebase.ts` - LLM-synthesized Q&A tool
  - `tools/use-context-pack.ts` - Context management

- `src/synthesis/` - LLM answer generation
  - `synthesizer.ts` - Generate natural language answers
  - `prompt-builder.ts` - Build context-aware prompts
  - `markdown-formatter.ts` - Format responses with citations

- `src/chunking/` - Smart code chunking
  - `semantic-chunker.ts` - Token-aware semantic splitting
  - `file-grouper.ts` - Group related files

- `src/providers/` - LLM provider integrations
  - `openai.ts` - OpenAI-compatible API client
  - `chat-llm.ts` - Chat model abstraction

## Code Standards

### TypeScript Guidelines
- Use strict TypeScript with proper types (no `any` unless absolutely necessary)
- Prefer interfaces for public APIs, types for internal use
- Use async/await over promises
- Export types alongside implementations

### Error Handling
- Use try/catch for async operations
- Provide meaningful error messages with context
- Log errors with appropriate severity levels

### Testing
- Write tests for core functionality
- Use descriptive test names
- Mock external dependencies (APIs, file system)

### Dependencies
- Minimize external dependencies
- Prefer well-maintained packages
- Use exact versions for critical dependencies

## GitHub PR Review Guidelines

When reviewing pull requests, focus on:

### Code Quality
- **Type Safety**: Ensure proper TypeScript types, no unsafe casts
- **Error Handling**: Check for proper error handling in async operations
- **Performance**: Look for inefficient algorithms, unnecessary iterations
- **Memory Management**: Check for potential memory leaks (unclosed streams, large caches)

### Architecture
- **Separation of Concerns**: Each module should have a single responsibility
- **API Design**: Public APIs should be intuitive and well-documented
- **Extensibility**: Code should be easy to extend without modification

### Security
- **Input Validation**: Validate all external inputs (API keys, file paths, queries)
- **Injection Prevention**: Sanitize inputs used in SQL, shell commands, or prompts
- **Secrets Management**: Never hardcode API keys or sensitive data

### Testing
- **Coverage**: New features should include tests
- **Edge Cases**: Test error conditions and boundary cases
- **Integration**: Test interactions between components

### Documentation
- **Code Comments**: Complex logic should be explained
- **API Documentation**: Public functions need JSDoc comments
- **README Updates**: Update docs if behavior changes

### Specific to CodeVault
- **Embedding Quality**: Changes to chunking should preserve semantic meaning
- **Search Relevance**: Ranking changes should improve result quality
- **MCP Compatibility**: Ensure MCP tools follow protocol standards
- **Rate Limiting**: Respect API rate limits and add throttling where needed

## Common Patterns

### Embedding Generation
```typescript
// Always use batch indexer for efficiency
const batchIndexer = new BatchIndexer(provider, batchSize);
const embeddings = await batchIndexer.generateEmbeddings(chunks);
```

### Search Implementation
```typescript
// Use hybrid search for best results
const results = await hybridSearch(query, {
  vectorWeight: 0.7,
  bm25Weight: 0.3,
  symbolBoost: true,
  reranker: config.reranker
});
```

### Error Handling
```typescript
// Provide context in errors
try {
  await indexProject(path);
} catch (error) {
  throw new Error(`Failed to index project at ${path}: ${error.message}`);
}
```

## Development Workflow

1. **Local Testing**: Test changes locally before pushing
2. **Type Checking**: Run `npm run build` to check for type errors
3. **Formatting**: Code should follow project style (use prettier/eslint)
4. **Commits**: Use descriptive commit messages
5. **PRs**: Keep PRs focused on a single feature/fix

## Configuration

The project supports multiple configuration methods:
- Environment variables (highest priority)
- Project config (`codevault.config.json`)
- Global config (`~/.codevault/config.json`)
- Defaults (lowest priority)

See `docs/CONFIGURATION.md` for complete details.

## Important Notes for AI Reviewers

- **Context is Key**: Always read related files to understand the full impact of changes
- **Ask Questions**: If something is unclear, ask the PR author for clarification
- **Be Constructive**: Suggest improvements with examples
- **Consider Tradeoffs**: Balance code quality with pragmatism
- **Check Dependencies**: Verify that new dependencies are necessary and well-maintained
