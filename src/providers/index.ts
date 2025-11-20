import { EmbeddingProvider } from './base.js';
import { OpenAIProvider } from './openai.js';
import { MockEmbeddingProvider } from './mock.js';
import type { EmbeddingOptions } from '../config/resolver.js';

export * from './base.js';
export * from './openai.js';
export * from './mock.js';

export function createEmbeddingProvider(providerName = 'auto', options: EmbeddingOptions = {}): EmbeddingProvider {
  switch (providerName.toLowerCase()) {
    case 'mock':
    case 'test': {
      const dimensions =
        typeof options.dimensions === 'number' && Number.isFinite(options.dimensions)
          ? Math.max(1, Math.floor(options.dimensions))
          : 32;
      return new MockEmbeddingProvider(dimensions);
    }
    case 'openai':
    case 'auto':
    default:
      return new OpenAIProvider(options);
  }
}
