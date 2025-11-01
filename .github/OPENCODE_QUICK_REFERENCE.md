# OpenCode Quick Reference

## Quick Commands

| Command | Description |
|---------|-------------|
| `/opencode review this PR` | Full code review |
| `/oc explain these changes` | Explain what the PR does |
| `/opencode check security` | Security-focused review |
| `/oc suggest improvements` | Get optimization suggestions |
| `/opencode add tests` | Generate test cases |
| `/oc update docs` | Update documentation |

## Common Patterns

### Request Specific Changes
```
/opencode add error handling to [function name]
/oc fix the type errors in [file path]
/opencode refactor [component] to use async/await
```

### Code Quality Checks
```
/oc check for memory leaks
/opencode verify type safety
/oc analyze performance
/opencode check test coverage
```

### Get Explanations
```
/oc how does [feature] work?
/opencode explain the changes in [file]
/oc what's the impact of this change?
```

### Multi-Step Tasks
```
/opencode do the following:
1. Review for security issues
2. Check error handling
3. Suggest performance improvements
4. Verify types are correct
```

## Tips

✅ **Do:**
- Be specific about what you want
- Reference specific files/functions
- Ask follow-up questions
- Combine with human review

❌ **Don't:**
- Use vague requests like "fix this"
- Expect it to understand context without details
- Skip human verification of changes

## Model Used

- **OpenRouter GPT-5 Medium** (reasoning model)
- Automatically loads guidelines from `AGENTS.md`
- Focuses on: code quality, security, performance, testing, documentation
