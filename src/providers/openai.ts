import { OpenAI } from 'openai';
import { createRateLimiter } from '../utils/rate-limiter.js';
import {
  EmbeddingProvider,
  getModelProfile,
  getSizeLimits,
  MAX_BATCH_TOKENS,
  MAX_ITEM_TOKENS,
  estimateTokens
} from './base.js';

export class OpenAIProvider extends EmbeddingProvider {
  private openai: OpenAI | null = null;
  private model: string;
  rateLimiter: any;

  constructor() {
    super();
    this.model = process.env.CODEVAULT_OPENAI_EMBEDDING_MODEL
                 || process.env.OPENAI_MODEL
                 || 'text-embedding-3-large';
    this.rateLimiter = createRateLimiter('OpenAI');
  }

  async init(): Promise<void> {
    if (!this.openai) {
      const config: any = {};
      
      if (process.env.OPENAI_API_KEY) {
        config.apiKey = process.env.OPENAI_API_KEY;
      }
      
      if (process.env.OPENAI_BASE_URL) {
        config.baseURL = process.env.OPENAI_BASE_URL;
      }
      
      this.openai = new OpenAI(config);
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    await this.init();
    
    const profile = await getModelProfile(this.getName(), this.model);
    const limits = getSizeLimits(profile);
    const maxChars = profile.maxChunkChars || 8000;
    
    return await this.rateLimiter.execute(async () => {
      const { data } = await this.openai!.embeddings.create({
        model: this.model,
        input: text.slice(0, maxChars)
      });
      return data[0].embedding;
    });
  }

  getDimensions(): number {
    if (process.env.CODEVAULT_DIMENSIONS) {
      const dims = parseInt(process.env.CODEVAULT_DIMENSIONS, 10);
      if (!isNaN(dims) && dims > 0) return dims;
    }
    
    if (this.model.includes('3-small')) return 1536;
    if (this.model.includes('3-large')) return 3072;
    return 1536;
  }

  getName(): string {
    return 'OpenAI';
  }
  
  getModelName(): string {
    return this.model;
  }
}