# Using OpenCode for PR Reviews

This repository uses OpenCode AI agent for automated code reviews and assistance with pull requests.

## How It Works

OpenCode automatically reads the `AGENTS.md` file which contains:
- Project architecture and structure
- Code quality standards
- Security guidelines
- Testing requirements
- CodeVault-specific best practices

## Two Modes of Operation

### 1. Auto-Review Mode (Feedback Only)
When you **open a PR or push new commits**, OpenCode will automatically:
- ✅ Analyze the changes
- ✅ Check against our code standards
- ✅ Post comments with feedback
- ❌ **Will NOT make code changes automatically**

This is safe and non-invasive - it just provides feedback.

### 2. Manual Command Mode (Can Make Changes)
When you **comment with `/oc` or `/opencode`**, OpenCode will:
- ✅ Execute your specific instructions
- ✅ **Make code changes if requested**
- ✅ **Commit directly to the PR branch**
- ✅ Push the changes automatically

This is powerful - OpenCode can actually fix issues and implement changes!

## Triggering OpenCode

### Manual Commands with Code Changes

You can interact with OpenCode by commenting on the PR with specific instructions:

#### Basic Commands

**Full PR Review:**
```
/opencode review this PR
```

**Explain Changes:**
```
/oc explain what these changes do
```

**Security Review:**
```
/opencode check for security issues
```

**Performance Analysis:**
```
/oc analyze performance impact
```

#### Specific Instructions

You can give OpenCode very specific tasks:

**Request Code Changes (OpenCode will commit the fix):**
```
/opencode add error handling to the batch indexer function
```
OpenCode will modify the code, commit it, and push to the PR branch.

**Fix Issues (OpenCode will implement the fix):**
```
/oc fix the type errors in src/core/search.ts
```
OpenCode will fix the errors and commit the changes.

**Ask for Improvements (Feedback only):**
```
/oc suggest improvements to the search algorithm
```
This will just provide suggestions without making changes.

**Check Specific Files:**
```
/opencode review the changes in src/core/indexer.ts for type safety
```

**Test Coverage:**
```
/oc check if this PR needs tests and suggest what to test
```

**Documentation:**
```
/opencode update the README with these new features
```

#### Advanced Usage

**Multi-step Tasks with Code Changes:**
```
/opencode do the following:
1. Add error handling to all async functions
2. Fix any TypeScript type errors
3. Add JSDoc comments to public APIs
4. Commit each change separately
```
OpenCode will implement all these changes and commit them.

**Review-Only Tasks (No Code Changes):**
```
/opencode do the following:
1. Review the PR for security issues
2. Check if error handling is adequate
3. Suggest performance optimizations
4. Verify TypeScript types are properly defined
```
This will provide feedback without making changes.

**Context-Aware Requests:**
```
/oc this PR adds a new reranking feature. Check if it follows the same pattern 
as the existing symbol-boost.ts implementation and ensure it's properly integrated.
```

**Comparative Analysis:**
```
/opencode compare the new chunking strategy with the old one in semantic-chunker.ts 
and explain the performance tradeoffs
```

## What OpenCode Reviews

Based on our `AGENTS.md`, OpenCode will check:

### Code Quality
- Type safety and TypeScript best practices
- Error handling in async operations
- Performance and efficiency
- Memory management

### Architecture
- Separation of concerns
- API design and usability
- Code extensibility

### Security
- Input validation
- Injection prevention
- Secrets management

### Testing
- Test coverage for new features
- Edge case handling
- Integration testing

### Documentation
- Code comments for complex logic
- JSDoc for public APIs
- README updates

### CodeVault-Specific
- Embedding quality
- Search relevance
- MCP protocol compatibility
- Rate limiting

## Tips for Best Results

1. **Be Specific**: The more specific your request, the better the response
   - ❌ `/oc fix this`
   - ✅ `/oc add null checks to the embedding generation function`

2. **Provide Context**: Reference specific files or functions
   - ✅ `/oc review error handling in src/core/batch-indexer.ts`

3. **Ask Follow-ups**: You can continue the conversation
   ```
   /oc review this PR
   ```
   Then after getting the review:
   ```
   /oc implement the suggestions you made about error handling
   ```

4. **Request Explanations**: If you don't understand something
   ```
   /oc explain why the hybrid search uses reciprocal rank fusion
   ```

5. **Combine with Human Review**: OpenCode is a tool to assist, not replace human judgment

## Examples

### Example 1: New Feature Review
```
/opencode this PR adds a new context pack feature. Please:
- Review the implementation for code quality
- Check if it follows our existing patterns in src/context/packs.ts
- Verify error handling is adequate
- Suggest any improvements
```

### Example 2: Bug Fix Verification
```
/oc this fixes a memory leak in the indexer. Can you:
- Verify the fix actually addresses the root cause
- Check if there are similar issues elsewhere
- Suggest tests to prevent regression
```

### Example 3: Performance Optimization
```
/opencode review the performance changes in this PR:
- Analyze the algorithmic improvements
- Check for any edge cases that might cause issues
- Verify the changes don't break existing functionality
```

### Example 4: Documentation Update
```
/oc the API changed in this PR. Please update:
- The README.md with new usage examples
- JSDoc comments in the affected files
- The CLI_REFERENCE.md if CLI commands changed
```

## Configuration

The workflow uses:
- **Model**: OpenRouter GPT-5 Medium (reasoning model for thorough reviews)
- **Instructions**: Automatically loaded from `AGENTS.md`
- **Permissions**: Can read code, comment on PRs, and make commits

## Questions?

If you have questions about using OpenCode or want to improve the review guidelines, please:
1. Open an issue
2. Update `AGENTS.md` with better instructions
3. Modify `.github/workflows/opencode.yml` if needed
