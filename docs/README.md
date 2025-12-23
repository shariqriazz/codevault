# CodeVault Documentation

**Version:** 1.8.5

Welcome to the CodeVault documentation. CodeVault is an AI-powered semantic code search system that enables intelligent code indexing, searching, and querying using vector embeddings and hybrid retrieval techniques.

This index provides an overview of all available documentation and guidance on which documents to read based on your needs.

---

## Quick Navigation

| Goal | Start Here |
|------|------------|
| Get started quickly | [CLI Reference](CLI.md) |
| Set up API keys and providers | [Configuration](CONFIGURATION.md) |
| Integrate with Claude Desktop | [MCP Integration](MCP_INTEGRATION.md) |
| Understand the system architecture | [Core Architecture](CORE-ARCHITECTURE.md) |

---

## Getting Started

If you are new to CodeVault, we recommend reading the documentation in this order:

1. **[CLI Reference](CLI.md)** - Installation, quick start, and all available commands
2. **[Configuration](CONFIGURATION.md)** - Set up your API keys, providers, and project settings
3. **[Providers](PROVIDERS.md)** - Configure embedding and chat LLM providers (OpenAI, Ollama, etc.)

---

## Documentation Index

### Core Usage

These documents cover the primary features and day-to-day usage of CodeVault.

| Document | Description |
|----------|-------------|
| [CLI.md](CLI.md) | Complete command-line interface reference with all 12 commands including `index`, `search`, `ask`, `chat`, `watch`, and configuration management. |
| [CONFIGURATION.md](CONFIGURATION.md) | Configuration hierarchy (environment variables, project config, global config), all available options, and example configurations for various deployment scenarios. |
| [CONTEXT_PACKS.md](CONTEXT_PACKS.md) | Save and reuse search scopes for different features, modules, or workflows. Create filtered search defaults for specific parts of your codebase. |

### Search and Ranking

These documents explain how CodeVault finds and ranks code results.

| Document | Description |
|----------|-------------|
| [SEARCH_ARCHITECTURE.md](SEARCH_ARCHITECTURE.md) | Complete search pipeline documentation: BM25 keyword search, hybrid fusion with Reciprocal Rank Fusion (RRF), scope filtering, and caching strategies. |
| [RANKING.md](RANKING.md) | Multi-stage ranking pipeline including hybrid search, symbol boosting (signature/parameter matching), and API-based reranking with Cohere, Jina, or Novita. |

### LLM and Synthesis

These documents cover the AI-powered question answering capabilities.

| Document | Description |
|----------|-------------|
| [SYNTHESIS.md](SYNTHESIS.md) | LLM synthesis system for natural language Q&A. Covers the `ask` and `chat` commands, multi-query decomposition, prompt security, and response formatting with citations. |
| [PROVIDERS.md](PROVIDERS.md) | Embedding and chat LLM provider configuration. Covers OpenAI, Ollama, Nebius, OpenRouter, model profiles, token counting, and rate limiting. |

### Indexing and Storage

These documents explain how CodeVault indexes and stores code.

| Document | Description |
|----------|-------------|
| [CORE-ARCHITECTURE.md](CORE-ARCHITECTURE.md) | Comprehensive documentation of the core indexing and search systems. Covers the stage-based indexing pipeline (FileScanner, FileProcessor, Persist, Finalize) and search orchestration. |
| [CHUNKING.md](CHUNKING.md) | Intelligent code chunking system using AST-based semantic analysis. Covers Tree-sitter integration, subdivision strategies, token counting, and chunk grouping for optimal embedding. |
| [INCREMENTAL_INDEXING.md](INCREMENTAL_INDEXING.md) | Incremental indexing with Merkle tree change detection. Covers the file watcher, change queue, debounced updates, and provider reuse for efficient re-indexing. |
| [DATABASE.md](DATABASE.md) | SQLite storage layer documentation. Covers the schema, binary embedding storage, performance optimization (WAL mode, cache tuning), and API reference. |
| [STORAGE.md](STORAGE.md) | Code chunk storage and optional AES-256-GCM encryption. Covers key generation, encryption configuration, key rotation, and the encrypted payload format. |

