import { OpenAI } from 'openai';
import { createRateLimiter, RateLimiter } from '../utils/rate-limiter.js';
import {
  EmbeddingProvider,
  getModelProfile,
  MAX_BATCH_TOKENS,
  MAX_ITEM_TOKENS,
  estimateTokens
} from './base.js';
import type { EmbeddingOptions } from '../config/resolver.js';
import type { ProviderRoutingConfig } from '../config/types.js';

export class OpenAIProvider extends EmbeddingProvider {
  private openai: OpenAI | null = null;
  private model: string;
  private apiKey?: string;
  private baseUrl?: string;
  private dimensionsOverride?: number;
  private routingConfig?: ProviderRoutingConfig;
  rateLimiter: RateLimiter;

  constructor(options: EmbeddingOptions = {}) {
    super();
    this.model = options.model
                 || process.env.CODEVAULT_EMBEDDING_MODEL
                 || process.env.CODEVAULT_OPENAI_EMBEDDING_MODEL // Backward compatibility
                 || process.env.OPENAI_MODEL // Backward compatibility
                 || 'text-embedding-3-large';
    this.apiKey = options.apiKey || process.env.CODEVAULT_EMBEDDING_API_KEY || process.env.OPENAI_API_KEY;
    this.baseUrl = options.baseUrl || process.env.CODEVAULT_EMBEDDING_BASE_URL || process.env.OPENAI_BASE_URL;
    this.dimensionsOverride = options.dimensions;
    this.routingConfig = options.routing;

    // Use config-provided rate limits if available, otherwise use defaults
    if (options.rpm !== undefined || options.tpm !== undefined) {
      this.rateLimiter = new RateLimiter(options.rpm ?? null, options.tpm ?? null);
    } else {
      this.rateLimiter = createRateLimiter('OpenAI');
    }
  }

  init(): Promise<void> {
    if (!this.openai) {
      const config: any = {};

      if (this.apiKey) {
        config.apiKey = this.apiKey;
      }

      if (this.baseUrl) {
        config.baseURL = this.baseUrl;
      }

      this.openai = new OpenAI(config);
    }
    return Promise.resolve();
  }

  async generateEmbedding(text: string): Promise<number[]> {
    await this.init();

    const profile = await getModelProfile(this.getName(), this.model);
    const maxChars = profile.maxChunkChars || 8000;

    return await this.rateLimiter.execute(async (): Promise<number[]> => {
      const requestBody: any = {
        model: this.model,
        input: text.slice(0, maxChars)
      };

      // Add provider routing for OpenRouter if configured
      if (this.routingConfig && this.isOpenRouter()) {
        requestBody.provider = this.routingConfig;
      }

      const response = await this.openai!.embeddings.create(requestBody);

      // Validate response structure
      if (!response || !response.data || !Array.isArray(response.data) || response.data.length === 0) {
        const meta = {
          topLevelKeys: response ? Object.keys(response as any) : [],
          dataType: typeof response?.data,
          dataLength: Array.isArray(response?.data) ? response.data.length : undefined
        };
        const { log } = await import('../utils/logger.js');
        log.debug('[codevault] Invalid API response (single)', meta);
        throw new Error(`Invalid API response: expected data array with at least one item, got ${typeof response?.data}`);
      }

      const embedding = response.data[0].embedding;
      if (!embedding || !Array.isArray(embedding)) {
        throw new Error(`Invalid embedding: expected array, got ${typeof embedding}`);
      }

      return embedding;
    });
  }

  private isOpenRouter(): boolean {
    return this.baseUrl?.includes('openrouter.ai') ?? false;
  }

  getDimensions(): number {
    if (this.dimensionsOverride !== undefined) {
      return this.dimensionsOverride;
    }

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

  // Batch processing implementation for OpenAI
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    await this.init();

    const profile = await getModelProfile(this.getName(), this.model);
    const maxChars = profile.maxChunkChars || 8000;
    const maxItemTokens = profile.maxTokens || MAX_ITEM_TOKENS;

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

        // Fail if item exceeds model's maximum token limit - don't create zero-vector pollution
        if (itemTokens > maxItemTokens) {
          throw new Error(
            `Text at index ${i} exceeds maximum token limit for ${this.model} (${itemTokens} > ${maxItemTokens}). ` +
            `This would create corrupted embeddings. Consider reducing chunk size or increasing ` +
            `CODEVAULT_EMBEDDING_MAX_TOKENS. Text preview: ${text.slice(0, 100)}...`
          );
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
          const { log } = await import('../utils/logger.js');
          log.debug(`  → API call ${batchCount}: ${currentBatch.length} items (${currentBatchTokens} tokens)`);
        }

        const batchEmbeddings = await this.rateLimiter.execute(async () => {
          const requestBody: any = {
            model: this.model,
            input: currentBatch
          };

          // Add provider routing for OpenRouter if configured
          if (this.routingConfig && this.isOpenRouter()) {
            requestBody.provider = this.routingConfig;
          }

          const response = await this.openai!.embeddings.create(requestBody);

          // Validate response structure
          if (!response || !response.data || !Array.isArray(response.data)) {
            const meta = {
              topLevelKeys: response ? Object.keys(response as any) : [],
              dataType: typeof response?.data,
              dataLength: Array.isArray(response?.data) ? response.data.length : undefined,
              errorPayload: (response as any)?.error ? JSON.stringify((response as any).error).slice(0, 200) : undefined
            };
            // Surface only at debug level; normal runs stay clean
            if (process.env.CODEVAULT_LOG_LEVEL === 'debug') {
              const { log } = await import('../utils/logger.js');
              log.debug('[codevault] Invalid API response (batch)', meta);
            }
            throw new Error(`Invalid API response: expected data array, got ${typeof response?.data}`);
          }

          // Check if we got the right number of embeddings
          if (response.data.length !== currentBatch.length) {
            throw new Error(`API returned ${response.data.length} embeddings but expected ${currentBatch.length}. Response data length mismatch.`);
          }

          // Validate each embedding
          const embeddings = response.data.map((item, idx) => {
            if (!item || !item.embedding || !Array.isArray(item.embedding)) {
              throw new Error(`Invalid embedding at index ${idx}: expected array, got ${typeof item?.embedding}`);
            }
            return item.embedding;
          });

          return embeddings;
        });

        allEmbeddings.push(...batchEmbeddings);
      }
    }

    if (!process.env.CODEVAULT_QUIET) {
      const { log } = await import('../utils/logger.js');
      log.debug(`  ✓ Batch complete: ${texts.length} embeddings from ${batchCount} API call(s)\n`);
    }

    return allEmbeddings;
  }
}
