import { EmbeddingProvider } from './base.js';
import { OpenAIProvider } from './openai.js';
import { OllamaProvider } from './ollama.js';

export * from './base.js';
export * from './openai.js';
export * from './ollama.js';

export function createEmbeddingProvider(providerName = 'auto'): EmbeddingProvider {
  switch (providerName.toLowerCase()) {
    case 'openai':
      return new OpenAIProvider();
    case 'ollama':
      return new OllamaProvider();
    case 'auto':
    default:
      // Check for OpenAI-compatible API keys (including custom endpoints like Nebius)
      if (process.env.CODEVAULT_EMBEDDING_API_KEY || process.env.OPENAI_API_KEY) {
        return new OpenAIProvider();
      } else {
        return new OllamaProvider();
      }
  }
}