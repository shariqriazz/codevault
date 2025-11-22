import { BATCH_SIZE } from '../providers/base.js';
import type { EmbeddingProvider } from '../providers/base.js';
import type { Database } from '../database/db.js';
import { Mutex } from '../utils/mutex.js';
import { log, type LogValue } from '../utils/logger.js';
import type { CodevaultMetadata, ImportantVariable } from './metadata.js';

interface ErrorLike {
  message?: string;
  status?: number;
  statusCode?: number;
  response?: {
    data?: unknown;
  };
  error?: {
    data?: unknown;
  };
  topLevelKeys?: unknown;
}

const MAX_BATCH_RETRIES = 3;
const MAX_TRANSIENT_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const JITTER_FACTOR = 0.2; // ±20% jitter to avoid thundering herd
const MAX_FATAL_RETRIES = 1; // Try fatal batch once more, then per-chunk
const MAX_ANY_RETRIES = 6; // Upper cap for repeated full-batch retries on transient/provider errors

function isRateLimitError(error: unknown): boolean {
  const errorLike = error as ErrorLike;
  const message = errorLike?.message || String(error);
  return (
    errorLike?.status === 429 ||
    errorLike?.statusCode === 429 ||
    message.includes('rate limit') ||
    message.includes('Rate limit') ||
    message.includes('too many requests') ||
    message.includes('429')
  );
}

function isBatchSizeError(error: unknown): boolean {
  const errorLike = error as ErrorLike;
  const message = errorLike?.message || String(error);
  return (
    errorLike?.status === 413 ||
    message.includes('too large') ||
    message.includes('payload') ||
    message.includes('request size') ||
    message.includes('token limit')
  );
}

function isTransientApiError(error: unknown): boolean {
  const errorLike = error as ErrorLike;
  const status = errorLike?.status || errorLike?.statusCode;
  const message = errorLike?.message || String(error);

  // Upstream 5xx/gateway and common flaky transport signals
  return (
    (typeof status === 'number' && status >= 500 && status < 600) ||
    message.includes('Invalid API response') ||
    message.includes('Bad Gateway') ||
    message.includes('Service Unavailable') ||
    message.includes('Gateway Timeout') ||
    message.includes('socket hang up') ||
    message.includes('ECONNRESET') ||
    message.includes('ETIMEDOUT') ||
    message.includes('EAI_AGAIN')
  );
}

const withJitter = (base: number): number => {
  const factor = 1 + (Math.random() * 2 - 1) * JITTER_FACTOR; // 0.8–1.2
  return Math.max(0, Math.floor(base * factor));
};

// Backoff helper (unique name to avoid duplicate definitions on reload)
const backoffWithCapEmbed = (attempt: number): number => {
  const base = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
  return Math.min(base, 20000); // cap at 20s
};

function serializeErrorForLog(error: unknown): { [key: string]: LogValue } {
  const info: { [key: string]: LogValue } = {};
  if (!error) return { message: 'unknown error' };

  const errorLike = error as ErrorLike & Record<string, unknown>;
  const candidates = ['message', 'name', 'code', 'status', 'statusCode', 'type'] as const;
  for (const key of candidates) {
    if (errorLike[key] !== undefined) {
      const value = errorLike[key];
      info[key] =
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
          ? value
          : JSON.stringify(value);
    }
  }

  // OpenAI SDK sometimes nests response data on error.response or error.error
  const responseData = errorLike?.response?.data ?? errorLike?.error?.data;
  if (responseData !== undefined) {
    try {
      const json = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
      info.responseData = json.slice(0, 500); // cap to avoid huge logs
    } catch {
      info.responseData = '[unserializable responseData]';
    }
  }

  return info;
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
    codevaultMetadata: CodevaultMetadata;
    importantVariables: ImportantVariable[];
    docComments: string | null;
    contextInfo: Record<string, unknown>;
  };
}

/**
 * Batches chunk embeddings for efficiency and handles retry/backoff with a SQLite sink.
 *
 * Use `addChunk` to enqueue work and `flush` to force processing of remaining items.
 */
export class BatchEmbeddingProcessor {
  private batch: ChunkToEmbed[] = [];
  private batchSize: number;
  private mutex = new Mutex();
  private onChunkEmbedded?: (info: { file: string; chunkId: string }) => void;

