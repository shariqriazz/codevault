import { BATCH_SIZE } from '../providers/base.js';
import type { EmbeddingProvider } from '../providers/base.js';
import type { Database } from '../database/db.js';

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
    if (this.batch.length > 0) {
      await this.processBatch();
    }
  }

  /**
   * Process the current batch of chunks
   */
  private async processBatch(): Promise<void> {
    if (this.batch.length === 0) return;

    const currentBatch = [...this.batch];
    this.batch = [];

    try {
      // Extract texts for embedding
      const texts = currentBatch.map(chunk => chunk.enhancedEmbeddingText);
      
      // Log batching activity
      if (!process.env.CODEVAULT_QUIET) {
        console.log(`🚀 Processing batch of ${texts.length} chunks...`);
      }
      
      // Generate embeddings in batch (single API call for all)
      const embeddings = await this.embeddingProvider.generateEmbeddings(texts);
      
      if (!process.env.CODEVAULT_QUIET) {
        console.log(`✓ Batch complete (${texts.length} embeddings generated)`);
      }
      
      // Store all embeddings in database
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
    } catch (error) {
      // On batch failure, fall back to individual processing
      console.warn(`Batch processing failed for ${currentBatch.length} chunks, falling back to individual processing`);
      
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
          console.error(`Failed to process chunk ${chunk.chunkId}:`, individualError);
          throw individualError;
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