# Context Packs Guide

> Save and reuse search scopes for different features, modules, or workflows

**Version:** 1.8.5

## Overview

Context packs are reusable search configurations that define default scope filters for CodeVault operations. They allow you to:

- Focus searches on specific parts of your codebase (e.g., only backend code, only tests)
- Save commonly used filter combinations for quick access
- Share search scopes across CLI and MCP sessions
- Override individual settings per search while keeping pack defaults

Context packs apply to all search-related operations:
- `codevault search` and `codevault search-with-code`
- `codevault ask` and `codevault chat`
- MCP tools: `search_code`, `search_code_with_chunks`, `ask_codebase`

## Quick Start

### 1. Create a Context Pack

Create a JSON file in `.codevault/contextpacks/` directory:

```bash
mkdir -p .codevault/contextpacks
```

Create `.codevault/contextpacks/backend.json`:

```json
{
  "name": "Backend Services",
  "description": "Focus on server-side code only",
  "path_glob": ["src/api/**", "src/services/**", "src/database/**"],
  "lang": ["typescript", "javascript"],
  "tags": ["backend", "api"]
}
```

### 2. Activate the Pack

```bash
# Activate for all searches in this project
codevault context use backend

# Now searches use the pack's filters by default
codevault search "database connection"
```

### 3. List Available Packs

```bash
codevault context list
```

Output:
```
Context packs in /path/to/project:
  - api-endpoints (API Endpoints) - REST API routes and controllers
  * backend (Backend Services) - Focus on server-side code only
  - frontend (Frontend Components) - React components and hooks

Active: backend (Backend Services)
```

## Context Pack Schema

### File Location

Context packs are stored in:
```
<project-root>/.codevault/contextpacks/<name>.json
```

The filename (without `.json`) becomes the pack's **key** used in CLI and MCP commands.

### Full Schema

```json
{
  "name": "Display Name",
  "description": "Human-readable description",
  "metadata": {
    "author": "Your Name",
    "version": "1.0.0",
    "custom_field": "any value"
  },
  "scope": {
    "path_glob": ["src/**/*.ts", "!src/**/*.test.ts"],
    "tags": ["production", "core"],
    "lang": ["typescript", "javascript"],
    "provider": "openai",
    "reranker": "api",
    "hybrid": true,
    "bm25": true,
    "symbol_boost": true
  }
}
```

### Alternative Format (Flat)

Scope options can be defined at the top level instead of nested:

```json
{
  "name": "Test Suite",
  "description": "Focus on test files",
  "path_glob": "**/*.test.ts",
  "lang": "typescript",
  "hybrid": "on"
}
```

Both formats are equivalent. Top-level scope options override nested `scope` options.

### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name shown in listings (defaults to filename) |
| `description` | string | Human-readable description |
| `metadata` | object | Optional custom metadata (ignored by CodeVault) |
| `path_glob` | string or string[] | Glob patterns to filter files |
| `tags` | string or string[] | CodeVault tags to filter by |
| `lang` | string or string[] | Programming languages to include |
| `provider` | string | Embedding provider override (`openai`, `auto`) |
| `reranker` | `"off"` or `"api"` | Reranking mode |
| `hybrid` | boolean or string | Enable hybrid search (`true`, `"on"`, `"off"`) |
| `bm25` | boolean or string | Enable BM25 keyword matching |
| `symbol_boost` | boolean or string | Enable symbol-aware ranking |

### Glob Pattern Examples

```json
{
  "path_glob": [
    "src/**/*.ts",
    "!src/**/*.test.ts",
    "lib/**",
    "**/*.{js,jsx,ts,tsx}"
  ]
}
```