  constructor(
    private embeddingProvider: EmbeddingProvider,
    private db: Database,
    batchSize: number = BATCH_SIZE
  ) {
    this.batchSize = batchSize;
  }

  setOnChunkEmbedded(cb: (info: { file: string; chunkId: string }) => void): void {
    this.onChunkEmbedded = cb;
  }

  /**
   * Add a chunk to the batch queue
   */
  async addChunk(chunk: ChunkToEmbed): Promise<void> {
    let batchToProcess: ChunkToEmbed[] | null = null;

    await this.mutex.runExclusive(async () => {
      this.batch.push(chunk);

      // Snapshot the batch when it reaches the threshold; process it outside the lock
      if (this.batch.length >= this.batchSize) {
        batchToProcess = this.batch;
        this.batch = [];
      }
      await Promise.resolve();
    });

    if (batchToProcess) {
      await this.processBatchWithRetry(batchToProcess);
    }
  }

  /**
   * Process any remaining chunks in the batch
   */
  async flush(): Promise<void> {
    let batchToProcess: ChunkToEmbed[] | null = null;

    await this.mutex.runExclusive(async () => {
      if (this.batch.length > 0) {
        batchToProcess = this.batch;
        this.batch = [];
      }
      await Promise.resolve();
    });

    if (batchToProcess) {
      await this.processBatchWithRetry(batchToProcess);
    }
  }

