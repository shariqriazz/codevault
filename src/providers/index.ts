import { EmbeddingProvider } from './base.js';
import { OpenAIProvider } from './openai.js';

export * from './base.js';
export * from './openai.js';

export function createEmbeddingProvider(providerName = 'auto'): EmbeddingProvider {
  switch (providerName.toLowerCase()) {
    case 'openai':
    case 'auto':
    default:
      return new OpenAIProvider();
  }
}