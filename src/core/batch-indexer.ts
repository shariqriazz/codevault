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
        await this.processBatchInternal();
      }
    });
  }

  /**
   * Process the current batch (with mutex protection)
   */
  private async processBatch(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      if (this.batch.length > 0) {
        await this.processBatchInternal();
      }
    });
  }

  /**
   * Internal batch processing implementation
   */
  private async processBatchInternal(): Promise<void> {
    if (this.batch.length === 0) return;

    const currentBatch = [...this.batch];
    this.batch = [];

    try {
      // Extract texts for embedding
      const texts = currentBatch.map(chunk => chunk.enhancedEmbeddingText);

      // Log batching activity
      log.info(`Processing batch of ${texts.length} chunks`);

      // Generate embeddings in batch (single API call for all)
      const embeddings = await this.embeddingProvider.generateEmbeddings(texts);

      log.info(`Batch complete (${texts.length} embeddings generated)`);

      // Store all embeddings in database within a transaction
      await this.db.transaction(async () => {
        for (let i = 0; i < currentBatch.length; i++) {
          const chunk = currentBatch[i];
          const embedding = embeddings[i];

          await this.db.insertChunk({
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
    } catch (error) {
      // On batch failure, fall back to individual processing
      log.error(`Batch processing failed for ${currentBatch.length} chunks`, error);
      log.warn('Falling back to individual processing (this will be slower)');

      // Collect errors but continue processing all chunks to avoid data loss
      const errors: Array<{ chunkId: string; error: Error }> = [];

      for (const chunk of currentBatch) {
        try {
          const embedding = await this.embeddingProvider.generateEmbedding(chunk.enhancedEmbeddingText);

          await this.db.insertChunk({
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
        log.warn(`${errors.length}/${currentBatch.length} chunks failed in fallback processing`);
        if (errors.length === currentBatch.length) {
          // Only throw if ALL chunks failed
          throw new Error(`All ${errors.length} chunks failed to process: ${errors[0].error.message}`);
        }
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