  /**
   * Process a batch with smart error handling and retry logic
   */
  private async processBatchWithRetry(
    currentBatch: ChunkToEmbed[],
    retryState: RetryState = { rate: 0, transient: 0 },
    depth: number = 0,
    fatalSeen: boolean = false
  ): Promise<void> {
    try {
      await this.processBatchInternal(currentBatch);
    } catch (error) {
      log.debug('Batch processing error', {
        batchSize: currentBatch.length,
        depth,
        retryRate: retryState.rate,
        retryTransient: retryState.transient,
        retryFatal: retryState.fatal ?? 0,
        fatalSeen,
        provider: this.embeddingProvider.getName?.() ?? 'unknown',
        error: serializeErrorForLog(error),
        sampleChunks: currentBatch.slice(0, 3).map(c => c.chunkId)
      });

      const fatalApi = isFatalApiResponse(error);

      // Smart error handling based on error type
      if (!fatalApi && isBatchSizeError(error) && currentBatch.length > 1) {
        // Batch too large - split in half and retry
        log.warn(`Batch size too large (${currentBatch.length} chunks), splitting and retrying`);
        const mid = Math.floor(currentBatch.length / 2);
        const firstHalf = currentBatch.slice(0, mid);
        const secondHalf = currentBatch.slice(mid);

        // Process both halves recursively
        await this.processBatchWithRetry(firstHalf, retryState, depth + 1, fatalSeen);
        await this.processBatchWithRetry(secondHalf, retryState, depth + 1, fatalSeen);
        return;
      } else if (!fatalApi && isRateLimitError(error) && retryState.rate < MAX_BATCH_RETRIES) {
        // Rate limit error - exponential backoff
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryState.rate);
        log.warn(`Rate limit hit, retrying batch in ${delay}ms (attempt ${retryState.rate + 1}/${MAX_BATCH_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delay));

        await this.processBatchWithRetry(
          currentBatch,
          { ...retryState, rate: retryState.rate + 1 },
          depth,
          fatalSeen
        );
        return;
      } else if (!fatalApi && isTransientApiError(error) && retryState.transient < MAX_TRANSIENT_RETRIES) {
        const baseDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryState.transient);
        const delay = withJitter(baseDelay);
        log.warn(
          `Transient API error, retrying batch in ${delay}ms (attempt ${retryState.transient + 1}/${MAX_TRANSIENT_RETRIES})`
        );
        await new Promise(resolve => setTimeout(resolve, delay));

        await this.processBatchWithRetry(
          currentBatch,
          { ...retryState, transient: retryState.transient + 1 },
          depth,
          fatalSeen
        );
        return;
      } else if (fatalApi) {
        const fatalAttempt = retryState.fatal ?? 0;
        if (fatalAttempt < MAX_FATAL_RETRIES) {
          const delay = backoffWithCapEmbed(fatalAttempt);
          log.debug(`Fatal API response. Retrying full batch after ${delay}ms (fatal attempt ${fatalAttempt + 1}/${MAX_FATAL_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          await this.processBatchWithRetry(
            currentBatch,
            { ...retryState, fatal: fatalAttempt + 1 },
            depth,
            true
          );
          return;
        }

        log.debug(`Fatal API response persisted after ${MAX_FATAL_RETRIES} retry. Falling back to per-chunk.`);
        await this.fallbackToIndividualProcessing(currentBatch);
        return;
      } else {
        // Transient but non-fatal provider errors: retry whole batch with capped backoff
        const attempt = retryState.any ?? 0;
        const delay = backoffWithCapEmbed(attempt);
        const nextAttempt = attempt + 1;

        if (nextAttempt > MAX_ANY_RETRIES) {
          log.debug(
            `Batch retry cap reached (${nextAttempt - 1}). Falling back to per-chunk processing; investigate provider errors.`,
            { batchSize: currentBatch.length }
          );
          await this.fallbackToIndividualProcessing(currentBatch);
          return;
        }

        log.debug(
          `Batch will be retried after backoff (${delay}ms) (attempt ${nextAttempt}/${MAX_ANY_RETRIES})`
        );

        await new Promise(resolve => setTimeout(resolve, delay));
        await this.processBatchWithRetry(
          currentBatch,
          { ...retryState, any: nextAttempt },
          depth,
          fatalApi || fatalSeen
        );
        return;
      }
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
    // Avoid double-wrapping with the provider's rate limiter; providers already
    // enforce their own rate limits internally.
    const embeddings = await this.embeddingProvider.generateEmbeddings(texts);

    log.debug(`Batch complete (${texts.length} embeddings generated)`);

    // Store all embeddings in database within a transaction
    const dbParams = batch.map((chunk, i) => {
      const embedding = embeddings[i];

      // Validate each embedding before insertion
      if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
        log.error(`Invalid embedding at index ${i} for chunk ${chunk.chunkId}`, {
          embeddingType: typeof embedding,
          isArray: Array.isArray(embedding),
          length: embedding?.length,
          embeddingsArrayLength: embeddings.length,
          batchLength: batch.length
        });
        throw new Error(`Invalid embedding at index ${i}: type=${typeof embedding}, isArray=${Array.isArray(embedding)}, length=${embedding?.length}`);
      }

      return {
        id: chunk.chunkId,
        file_path: chunk.params.rel,
        symbol: chunk.params.symbol,
        sha: chunk.params.sha,
        lang: chunk.params.lang,
        chunk_type: chunk.params.chunkType,
        embedding: embedding,
        embedding_provider: this.embeddingProvider.getName(),
        embedding_dimensions: this.embeddingProvider.getDimensions(),
        codevault_tags: chunk.params.codevaultMetadata.tags,
        codevault_intent: chunk.params.codevaultMetadata.intent,
        codevault_description: chunk.params.codevaultMetadata.description,
        doc_comments: chunk.params.docComments,
        variables_used: chunk.params.importantVariables.map(v => v.name),
        context_info: chunk.params.contextInfo
      };
    });

    this.db.insertChunks(dbParams);

    // Notify listeners that chunks are fully embedded and stored
    if (this.onChunkEmbedded) {
      for (const chunk of batch) {
        this.onChunkEmbedded({ file: chunk.params.rel, chunkId: chunk.chunkId });
      }
    }
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
          variables_used: chunk.params.importantVariables.map(v => v.name),
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

interface RetryState {
  rate: number;
  transient: number;
  fatal?: number;
  any?: number;
}

/**
 * Treat responses that return an error without data as fatal (deterministic) so we don't waste
 * transient retries on them.
 */
function isFatalApiResponse(error: unknown): boolean {
  if (!error) return false;
  const errorLike = error as ErrorLike & { topLevelKeys?: unknown[] };
  const msg = errorLike?.message || '';
  const status = errorLike?.status || errorLike?.statusCode;
  const hasErrorKey = Array.isArray(errorLike?.topLevelKeys) && errorLike.topLevelKeys.includes('error');
  const responseData = errorLike?.response?.data ?? errorLike?.error?.data;

  const invalidApi = msg.includes('Invalid API response');
  const clientError = status === 400 || status === 422;
  const noProvider = msg.includes('No successful provider responses') || status === 404;

  return invalidApi || hasErrorKey || clientError || noProvider || !!responseData;
}
