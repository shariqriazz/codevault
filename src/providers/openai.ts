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
    this.model = process.env.CODEVAULT_EMBEDDING_MODEL
                 || process.env.CODEVAULT_OPENAI_EMBEDDING_MODEL // Backward compatibility
                 || process.env.OPENAI_MODEL // Backward compatibility
                 || 'text-embedding-3-large';
    this.rateLimiter = createRateLimiter('OpenAI');
  }

  async init(): Promise<void> {
    if (!this.openai) {
      const config: any = {};
      
      if (process.env.CODEVAULT_EMBEDDING_API_KEY || process.env.OPENAI_API_KEY) {
        config.apiKey = process.env.CODEVAULT_EMBEDDING_API_KEY || process.env.OPENAI_API_KEY;
      }
      
      if (process.env.CODEVAULT_EMBEDDING_BASE_URL || process.env.OPENAI_BASE_URL) {
        config.baseURL = process.env.CODEVAULT_EMBEDDING_BASE_URL || process.env.OPENAI_BASE_URL;
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
      const requestBody: any = {
        model: this.model,
        input: text.slice(0, maxChars)
      };

      // Add provider routing if configured (for OpenRouter)
      const providerRouting = this.getProviderRouting();
      if (providerRouting && Object.keys(providerRouting).length > 0) {
        requestBody.provider = providerRouting;
      }

      const { data } = await this.openai!.embeddings.create(requestBody);
      return data[0].embedding;
    });
  }

  getDimensions(): number {
    if (process.env.CODEVAULT_EMBEDDING_DIMENSIONS || process.env.CODEVAULT_DIMENSIONS) {
      const dims = parseInt(process.env.CODEVAULT_EMBEDDING_DIMENSIONS || process.env.CODEVAULT_DIMENSIONS || '0', 10);
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

  private getProviderRouting(): any {
    const routing: any = {};
    
    if (process.env.CODEVAULT_EMBEDDING_PROVIDER_ORDER) {
      routing.order = process.env.CODEVAULT_EMBEDDING_PROVIDER_ORDER.split(',').map(s => s.trim());
    }
    
    if (process.env.CODEVAULT_EMBEDDING_PROVIDER_ALLOW_FALLBACKS !== undefined) {
      routing.allow_fallbacks = process.env.CODEVAULT_EMBEDDING_PROVIDER_ALLOW_FALLBACKS === 'true';
    }
    
    if (process.env.CODEVAULT_EMBEDDING_PROVIDER_ONLY) {
      routing.only = process.env.CODEVAULT_EMBEDDING_PROVIDER_ONLY.split(',').map(s => s.trim());
    }
    
    if (process.env.CODEVAULT_EMBEDDING_PROVIDER_IGNORE) {
      routing.ignore = process.env.CODEVAULT_EMBEDDING_PROVIDER_IGNORE.split(',').map(s => s.trim());
    }
    
    return routing;
  }

  // Batch processing implementation for OpenAI
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    await this.init();
    
    const profile = await getModelProfile(this.getName(), this.model);
    const maxChars = profile.maxChunkChars || 8000;
    
    const allEmbeddings: number[][] = [];
    const remainingTexts = [...texts];
    let batchCount = 0;
    
    while (remainingTexts.length > 0) {
      batchCount++;
      const currentBatch: string[] = [];
      let currentBatchTokens = 0;
      const processedIndices: number[] = [];
      
      // Build batch based on token limits
      for (let i = 0; i < remainingTexts.length; i++) {
        const text = remainingTexts[i];
        const truncatedText = text.slice(0, maxChars);
        const itemTokens = estimateTokens(truncatedText);
        
        // Skip items that exceed single item limit
        if (itemTokens > MAX_ITEM_TOKENS) {
          if (!process.env.CODEVAULT_QUIET) {
            console.warn(`  ⚠️  Text at index ${i} exceeds max token limit (${itemTokens} > ${MAX_ITEM_TOKENS}), skipping`);
          }
          processedIndices.push(i);
          // Add empty embedding as placeholder
          allEmbeddings.push(new Array(this.getDimensions()).fill(0));
          continue;
        }
        
        // Add to batch if it fits
        if (currentBatchTokens + itemTokens <= MAX_BATCH_TOKENS) {
          currentBatch.push(truncatedText);
          currentBatchTokens += itemTokens;
          processedIndices.push(i);
        } else {
          break; // Batch is full
        }
      }
      
      // Remove processed items from remaining texts
      for (let i = processedIndices.length - 1; i >= 0; i--) {
        remainingTexts.splice(processedIndices[i], 1);
      }
      
      // Process current batch if not empty
      if (currentBatch.length > 0) {
        if (!process.env.CODEVAULT_QUIET) {
          console.log(`  → API call ${batchCount}: ${currentBatch.length} items (${currentBatchTokens} tokens)`);
        }
        
        const batchEmbeddings = await this.rateLimiter.execute(async () => {
          const requestBody: any = {
            model: this.model,
            input: currentBatch
          };

          // Add provider routing if configured (for OpenRouter)
          const providerRouting = this.getProviderRouting();
          if (providerRouting && Object.keys(providerRouting).length > 0) {
            requestBody.provider = providerRouting;
          }

          const { data } = await this.openai!.embeddings.create(requestBody);
          return data.map(item => item.embedding);
        });
        
        allEmbeddings.push(...batchEmbeddings);
      }
    }
    
    if (!process.env.CODEVAULT_QUIET) {
      console.log(`  ✓ Batch complete: ${texts.length} embeddings from ${batchCount} API call(s)\n`);
    }
    
    return allEmbeddings;
  }
}