# Using the Custom CodeVault Review Agent

## What is the CodeVault Reviewer Agent?

The `codevault-reviewer` is a specialized AI agent designed specifically for reviewing CodeVault pull requests. It has:

- **Deep CodeVault knowledge**: Understands semantic chunking, hybrid search, batch processing, and all CodeVault-specific patterns
- **Read-only mode**: Cannot make code changes (only provides feedback)
- **Comprehensive checklist**: Reviews 8 categories including TypeScript quality, architecture, security, and performance
- **Specialized model**: Uses GPT-5 Medium with low temperature (0.1) for focused, deterministic reviews

## How to Use It

### Option 1: Invoke Manually in GitHub PR Comments

When you want a specialized CodeVault-focused review, use the `@` mention syntax:

```
@codevault-reviewer review this PR
```

This triggers the custom agent instead of the default OpenCode agent.

### Option 2: Request Specific Review Types

You can ask for focused reviews:

```
@codevault-reviewer check this PR for:
1. Semantic chunking correctness
2. Batch processing efficiency
3. Security vulnerabilities
```

```
@codevault-reviewer review the search implementation changes
```

```
@codevault-reviewer analyze performance impact of these caching changes
```

### Option 3: Use in Workflow (Advanced)

You can modify the GitHub workflow to use the custom agent by default:

**In `.github/workflows/opencode.yml`:**
```yaml
- name: Run opencode with custom agent
  uses: sst/opencode/github@latest
  env:
    OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
  with:
    model: openrouter/openai/gpt-5-medium
    agent: codevault-reviewer  # Use custom agent by default
```

## Command Examples

### Basic Review
```
@codevault-reviewer review this PR
```

### Focused Reviews
```
@codevault-reviewer check for security issues in the new indexing code
```

```
@codevault-reviewer verify the batch processing logic follows CodeVault patterns
```

```
@codevault-reviewer analyze the performance impact of these changes
```

### Specific Concerns
```
@codevault-reviewer does this change preserve semantic chunking with 20% overlap?
```

```
@codevault-reviewer verify the symbol boost implementation caps scores at 0.45
```

```
@codevault-reviewer check if the rate limiting follows our retry logic patterns
```

## What the Agent Reviews

The `codevault-reviewer` uses a comprehensive checklist covering:

### 1. TypeScript Quality
- Strict type safety (no `any`)
- Proper interfaces/types
- Async/await patterns
- Type exports

### 2. CodeVault Architecture
- **Chunking**: AST-based semantic splitting, 20% overlap
- **Batching**: 50 chunks/batch, retry logic, fallbacks
- **Search**: Hybrid RRF (0.7 vector + 0.3 BM25)
- **Caching**: LRU limits (BM25: 10, chunks: 1000)
- **Merkle Trees**: Incremental indexing

### 3. Error Handling
- Try/catch for async ops
- Meaningful error messages
- Silent fallbacks for non-critical ops
- Retry logic with exponential backoff

### 4. Security
- Input validation (file paths, queries)
- Prompt injection prevention
- SQL injection prevention
- API key safety
- Encryption key validation

### 5. Performance
- Batch efficiency (~98% API reduction)
- Rate limiting (RPM/TPM)
- Token optimization
- Memory leak prevention

### 6. Testing
- Test coverage for new features
- Edge case testing
- Async operation testing

### 7. MCP Integration
- Zod schema validation
- Protocol compliance
- Structured errors
- Streaming support

### 8. Tree-sitter
- Parser rules for new languages
- Semantic subdivision
- Fallback behavior

## Comparison: Default vs Custom Agent

| Feature | Default OpenCode | CodeVault Reviewer |
|---------|-----------------|-------------------|
| **Mode** | Can make changes | Read-only (feedback only) |
| **Knowledge** | General coding | CodeVault-specific patterns |
| **Temperature** | 0.7 (default) | 0.1 (focused) |
| **Checklist** | General PR review | 8-category CodeVault checklist |
| **Tools** | Full access | Git read-only |
| **Model** | GPT-5 Medium | GPT-5 Medium (same) |
| **Use Case** | General reviews + fixes | Deep CodeVault analysis |

## When to Use Each

### Use Default OpenCode (`/opencode`)
- Quick reviews and immediate fixes
- General code quality improvements
- Documentation updates
- Simple bug fixes

### Use CodeVault Reviewer (`@codevault-reviewer`)
- Deep architectural review
- CodeVault-specific pattern validation
- Performance analysis (chunking, batching, caching)
- Security audit (injection, validation)
- Complex changes to core systems

## Example Workflow

1. **Open PR** → Auto-review runs (default OpenCode)
2. **Review feedback** → Understand general issues
3. **Deep dive** → Comment: `@codevault-reviewer analyze the batch processing changes`
4. **Get specialized feedback** → CodeVault-specific insights
5. **Fix issues** → Comment: `/opencode fix the issues from the review`
6. **Verify** → Comment: `@codevault-reviewer verify the fixes`

## Configuration Files

The custom agent is defined in two places:

1. **Markdown file**: `.opencode/agent/codevault-reviewer.md`
   - Contains the detailed prompt and checklist
   - Defines tools and permissions
   - Committed to Git (shared with team)

2. **JSON config**: `opencode.json`
   - Registers the agent
   - Sets model and temperature
   - Configures tool access

Both files are committed to the repository, so the entire team uses the same specialized reviewer.

## Benefits

✅ **Consistent Reviews**: Same CodeVault-specific checks every time
✅ **Deep Knowledge**: Understands chunking, batching, RRF, Merkle trees
✅ **Focused Analysis**: Low temperature (0.1) for deterministic reviews
✅ **Safe**: Read-only mode prevents accidental changes
✅ **Comprehensive**: 8-category checklist with 50+ specific checks
✅ **Educational**: Explains WHY issues matter, not just WHAT

## Limitations

❌ **Cannot make changes**: Only provides feedback (use `/opencode` to fix)
❌ **CodeVault-specific**: Not suitable for general TypeScript projects
❌ **Slower**: More thorough = takes longer than quick reviews
❌ **Requires context**: Best for PRs that touch core CodeVault systems

## Tips

1. **Be specific** in your requests to get focused feedback
2. **Use for complex PRs** that touch indexing, search, or batching
3. **Combine with default agent**: Review with `@codevault-reviewer`, fix with `/opencode`
4. **Review the checklist** in `.opencode/agent/codevault-reviewer.md` to understand what's checked
5. **Iterate**: Ask follow-up questions to dive deeper into specific concerns