### Language Support

| Document | Description |
|----------|-------------|
| [LANGUAGE-SUPPORT.md](LANGUAGE-SUPPORT.md) | Multi-language support with Tree-sitter. Lists all 25+ supported languages, explains the language rule configuration, and provides guidance on adding new languages. |

### Integration

| Document | Description |
|----------|-------------|
| [MCP_INTEGRATION.md](MCP_INTEGRATION.md) | Model Context Protocol (MCP) server documentation. Covers all available MCP tools (`search_code`, `ask_codebase`, `index_project`, etc.), configuration for Claude Desktop, and session state management. |

### Utilities and Reference

| Document | Description |
|----------|-------------|
| [UTILITIES.md](UTILITIES.md) | Utility module reference including rate limiting, LRU caching, mutex/semaphore concurrency control, logging with secret redaction, and CLI progress UI. |

---

## Document Categories by Use Case

### For Users

- [CLI.md](CLI.md) - How to use CodeVault from the command line
- [CONFIGURATION.md](CONFIGURATION.md) - How to configure CodeVault
- [CONTEXT_PACKS.md](CONTEXT_PACKS.md) - How to create reusable search scopes

### For AI Assistant Integrators

- [MCP_INTEGRATION.md](MCP_INTEGRATION.md) - Set up CodeVault as an MCP server for Claude Desktop
- [SYNTHESIS.md](SYNTHESIS.md) - Understand the Q&A synthesis capabilities

### For Developers Extending CodeVault

- [CORE-ARCHITECTURE.md](CORE-ARCHITECTURE.md) - Understand the internal architecture
- [SEARCH_ARCHITECTURE.md](SEARCH_ARCHITECTURE.md) - Understand the search pipeline
- [CHUNKING.md](CHUNKING.md) - Understand the code chunking system
- [LANGUAGE-SUPPORT.md](LANGUAGE-SUPPORT.md) - Add support for new languages
- [PROVIDERS.md](PROVIDERS.md) - Understand the provider abstraction
- [UTILITIES.md](UTILITIES.md) - Use the utility modules

### For Operations and Deployment

- [CONFIGURATION.md](CONFIGURATION.md) - Production configuration examples
- [STORAGE.md](STORAGE.md) - Encryption setup for sensitive codebases
- [DATABASE.md](DATABASE.md) - Database tuning and optimization
- [INCREMENTAL_INDEXING.md](INCREMENTAL_INDEXING.md) - Efficient re-indexing strategies

---

## Key Concepts

### Semantic Code Search

CodeVault uses vector embeddings to enable semantic code search. Unlike traditional keyword search, semantic search understands the meaning behind your queries. For example, searching for "authentication middleware" will find relevant code even if it does not contain those exact words.

### Hybrid Search

CodeVault combines two search approaches:
- **Vector search** (70% weight by default) - Semantic similarity using embeddings
- **BM25 keyword search** (30% weight by default) - Traditional keyword matching

Results are combined using Reciprocal Rank Fusion (RRF) for optimal ranking.

### Symbol Boosting

Search results are boosted when query terms match:
- Function and method names
- Parameter names
- Related symbols (callers/callees from the symbol graph)

### Context Packs

Context packs are reusable search configurations that let you focus on specific parts of your codebase (e.g., "only backend code" or "only test files").

---

## Related Resources

- **[CLAUDE.md](../CLAUDE.md)** - Project overview, architecture summary, and code standards (located in the project root)
- **GitHub Repository** - [https://github.com/shariqriazz/codevault](https://github.com/shariqriazz/codevault)

---

## Version History

| Version | Notable Changes |
|---------|-----------------|
| 1.8.5 | Current version. Comprehensive documentation updates. |

---

*Last Updated: December 2025*
