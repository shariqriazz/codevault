import { EmbeddingProvider } from './base.js';
import { OpenAIProvider } from './openai.js';
import type { EmbeddingOptions } from '../config/resolver.js';

export * from './base.js';
export * from './openai.js';

export function createEmbeddingProvider(providerName = 'auto', options: EmbeddingOptions = {}): EmbeddingProvider {
  switch (providerName.toLowerCase()) {
    case 'openai':
    case 'auto':
    default:
      return new OpenAIProvider(options);
  }
}
