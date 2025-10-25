import { createRateLimiter } from '../utils/rate-limiter.js';
import { EmbeddingProvider, getModelProfile, getSizeLimits } from './base.js';

export class OllamaProvider extends EmbeddingProvider {
  private ollama: any = null;
  private model: string;
  rateLimiter: any;

  constructor(model = process.env.CODEVAULT_OLLAMA_MODEL || 'nomic-embed-text') {
    super();
    this.model = model;
    this.rateLimiter = createRateLimiter('Ollama');
  }

  async init(): Promise<void> {
    if (!this.ollama) {
      try {
        const ollama = await import('ollama');
        this.ollama = ollama.default;
      } catch (error) {
        throw new Error('Ollama is not installed. Run: npm install ollama');
      }
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    await this.init();
    
    const profile = await getModelProfile('Ollama', this.model);
    const maxChars = profile.maxChunkChars || 8000;
    
    return await this.rateLimiter.execute(async () => {
      const response = await this.ollama.embeddings({
        model: this.model,
        prompt: text.slice(0, maxChars)
      });
      return response.embedding;
    });
  }

  getDimensions(): number {
    if (process.env.CODEVAULT_DIMENSIONS) {
      const dims = parseInt(process.env.CODEVAULT_DIMENSIONS, 10);
      if (!isNaN(dims) && dims > 0) return dims;
    }
    
    return 768;
  }

  getName(): string {
    return 'Ollama';
  }
  
  getModelName(): string {
    return this.model;
  }
}