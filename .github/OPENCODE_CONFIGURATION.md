# OpenCode Configuration for GitHub Actions

## How Model Configuration Works

### The Problem
Your local OpenCode setup uses a **custom profile** defined in `~/.config/opencode/opencode.json`:

```json
"openai/gpt-5-medium": {
  "id": "openai/gpt-5",
  "name": "GPT-5 (Medium Effort)",
  "reasoning": true,
  "options": {
    "reasoningEffort": "medium",
    "textVerbosity": "low",
    "reasoningSummary": "auto"
  }
}
```

However, **GitHub Actions doesn't have access to your local config files**.

### The Solution
We created a **project-level** `opencode.json` in the repo root that defines the same custom profile.

## File Structure

```
/root/codevault/
├── opencode.json              # ← Project-level config (committed to Git)
├── AGENTS.md                  # ← PR review guidelines (committed to Git)
└── .github/
    └── workflows/
        └── opencode.yml       # ← GitHub Actions workflow
```

## Configuration Hierarchy

OpenCode loads configs in this order (highest priority first):

1. **Environment variables** (set in workflow)
2. **Project config** (`opencode.json` in repo root) ← **We use this**
3. **Global config** (`~/.config/opencode/opencode.json`)
4. **Defaults**

## What's in `opencode.json`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "openrouter": {
      "models": {
        "openai/gpt-5-medium": {
          "id": "openai/gpt-5",
          "name": "GPT-5 (Medium Effort)",
          "reasoning": true,
          "options": {
            "reasoningEffort": "medium",
            "textVerbosity": "low",
            "reasoningSummary": "auto"
          }
        }
      }
    }
  },
  "instructions": ["AGENTS.md"]
}
```

**What this does:**
- Defines the custom `openai/gpt-5-medium` profile
- Maps it to the actual model `openai/gpt-5`
- Sets reasoning options (medium effort, low verbosity)
- Automatically loads `AGENTS.md` for PR review guidelines

## Workflow Configuration

The workflow in `.github/workflows/opencode.yml` uses:

```yaml
env:
  OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
with:
  model: openrouter/openai/gpt-5-medium
```

**How it works:**
1. GitHub Actions checks out the repo (includes `opencode.json`)
2. OpenCode reads `opencode.json` and finds the `openai/gpt-5-medium` profile
3. OpenCode uses the actual model `openai/gpt-5` with the custom options
4. OpenCode also reads `AGENTS.md` for PR review guidelines

## Alternative: Use Base Model Directly

If you **don't want to commit** `opencode.json`, you can use the base model directly:

```yaml
with:
  model: openrouter/openai/gpt-5
```

**Pros:**
- No need to commit config file
- Simpler setup

**Cons:**
- Loses custom reasoning options (medium effort, low verbosity)
- Uses default GPT-5 settings

## Secrets Required

Add this to GitHub repo secrets:

| Secret Name | Value | Where to Get It |
|-------------|-------|-----------------|
| `OPENROUTER_API_KEY` | Your OpenRouter API key | https://openrouter.ai/keys |

**How to add:**
1. Go to: `https://github.com/YOUR_USERNAME/codevault/settings/secrets/actions`
2. Click "New repository secret"
3. Name: `OPENROUTER_API_KEY`
4. Value: Your API key
5. Click "Add secret"

## Testing the Configuration

1. **Commit the files:**
   ```bash
   git add opencode.json AGENTS.md .github/
   git commit -m "Add OpenCode GitHub integration"
   git push
   ```

2. **Create a test PR:**
   ```bash
   git checkout -b test-opencode
   echo "// test change" >> README.md
   git add README.md
   git commit -m "Test OpenCode integration"
   git push -u origin test-opencode
   ```

3. **Open PR on GitHub and watch:**
   - OpenCode should auto-review within a few minutes
   - Try commenting: `/oc explain this PR`

## Troubleshooting

### "Model not found" error
- Check that `opencode.json` is committed to the repo
- Verify the model ID is correct: `openai/gpt-5`

### "API key invalid" error
- Check that `OPENROUTER_API_KEY` is set in GitHub secrets
- Verify the API key is valid at https://openrouter.ai/keys

### OpenCode not responding
- Check GitHub Actions logs: `Actions` tab → `opencode-pr-review` workflow
- Verify the workflow file is in `.github/workflows/opencode.yml`
- Check that the OpenCode GitHub app is installed

### Custom options not working
- Verify `opencode.json` has the correct profile definition
- Check that the workflow uses `model: openrouter/openai/gpt-5-medium`
- Review GitHub Actions logs to see what config was loaded

## Model Costs

**GPT-5 on OpenRouter:**
- Input: ~$5-10 per 1M tokens
- Output: ~$15-30 per 1M tokens

**Typical PR review costs:**
- Auto-review: ~$0.10-0.50 per PR
- Manual commands: ~$0.05-0.20 per command

**Budget tips:**
- Use auto-review sparingly (disable `pull_request` trigger if needed)
- Use manual commands only when necessary
- Consider using a cheaper model for simple reviews
