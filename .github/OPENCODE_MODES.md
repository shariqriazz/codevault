# OpenCode: Auto-Review vs Manual Commands

## 🤖 Auto-Review Mode (Automatic, Feedback Only)

**Triggers:** When you open a PR or push new commits

**What it does:**
- ✅ Analyzes all changes
- ✅ Checks against code standards in `AGENTS.md`
- ✅ Posts comments with feedback and suggestions
- ❌ **Does NOT make code changes**
- ❌ **Does NOT commit anything**

**Example:**
```
You open a PR → OpenCode automatically comments:
"Found 3 potential issues:
1. Missing error handling in batch-indexer.ts:45
2. Type 'any' used in search.ts:123
3. No tests for new feature"
```

This is **safe and non-invasive** - just helpful feedback!

---

## 🛠️ Manual Command Mode (Interactive, Can Make Changes)

**Triggers:** When you comment `/oc` or `/opencode` with instructions

**What it does:**
- ✅ Executes your specific instructions
- ✅ **CAN make code changes**
- ✅ **CAN commit to the PR branch**
- ✅ **CAN push changes automatically**
- ✅ Posts comments explaining what it did

**Example:**
```
You comment: "/oc add error handling to batch-indexer.ts"

OpenCode will:
1. Read the file
2. Add proper try/catch blocks
3. Commit the changes
4. Push to your PR branch
5. Comment: "Added error handling with proper logging"
```

This is **powerful** - OpenCode actually modifies your code!

---

## 📋 Command Examples

### Commands that MAKE CODE CHANGES:

```bash
# Fix specific issues
/opencode add error handling to the batch indexer
/oc fix the type errors in src/core/search.ts
/opencode refactor the embedding function to use async/await

# Implement features
/oc add JSDoc comments to all public functions
/opencode implement the suggestions from the review
/oc add input validation to the API endpoints

# Update documentation
/opencode update the README with the new features
/oc add code examples to the documentation
```

### Commands that ONLY PROVIDE FEEDBACK:

```bash
# Reviews and suggestions
/opencode review this PR
/oc suggest improvements
/opencode check for security issues
/oc analyze performance

# Explanations
/opencode explain what this PR does
/oc how does the hybrid search work?
/opencode what's the impact of these changes?
```

---

## 🎯 Best Practices

### When to use Auto-Review:
- ✅ Every PR (it's automatic!)
- ✅ Get initial feedback
- ✅ Catch common issues early

### When to use Manual Commands:
- ✅ Fix specific issues OpenCode identified
- ✅ Implement suggested improvements
- ✅ Add missing documentation/tests
- ✅ Refactor code based on feedback

### Safety Tips:
- ⚠️ **Review OpenCode's commits** before merging
- ⚠️ **Test the changes** OpenCode makes
- ⚠️ **Use specific instructions** for better results
- ⚠️ **Don't blindly trust** - verify the changes make sense

---

## 🔄 Typical Workflow

1. **Open PR** → OpenCode auto-reviews (feedback only)
2. **Read feedback** → Understand the issues
3. **Comment with fix command** → `/oc fix the type errors in search.ts`
4. **OpenCode commits fixes** → Review the changes
5. **Test locally** → Make sure it works
6. **Merge** → Ship it! 🚀

---

## ⚙️ Technical Details

**Permissions granted to OpenCode:**
- `contents: write` - Can commit and push code
- `pull-requests: write` - Can comment on PRs
- `issues: write` - Can comment on issues

**GitHub App:**
- Commits appear as coming from `opencode-agent[bot]`
- Uses the OpenCode GitHub App token
- Runs in GitHub Actions (secure, isolated environment)

**Model:**
- OpenRouter GPT-5 Medium (reasoning model)
- Reads `AGENTS.md` for project-specific guidelines
- Uses your API key from GitHub Secrets
