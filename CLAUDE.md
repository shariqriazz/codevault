# CodeVault

AI-powered semantic code search using vector embeddings, hybrid retrieval, and symbol-aware ranking.

> **Sync:** Always keep AGENTS.md in sync by running `cp CLAUDE.md AGENTS.md` after changes.

## What This Is

TypeScript/Node.js CLI and MCP server for intelligent code indexing and search:
- Semantic search with 25+ language support via Tree-sitter
- Hybrid retrieval: Vector embeddings + BM25 via Reciprocal Rank Fusion
- Incremental indexing with Merkle tree change detection
- MCP integration for AI assistants

## Project Structure

```
src/
├── core/           # IndexerEngine, SearchService, batch processing
├── cli/            # 12 CLI commands (index, search, ask, watch, etc.)
├── mcp/            # MCP server handlers and tools
├── chunking/       # AST-based semantic chunking
├── providers/      # Embedding/chat providers (OpenAI-compatible)
├── ranking/        # Symbol boost, API reranking
├── search/         # BM25, hybrid fusion, scopes
├── database/       # SQLite storage layer
├── indexer/        # Merkle trees, incremental updates
├── synthesis/      # LLM answer generation
└── languages/      # Tree-sitter parsing rules
```

## Quick Reference

| Task | Command |
|------|---------|
| Build | `npm run build` |
| Test | `npm test` |
| Typecheck | `npm run build` (includes typecheck) |
| Install deps | `npm install --legacy-peer-deps` |
| Run CLI | `codevault <command>` |
| Run MCP | `codevault-mcp` |

## Code Standards

### TypeScript (Enforced by ESLint)
- No `any` type - use strict types everywhere
- Explicit return types on all functions including `Promise<T>` for async
- No unsafe operations: `@ts-ignore`, non-null assertions (`!`), unsafe casts
- Use async/await exclusively (no promise chains)

### Patterns
- Try/catch for async operations with meaningful error messages
- Parameterized queries for all SQL (prevent injection)
- Validate external inputs (API keys, file paths, queries)
- Never log API keys or secrets

## Documentation

For detailed information, read the relevant docs:

| Topic | Document |
|-------|----------|
| CLI commands | [docs/CLI.md](docs/CLI.md) |
| Configuration | [docs/CONFIGURATION.md](docs/CONFIGURATION.md) |
| Architecture | [docs/CORE-ARCHITECTURE.md](docs/CORE-ARCHITECTURE.md) |
| Search system | [docs/SEARCH_ARCHITECTURE.md](docs/SEARCH_ARCHITECTURE.md) |
| Chunking | [docs/CHUNKING.md](docs/CHUNKING.md) |
| Ranking | [docs/RANKING.md](docs/RANKING.md) |
| Providers | [docs/PROVIDERS.md](docs/PROVIDERS.md) |
| MCP integration | [docs/MCP_INTEGRATION.md](docs/MCP_INTEGRATION.md) |
| Incremental indexing | [docs/INCREMENTAL_INDEXING.md](docs/INCREMENTAL_INDEXING.md) |
| Database | [docs/DATABASE.md](docs/DATABASE.md) |
| Storage/Encryption | [docs/STORAGE.md](docs/STORAGE.md) |
| Synthesis | [docs/SYNTHESIS.md](docs/SYNTHESIS.md) |
| Context packs | [docs/CONTEXT_PACKS.md](docs/CONTEXT_PACKS.md) |
| Language support | [docs/LANGUAGE-SUPPORT.md](docs/LANGUAGE-SUPPORT.md) |
| Utilities | [docs/UTILITIES.md](docs/UTILITIES.md) |
| Full index | [docs/README.md](docs/README.md) |

## Key Implementation Details

When working on specific areas, refer to:

- **Indexing**: Stage-based pipeline (FileScanner → FileProcessor → Persist → Finalize). See `src/core/IndexerEngine.ts`
- **Search**: Hybrid fusion with 0.7 vector / 0.3 BM25 weights, RRF k=60. See `src/core/SearchService.ts`
- **Chunking**: 20% overlap for statement-level chunks, AST subdivision for large nodes. See `src/chunking/semantic-chunker.ts`
- **Batching**: 50 chunks/batch, 3 retries with exponential backoff. See `src/core/batch-indexer.ts`
- **Caching**: LRU limits - BM25: 10 indices, chunks: 1000 items. See `src/utils/simple-lru.ts`
- **Symbol boost**: Caps at 0.45, total scores never exceed 1.0. See `src/ranking/symbol-boost.ts`

## Entry Points

- **CLI**: `bin/codevault` → `src/cli.ts` → `src/cli/index.ts`
- **MCP**: `bin/codevault-mcp` → `src/mcp-server.ts`

## Configuration

Priority: Environment Variables > Project Config (`codevault.config.json`) > Global Config (`~/.codevault/config.json`) > Defaults

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for all options.
