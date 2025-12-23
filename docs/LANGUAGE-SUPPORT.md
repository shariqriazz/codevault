# Language Support Reference

CodeVault v1.8.5

This document describes the multi-language support system in CodeVault, including supported languages, Tree-sitter integration, and how to extend support for additional languages.

## Table of Contents

1. [Overview](#overview)
2. [Supported Languages](#supported-languages)
3. [Architecture](#architecture)
4. [Language Rule Configuration](#language-rule-configuration)
5. [Tree-sitter Integration](#tree-sitter-integration)
6. [Semantic Chunking Behavior](#semantic-chunking-behavior)
7. [Adding New Language Support](#adding-new-language-support)
8. [Troubleshooting](#troubleshooting)

## Overview

CodeVault uses Tree-sitter parsers to perform AST-based semantic chunking of source code. Each supported language has a corresponding language rule that defines:

- Which AST node types represent meaningful code units (functions, classes, etc.)
- How to subdivide large constructs into smaller semantic chunks
- Which node types represent variable declarations
- How to extract documentation comments

This approach ensures that code chunks preserve semantic meaning rather than being split at arbitrary line boundaries.

## Supported Languages

CodeVault currently supports 25+ programming languages and file types:

| Extension(s) | Language | Parser |
|--------------|----------|--------|
| `.php` | PHP | tree-sitter-php |
| `.py` | Python | tree-sitter-python |
| `.js` | JavaScript | tree-sitter-javascript |
| `.jsx` | JSX (React) | tree-sitter-typescript/tsx |
| `.ts` | TypeScript | tree-sitter-typescript |
| `.tsx` | TSX (React TypeScript) | tree-sitter-typescript/tsx |
| `.go` | Go | tree-sitter-go |
| `.java` | Java | tree-sitter-java |
| `.cs` | C# | tree-sitter-c-sharp |
| `.rs` | Rust | tree-sitter-rust |
| `.rb` | Ruby | tree-sitter-ruby |
| `.cpp`, `.hpp`, `.cc` | C++ | tree-sitter-cpp |
| `.c`, `.h` | C | tree-sitter-c |
| `.scala` | Scala | tree-sitter-scala |
| `.swift` | Swift | tree-sitter-swift |
| `.sh`, `.bash` | Bash/Shell | tree-sitter-bash |
| `.kt` | Kotlin | @tree-sitter-grammars/tree-sitter-kotlin |
| `.lua` | Lua | tree-sitter-lua |
| `.html`, `.htm` | HTML | tree-sitter-html |
| `.css` | CSS | tree-sitter-css |
| `.json` | JSON | tree-sitter-json |
| `.ml`, `.mli` | OCaml | tree-sitter-ocaml |
| `.hs` | Haskell | tree-sitter-haskell |
| `.ex`, `.exs` | Elixir | tree-sitter-elixir |
| `.md`, `.markdown` | Markdown | @tree-sitter-grammars/tree-sitter-markdown |

### Language Detection

Language detection is performed by file extension. The `getSupportedLanguageExtensions()` function in `src/languages/rules.ts` returns all supported file extensions.

## Architecture

The language support system consists of two primary modules:

### File: `src/languages/tree-sitter-loader.ts`

Responsible for loading and resolving Tree-sitter language modules. Key components:

- **Language Imports**: Imports all Tree-sitter grammar packages
- **`resolveTreeSitterLanguage()`**: Normalizes different module export formats into a consistent interface
- **`RESOLVED_LANGUAGES`**: Exported object containing all resolved language parsers

The resolver handles variations in how different Tree-sitter packages export their language definitions (default exports, named exports, nested objects).

### File: `src/languages/rules.ts`

Defines the language rules that govern AST-based chunking:

- **`LanguageRule` interface**: Type definition for language configuration
- **`LANG_RULES`**: Map of file extensions to language rules
- **`getSupportedLanguageExtensions()`**: Returns array of supported extensions

## Language Rule Configuration

Each language rule is defined with the following properties:

### LanguageRule Interface

```typescript
interface LanguageRule {
  lang: string;                              // Language identifier
  ts: unknown;                               // Resolved Tree-sitter parser
  nodeTypes: string[];                       // Primary AST nodes to extract as chunks
  subdivisionTypes?: Record<string, string[]>; // How to subdivide large nodes
  variableTypes?: string[];                  // Variable declaration node types
  commentPattern: RegExp | null;             // Regex for extracting doc comments
}
```

### Property Details

#### `lang`

A string identifier for the language (e.g., `"python"`, `"typescript"`). Used for metadata and logging.

#### `ts`

Reference to the resolved Tree-sitter parser object. Obtained from `RESOLVED_LANGUAGES`.

#### `nodeTypes`

Array of AST node type names that represent top-level code units to extract as chunks. Examples:

- **Python**: `['function_definition', 'class_definition']`
- **TypeScript**: `['function_declaration', 'method_definition', 'class_declaration', 'export_statement', 'lexical_declaration', 'expression_statement']`
- **Rust**: `['function_item', 'impl_item', 'struct_item', 'enum_item', 'trait_item', 'mod_item']`

These are the primary nodes collected during AST traversal for chunking.

#### `subdivisionTypes`

Optional mapping that defines how to split large AST nodes into smaller semantic units. The key is a parent node type, and the value is an array of child node types to extract.

Example for Python:

```typescript
subdivisionTypes: {
  'class_definition': ['function_definition'],
  'function_definition': ['function_definition', 'if_statement', 'try_statement', 'with_statement']
}
```

This configuration means:
- When a `class_definition` exceeds the size limit, extract its `function_definition` children as separate chunks
- When a `function_definition` is too large, look for nested functions, if statements, try blocks, or with statements

#### `variableTypes`

Array of AST node types that represent variable declarations. Used for metadata extraction.

Examples:
- **Python**: `['assignment', 'expression_statement']`
- **JavaScript/TypeScript**: `['const_declaration', 'let_declaration', 'variable_declaration']`
- **Go**: `['const_declaration', 'var_declaration', 'short_var_declaration']`

#### `commentPattern`

Regular expression for extracting documentation comments from source code. Set to `null` for languages without comment syntax (e.g., JSON).

Examples:
- **JSDoc/JavaDoc style**: `/\/\*\*[\s\S]*?\*\//g`
- **Python docstrings**: `/"""[\s\S]*?"""|'''[\s\S]*?'''/g`
- **Ruby/Shell comments**: `/#.*$/gm`
- **OCaml comments**: `/\(\*[\s\S]*?\*\)/g`

## Tree-sitter Integration

### Parser Loading

Tree-sitter parsers are loaded at module initialization via static imports:

```typescript
import LangPython from 'tree-sitter-python';
import LangTS from 'tree-sitter-typescript/bindings/node/typescript.js';
```

Some parsers require special handling due to different export formats:

```typescript
// CSS uses a different binding path
import * as LangCSSModule from 'tree-sitter-css/bindings/node/index.js';
const LangCSS = (LangCSSModule as Record<string, unknown>).default || LangCSSModule;
```

### Parser Resolution

The `resolveTreeSitterLanguage()` function handles the following module formats:

1. **Default export**: `module.default`
2. **Preferred key export**: `module[preferredKey]` (e.g., `module.javascript`)
3. **Language object with `.language` property**: Direct return
4. **Nested exports**: Recursive search for valid language objects

### AST Traversal

The `ASTTraverser` class in `src/core/indexing/chunk-pipeline.ts` uses the language rule to collect relevant nodes:

```typescript
collectNodesForFile(source: string, rule: LanguageRule): TreeSitterNode[] {
  this.parser.setLanguage(rule.ts);
  // ... parse source and traverse AST
  // Collect nodes matching rule.nodeTypes
}
```

## Semantic Chunking Behavior

### Chunking Pipeline

1. **Node Collection**: Extract nodes matching `nodeTypes` from the AST
2. **Size Analysis**: Determine if each node fits within size limits
3. **Subdivision**: For oversized nodes, apply `subdivisionTypes` rules
4. **Fallback**: If subdivision is insufficient, fall back to statement-level chunking with 20% overlap
5. **Grouping**: Small related nodes may be grouped together for efficiency

### Size Limits

Size limits are determined by the model profile (tokens or characters):

- **Optimal**: Target chunk size for best embedding quality
- **Min**: Minimum size (smaller nodes are skipped or merged)
- **Max**: Maximum size (larger nodes are subdivided)
- **Overlap**: Amount of overlap for statement-level fallback (20%)

### Example: Python Class Chunking

Given a large Python class:

```python
class UserService:
    def __init__(self, db):
        self.db = db

    def create_user(self, name, email):
        # 200 lines of code
        pass

    def delete_user(self, user_id):
        # 150 lines of code
        pass
```

If the class exceeds the max size:
1. The class is identified as needing subdivision
2. `subdivisionTypes['class_definition']` specifies `['function_definition']`
3. Each method (`__init__`, `create_user`, `delete_user`) becomes a separate chunk
4. If a method still exceeds max size, statement-level chunking with overlap is applied

## Adding New Language Support

To add support for a new language:

### Step 1: Install the Tree-sitter Grammar

```bash
npm install tree-sitter-<language> --legacy-peer-deps
```

### Step 2: Add to tree-sitter-loader.ts

```typescript
// Add import
import LangNewLang from 'tree-sitter-newlang';

// Add to RESOLVED_LANGUAGES
export const RESOLVED_LANGUAGES = {
  // ... existing languages
  newlang: resolveTreeSitterLanguage(LangNewLang)
};
```

### Step 3: Define Language Rules in rules.ts

```typescript
'.newext': {
  lang: 'newlang',
  ts: RESOLVED_LANGUAGES.newlang,
  nodeTypes: ['function_definition', 'class_definition'],
  subdivisionTypes: {
    'class_definition': ['function_definition', 'method_definition'],
    'function_definition': ['if_statement', 'for_statement']
  },
  variableTypes: ['variable_declaration', 'assignment'],
  commentPattern: /\/\/.*$|\/\*[\s\S]*?\*\//gm
}
```

### Step 4: Test the Configuration

1. Create a sample file with the new extension
2. Run `codevault index /path/to/sample/project`
3. Verify chunks are created with proper semantic boundaries
4. Check that symbols are extracted correctly

### Determining Node Types

To identify the correct node types for a language:

1. Use Tree-sitter playground: https://tree-sitter.github.io/tree-sitter/playground
2. Parse sample code and inspect the AST structure
3. Identify node types that represent:
   - Functions and methods
   - Classes, structs, interfaces
   - Modules and namespaces
   - Important declarations

## Troubleshooting

### Parser Not Loading

If a language fails to load:

1. Verify the npm package is installed: `npm ls tree-sitter-<language>`
2. Check the import path matches the package structure
3. Review `resolveTreeSitterLanguage()` output for the language

### Incorrect Chunking

If chunks have wrong boundaries:

1. Verify `nodeTypes` includes the expected AST node types
2. Use Tree-sitter playground to check actual node type names
3. Review `subdivisionTypes` for proper parent-child relationships

### Missing Documentation Comments

If doc comments are not extracted:

1. Check `commentPattern` regex matches the language's comment syntax
2. Test the regex against sample comments
3. Verify comments appear immediately before the code construct

### Large Chunks Not Subdividing

If oversized chunks are not being split:

1. Verify `subdivisionTypes` is defined for the parent node type
2. Check that child node types exist in the AST
3. Review size limits in the model profile

## Related Documentation

- [CHUNKING.md](./CHUNKING.md) - Detailed chunking algorithm reference
- [CONFIGURATION.md](./CONFIGURATION.md) - Configuration options
- [CLAUDE.md](../CLAUDE.md) - Full project architecture reference

## Source Files

| File | Description |
|------|-------------|
| `src/languages/rules.ts` | Language rules definitions (LANG_RULES, LanguageRule interface) |
| `src/languages/tree-sitter-loader.ts` | Tree-sitter parser loading and resolution |
| `src/chunking/semantic-chunker.ts` | Semantic chunking logic (analyzeNodeForChunking, yieldStatementChunks) |
| `src/core/indexing/chunk-pipeline.ts` | Chunk pipeline orchestration (ASTTraverser, ChunkPipeline) |
| `src/chunking/file-grouper.ts` | Node grouping logic (groupNodesForChunking) |
