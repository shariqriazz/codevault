import { BATCH_SIZE } from '../providers/base.js';
import type { EmbeddingProvider } from '../providers/base.js';
import type { Database } from '../database/db.js';
import { Mutex } from '../utils/mutex.js';
import { log } from '../utils/logger.js';

const MAX_BATCH_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

function isRateLimitError(error: any): boolean {
  const message = error?.message || String(error);
  return (
    error?.status === 429 ||
    error?.statusCode === 429 ||
    message.includes('rate limit') ||
    message.includes('Rate limit') ||
    message.includes('too many requests') ||
    message.includes('429')
  );
}

function isBatchSizeError(error: any): boolean {
  const message = error?.message || String(error);
  return (
    error?.status === 413 ||
    message.includes('too large') ||
    message.includes('payload') ||
    message.includes('request size') ||
    message.includes('token limit')
  );
}

interface ChunkToEmbed {
  chunkId: string;
  enhancedEmbeddingText: string;
  params: {
    code: string;
    sha: string;
    lang: string;
    rel: string;
    symbol: string;
    chunkType: string;
    codevaultMetadata: any;
    importantVariables: any[];
    docComments: string | null;
    contextInfo: any;
  };
}

export class BatchEmbeddingProcessor {
  private batch: ChunkToEmbed[] = [];
  private batchSize: number;
  private mutex = new Mutex();

  constructor(
    private embeddingProvider: EmbeddingProvider,
    private db: Database,
    batchSize: number = BATCH_SIZE
  ) {
    this.batchSize = batchSize;
  }

  /**
   * Add a chunk to the batch queue
   */
  async addChunk(chunk: ChunkToEmbed): Promise<void> {
    this.batch.push(chunk);

    // Process batch when it reaches the threshold
    if (this.batch.length >= this.batchSize) {
      await this.processBatch();
    }
  }

  /**
   * Process any remaining chunks in the batch
   */
  async flush(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      if (this.batch.length > 0) {
        await this.processBatchWithRetry(this.batch, 0);
        this.batch = [];
      }
    });
  }

  /**
   * Process the current batch (with mutex protection)
   */
  private async processBatch(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      if (this.batch.length > 0) {
        await this.processBatchWithRetry(this.batch, 0);
        this.batch = [];
      }
    });
  }

  /**
   * Process a batch with smart error handling and retry logic
   */
  private async processBatchWithRetry(currentBatch: ChunkToEmbed[], retryCount: number): Promise<void> {
    try {
      await this.processBatchInternal(currentBatch);
    } catch (error) {
      // Smart error handling based on error type
      if (isBatchSizeError(error) && currentBatch.length > 1) {
        // Batch too large - split in half and retry
        log.warn(`Batch size too large (${currentBatch.length} chunks), splitting and retrying`);
        const mid = Math.floor(currentBatch.length / 2);
        const firstHalf = currentBatch.slice(0, mid);
        const secondHalf = currentBatch.slice(mid);

        // Process both halves recursively
        await this.processBatchWithRetry(firstHalf, 0);
        await this.processBatchWithRetry(secondHalf, 0);
        return;
      } else if (isRateLimitError(error) && retryCount < MAX_BATCH_RETRIES) {
        // Rate limit error - exponential backoff
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
        log.warn(`Rate limit hit, retrying batch in ${delay}ms (attempt ${retryCount + 1}/${MAX_BATCH_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delay));

        await this.processBatchWithRetry(currentBatch, retryCount + 1);
        return;
      }

      // Other errors or max retries reached - fall back to individual processing
      log.error(`Batch processing failed for ${currentBatch.length} chunks`, error);
      log.warn('Falling back to individual processing (this will be slower)');

      await this.fallbackToIndividualProcessing(currentBatch);
    }
  }

  /**
   * Internal batch processing implementation with database transactions
   */
  private async processBatchInternal(batch: ChunkToEmbed[]): Promise<void> {
    if (batch.length === 0) return;

    // Extract texts for embedding
    const texts = batch.map(chunk => chunk.enhancedEmbeddingText);

    // Log batching activity at debug to reduce noise in normal runs
    log.debug(`Processing batch of ${texts.length} chunks`);

    // Generate embeddings in batch (single API call for all)
    const generate = async () => this.embeddingProvider.generateEmbeddings(texts);
    const embeddings = this.embeddingProvider.rateLimiter
      ? await this.embeddingProvider.rateLimiter.execute(generate)
      : await generate();

    log.debug(`Batch complete (${texts.length} embeddings generated)`);

    // Store all embeddings in database within a transaction
    await this.db.transaction(() => {
      for (let i = 0; i < batch.length; i++) {
        const chunk = batch[i];
        const embedding = embeddings[i];

        this.db.insertChunk({
          id: chunk.chunkId,
          file_path: chunk.params.rel,
          symbol: chunk.params.symbol,
          sha: chunk.params.sha,
          lang: chunk.params.lang,
          chunk_type: chunk.params.chunkType,
          embedding,
          embedding_provider: this.embeddingProvider.getName(),
          embedding_dimensions: this.embeddingProvider.getDimensions(),
          codevault_tags: chunk.params.codevaultMetadata.tags,
          codevault_intent: chunk.params.codevaultMetadata.intent,
          codevault_description: chunk.params.codevaultMetadata.description,
          doc_comments: chunk.params.docComments,
          variables_used: chunk.params.importantVariables,
          context_info: chunk.params.contextInfo
        });
      }
    });
  }

  /**
   * Fall back to processing chunks individually
   */
  private async fallbackToIndividualProcessing(batch: ChunkToEmbed[]): Promise<void> {
    // Collect errors but continue processing all chunks to avoid data loss
    const errors: Array<{ chunkId: string; error: Error }> = [];

    for (const chunk of batch) {
      try {
        const embedding = await this.embeddingProvider.generateEmbedding(chunk.enhancedEmbeddingText);

        this.db.insertChunk({
          id: chunk.chunkId,
          file_path: chunk.params.rel,
          symbol: chunk.params.symbol,
          sha: chunk.params.sha,
          lang: chunk.params.lang,
          chunk_type: chunk.params.chunkType,
          embedding,
          embedding_provider: this.embeddingProvider.getName(),
          embedding_dimensions: this.embeddingProvider.getDimensions(),
          codevault_tags: chunk.params.codevaultMetadata.tags,
          codevault_intent: chunk.params.codevaultMetadata.intent,
          codevault_description: chunk.params.codevaultMetadata.description,
          doc_comments: chunk.params.docComments,
          variables_used: chunk.params.importantVariables,
          context_info: chunk.params.contextInfo
        });
      } catch (individualError) {
        log.error(`Failed to process chunk ${chunk.chunkId}`, individualError);
        errors.push({
          chunkId: chunk.chunkId,
          error: individualError as Error
        });
      }
    }

    // Report errors but don't throw to allow indexing to continue
    if (errors.length > 0) {
      log.warn(`${errors.length}/${batch.length} chunks failed in fallback processing`);
      if (errors.length === batch.length) {
        // Only throw if ALL chunks failed
        throw new Error(`All ${errors.length} chunks failed to process: ${errors[0].error.message}`);
      }
    }
  }

  /**
   * Get current batch size for monitoring
   */
  getBatchCount(): number {
    return this.batch.length;
  }
}
