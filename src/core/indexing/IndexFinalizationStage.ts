import { saveMerkleAsync } from '../../indexer/merkle.js';
import { writeCodemapAsync } from '../../codemap/io.js';
import { attachSymbolGraphToCodemap } from '../../symbols/graph.js';
import { getTokenCountStats } from '../../chunking/token-counter.js';
import { logger } from '../../utils/logger.js';
import type { IndexContextData } from './IndexContext.js';
import type { IndexState } from './IndexState.js';
import type { IndexProjectResult } from '../types.js';
import { PersistManager } from './PersistManager.js';

/**
 * IndexFinalizationStage handles the finalization of the indexing process:
 * - Flushing batch processor
 * - Saving merkle tree
 * - Building symbol graph
 * - Writing codemap
 * - Building result object
 * - Cleaning up resources
 */
export class IndexFinalizationStage {
  constructor(
    private context: IndexContextData,
    private state: IndexState,
    private onProgress: ((event: any) => void) | null,
    private persistManager: PersistManager
  ) {}

  /**
   * Finalize the indexing process
   */
  async finalize(): Promise<IndexProjectResult> {
    try {
      // Notify progress
      if (this.onProgress) {
        this.onProgress({ type: 'finalizing' });
      }

      // Flush any remaining embeddings
      await this.flushBatchProcessor();

      // Build symbol graph and write codemap
      attachSymbolGraphToCodemap(this.state.codemap);
      this.state.markIndexMutated();

      // Persist any pending data (debounced during processing)
      await this.persistManager.flush();

      // Final guard: ensure codemap and merkle are written
      if (this.state.indexMutated) {
        this.state.codemap = await writeCodemapAsync(this.context.codemapPath, this.state.codemap);
        this.state.indexMutated = false;
      }
      if (this.state.merkleDirty) {
        await saveMerkleAsync(this.context.repo, this.state.updatedMerkle);
        this.state.merkleDirty = false;
      }

      // Get token statistics
      const tokenStats = getTokenCountStats();

      // Log statistics
      this.logStatistics();

      // Build result
      return this.buildResult(tokenStats);
    } finally {
      // Clean up resources
      await this.cleanup();
    }
  }

  /**
   * Flush the batch processor
   */
  private async flushBatchProcessor(): Promise<void> {
    try {
      if (this.context.batchProcessor) {
        await this.context.batchProcessor.flush();
      }
    } catch (error) {
      this.state.addError({
        type: 'finalize_error',
        error: (error as Error).message
      });
    }
  }

  /**
   * Log chunking and processing statistics
   */
  private logStatistics(): void {
    if (!process.env.CODEVAULT_QUIET) {
      logger.info('Chunking Statistics', {
        stats: { ...this.state.chunkingStats },
        processedChunks: this.state.processedChunks,
        totalChunks: Object.keys(this.state.codemap).length
      });
    }
  }

  /**
   * Build the final result object
   */
  private buildResult(tokenStats: any): IndexProjectResult {
    return {
      success: true,
      processedChunks: this.state.processedChunks,
      totalChunks: Object.keys(this.state.codemap).length,
      provider: this.context.providerInstance.getName(),
      errors: this.state.errors,
      chunkingStats: this.state.chunkingStats,
      tokenStats: this.context.modelProfile.useTokens ? tokenStats : undefined
    };
  }

  /**
   * Clean up resources
   */
  private async cleanup(): Promise<void> {
    // Close database connection
    try {
      if (this.context.db) {
        this.context.db.close();
      }
    } catch (error) {
      this.state.addError({
        type: 'db_close_error',
        error: (error as Error).message
      });
    }
  }
}