Pattern syntax follows [micromatch](https://github.com/micromatch/micromatch):
- `*` matches any characters except path separators
- `**` matches any characters including path separators
- `!pattern` excludes matching files
- `{a,b}` matches either `a` or `b`
- `[abc]` matches any character in brackets

## CLI Commands

### List Packs

```bash
# List all packs in current project
codevault context list

# List packs in specific project
codevault context list /path/to/project
```

Output format:
```
Context packs in /path/to/project:
  - pack-key (Display Name) - Description
  * active-pack (Active Pack) - Currently active pack
  - invalid-pack (invalid) - Error message if pack failed to load

Active: active-pack (Active Pack)
```

### Show Pack Details

```bash
# View pack definition as JSON
codevault context show backend

# Show pack from specific project
codevault context show backend /path/to/project
```

Output:
```json
{
  "key": "backend",
  "name": "Backend Services",
  "description": "Focus on server-side code only",
  "scope": {
    "path_glob": ["src/api/**", "src/services/**"],
    "lang": ["typescript", "javascript"]
  }
}
```

### Activate a Pack

```bash
# Activate pack for all subsequent searches
codevault context use backend

# Activate pack for specific project
codevault context use backend /path/to/project
```

Output:
```
Activated context pack: backend
Display name: Backend Services
Description: Focus on server-side code only
Default scope:
  path_glob: src/api/**, src/services/**
  lang: typescript, javascript
```

### Override Pack Settings

Command-line options override active pack settings:

```bash
# Pack has lang: ["typescript"], but search all languages
codevault search "error handling" --lang all

# Pack has path_glob, but add additional filter
codevault search "authentication" --tags auth
```

## MCP Integration

### use_context_pack Tool

Activate a context pack for the MCP session:

```json
{
  "name": "use_context_pack",
  "arguments": {
    "name": "backend",
    "path": "/path/to/project"
  }
}
```

Response:
```
Context pack "backend" activated for session

Scope: {
  "path_glob": ["src/api/**", "src/services/**"],
  "lang": ["typescript", "javascript"]
}
```

### Clear Active Pack

Use special names to clear the session pack:

```json
{
  "name": "use_context_pack",
  "arguments": {
    "name": "clear"
  }
}
```

Valid clear values: `"clear"`, `"none"`, `"default"`

### Session vs Persistent

| Method | Scope | Persistence |
|--------|-------|-------------|
| CLI `context use` | Project-wide | Persists in `.codevault/contextpacks/active-pack.json` |
| MCP `use_context_pack` | Session only | Cleared when MCP server restarts |

MCP session packs take priority over CLI-activated packs for the same project.

## Example Packs

### API Backend

`.codevault/contextpacks/api.json`:
```json
{
  "name": "API Layer",
  "description": "REST API routes, controllers, and middleware",
  "path_glob": [
    "src/api/**",
    "src/routes/**",
    "src/controllers/**",
    "src/middleware/**"
  ],
  "lang": ["typescript", "javascript"],
  "tags": ["api", "http"],
  "symbol_boost": true
}
```

### Database Layer

`.codevault/contextpacks/database.json`:
```json
{
  "name": "Database",
  "description": "Database models, migrations, and queries",
  "path_glob": [
    "src/database/**",
    "src/models/**",
    "prisma/**",
    "drizzle/**"
  ],
  "lang": ["typescript", "sql"],
  "tags": ["database", "orm"]
}
```

### Test Suite

`.codevault/contextpacks/tests.json`:
```json
{
  "name": "Test Suite",
  "description": "Unit and integration tests",
  "path_glob": [
    "**/*.test.ts",
    "**/*.spec.ts",
    "**/tests/**",
    "**/__tests__/**"
  ],
  "lang": ["typescript", "javascript"],
  "tags": ["test", "spec"]
}
```

### Frontend Components

`.codevault/contextpacks/frontend.json`:
```json
{
  "name": "Frontend",
  "description": "React components and hooks",
  "path_glob": [
    "src/components/**",
    "src/hooks/**",
    "src/pages/**",
    "app/**"
  ],
  "lang": ["typescript", "tsx", "javascript", "jsx"],
  "tags": ["frontend", "react", "ui"]
}
```

### Production Code Only

`.codevault/contextpacks/production.json`:
```json
{
  "name": "Production Code",
  "description": "Exclude tests, fixtures, and development files",
  "path_glob": [
    "src/**",
    "!src/**/*.test.ts",
    "!src/**/*.spec.ts",
    "!src/**/__tests__/**",
    "!src/**/__mocks__/**",
    "!src/**/fixtures/**"
  ],
  "lang": ["typescript", "javascript"],
  "hybrid": true,
  "symbol_boost": true,
  "reranker": "api"
}
```

### Stripe Integration

`.codevault/contextpacks/stripe.json`:
```json
{
  "name": "Stripe Integration",
  "description": "Payment processing and Stripe API code",
  "path_glob": [
    "src/payments/**",
    "src/billing/**",
    "src/stripe/**"
  ],
  "tags": ["stripe", "payments", "billing"]
}
```

## How Scope Resolution Works

When you run a search command, CodeVault resolves scope filters in this order:

1. **Command-line options** (highest priority)
2. **MCP session pack** (if running via MCP)
3. **CLI-activated pack** (if set via `context use`)
4. **Built-in defaults** (lowest priority)

### Resolution Example

Given:
- Active pack: `backend` with `lang: ["typescript"]`, `hybrid: true`
- Command: `codevault search "auth" --lang javascript`

Result:
- `lang: ["javascript"]` (from command line, overrides pack)
- `hybrid: true` (from pack, not overridden)
- Other options use pack or built-in defaults

## File Storage

### Directory Structure

```
<project-root>/
  .codevault/
    contextpacks/
      active-pack.json      # Tracks currently active pack
      backend.json          # Custom pack
      frontend.json         # Custom pack
      tests.json            # Custom pack
```

### Active Pack State

The `active-pack.json` file stores the currently activated pack:

```json
{
  "key": "backend",
  "appliedAt": "2025-12-23T10:30:00.000Z"
}
```

This file is managed automatically by `codevault context use`.

## Performance Considerations

### Caching

Context packs are cached in memory using an LRU cache (100 entries max). The cache is invalidated when:
- The pack file is modified (checked via mtime)
- `clearContextPackCache()` is called programmatically

### Long-Running Processes

For the MCP server and `codevault watch`:
- Session packs persist for the lifetime of the process
- File-based packs are re-read on cache miss or file modification
- Cache automatically evicts least-recently-used entries

## Troubleshooting

### Pack Not Found

```
Error: Context pack "mypack" not found in .codevault/contextpacks
```

Verify the file exists:
```bash
ls -la .codevault/contextpacks/mypack.json
```

### Invalid Pack JSON

```
Invalid pack: Unexpected token } in JSON at position 42
```

Validate your JSON:
```bash
cat .codevault/contextpacks/mypack.json | python -m json.tool
```

### Pack Shows as Invalid

```bash
codevault context list
  - mypack (invalid)
```

View the full error:
```bash
codevault context show mypack
```

### Filters Not Applying

1. Check which pack is active:
   ```bash
   codevault context list
   ```

2. View the resolved scope:
   ```bash
   codevault context show active-pack-name
   ```

3. Verify your command isn't overriding pack settings with explicit options

## Related Documentation

- [CLI Reference](CLI_REFERENCE.md) - Complete command documentation
- [Configuration Guide](CONFIGURATION.md) - Global and project configuration
- [MCP Setup Guide](MCP_SETUP.md) - Claude Desktop integration
- [Advanced Features](ADVANCED.md) - Chunking, encryption, and more

---

**Questions?** Check the [main README](../README.md) or [open an issue](https://github.com/shariqriazz/codevault/issues).
