# OpenRouter Provider Routing Support

## Overview

CodeVault now supports OpenRouter's provider routing feature, allowing you to control which providers are used for embeddings and chat completions when using OpenRouter as your API endpoint.

## What is Provider Routing?

Provider routing is an OpenRouter feature that lets you specify preferences for which underlying providers should handle your requests. This is useful for:

- **Cost optimization**: Route to the cheapest provider
- **Performance**: Prioritize throughput or latency
- **Reliability**: Use specific providers you trust
- **Compliance**: Enforce data policies (ZDR, data collection restrictions)

## Configuration

Provider routing is configured in your CodeVault config file (`~/.codevault/config.json` or project-level `.codevault/config.json`).

### Embedding Provider Routing

Add a `routing` object to your embedding provider configuration:

```json
{
  "providers": {
    "openai": {
      "apiKey": "your-openrouter-api-key",
      "baseUrl": "https://openrouter.ai/api/v1",
      "model": "qwen/qwen3-embedding-8b",
      "dimensions": 4096,
      "routing": {
        "only": ["nebius"],
        "allow_fallbacks": false
      }
    }
  }
}
```

### Chat LLM Routing

Add a `routing` object to your chat LLM configuration:

```json
{
  "chatLLM": {
    "openai": {
      "apiKey": "your-openrouter-api-key",
      "baseUrl": "https://openrouter.ai/api/v1",
      "model": "anthropic/claude-sonnet-4.5",
      "routing": {
        "order": ["anthropic", "openai"],
        "sort": "throughput"
      }
    }
  }
}
```

## Available Routing Options

All OpenRouter provider routing options are supported:

### `order` (string[])
List of provider slugs to try in order (e.g., `["anthropic", "openai"]`)

### `allow_fallbacks` (boolean)
Whether to allow backup providers when primary is unavailable (default: `true`)

### `require_parameters` (boolean)
Only use providers that support all parameters in your request (default: `false`)

### `data_collection` ("allow" | "deny")
Control whether to use providers that may store data (default: `"allow"`)

### `zdr` (boolean)
Restrict routing to only ZDR (Zero Data Retention) endpoints

### `enforce_distillable_text` (boolean)
Restrict routing to only models that allow text distillation

### `only` (string[])
List of provider slugs to allow for this request

### `ignore` (string[])
List of provider slugs to skip for this request

### `quantizations` (string[])
List of quantization levels to filter by (e.g., `["int4", "int8"]`)

### `sort` ("price" | "throughput" | "latency")
Sort providers by specific attribute

### `max_price` (object)
Maximum pricing you want to pay:
```json
{
  "prompt": 1,
  "completion": 2,
  "request": 0.5,
  "image": 0.1
}
```

## Examples

### Example 1: Force Nebius for Embeddings

```json
{
  "providers": {
    "openai": {
      "baseUrl": "https://openrouter.ai/api/v1",
      "model": "qwen/qwen3-embedding-8b",
      "routing": {
        "only": ["nebius"]
      }
    }
  }
}
```

### Example 2: Prioritize Throughput for Chat

```json
{
  "chatLLM": {
    "openai": {
      "baseUrl": "https://openrouter.ai/api/v1",
      "model": "anthropic/claude-sonnet-4.5",
      "routing": {
        "sort": "throughput"
      }
    }
  }
}
```

### Example 3: Enforce Zero Data Retention

```json
{
  "providers": {
    "openai": {
      "baseUrl": "https://openrouter.ai/api/v1",
      "model": "qwen/qwen3-embedding-8b",
      "routing": {
        "zdr": true,
        "data_collection": "deny"
      }
    }
  }
}
```

### Example 4: Custom Provider Order with Fallbacks

```json
{
  "chatLLM": {
    "openai": {
      "baseUrl": "https://openrouter.ai/api/v1",
      "model": "meta-llama/llama-3.1-70b-instruct",
      "routing": {
        "order": ["together", "deepinfra"],
        "allow_fallbacks": true
      }
    }
  }
}
```

## Backward Compatibility

Provider routing is completely optional. If you don't specify a `routing` configuration:

- **OpenRouter users**: Requests will use OpenRouter's default load balancing
- **Other providers** (Nebius, Ollama, direct OpenAI): The routing config is ignored (no effect)

This ensures existing configurations continue to work without any changes.

## How It Works

1. When you configure a `routing` object in your provider config, it's loaded by the config resolver
2. The routing config is passed to the `OpenAIProvider` or `OpenAIChatProvider` class
3. When making API requests, the provider checks if:
   - A routing config is present AND
   - The base URL contains "openrouter.ai"
4. If both conditions are true, the routing config is added to the request body as the `provider` field
5. OpenRouter receives the request with routing preferences and routes accordingly

## Testing

You can test that routing is working by:

1. Setting a routing configuration in your config file
2. Running an index or search operation
3. The routing will be applied to all API calls to OpenRouter

Example test:
```bash
# Set up config with Nebius-only routing
codevault config set providers.openai.routing.only '["nebius"]'

# Index a small test project
codevault index /path/to/test/project

# If successful, OpenRouter routed all requests to Nebius
```

## Troubleshooting

### Routing not being applied?

1. **Check your base URL**: Routing only works when using OpenRouter (`https://openrouter.ai/api/v1`)
2. **Verify config format**: Make sure your routing object is valid JSON
3. **Check provider availability**: Ensure the providers you're routing to support your model

### Provider not found error?

You may have specified a provider that doesn't support your chosen model. Try:
- Removing the `only` restriction
- Adding `allow_fallbacks: true`
- Checking the OpenRouter model page for available providers

### Rate limit errors?

Some providers have different rate limits. If you're forcing a specific provider:
- Adjust your rate limits in CodeVault config
- Consider allowing fallbacks
- Use provider sorting instead of strict routing

## References

- [OpenRouter Provider Routing Documentation](https://openrouter.ai/docs/features/provider-routing)
- [CodeVault Configuration Guide](docs/CONFIGURATION.md)
- [OpenRouter API Reference](https://openrouter.ai/docs/api-reference)
