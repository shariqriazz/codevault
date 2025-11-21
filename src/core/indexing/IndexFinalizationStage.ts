import { saveMerkleAsync } from '../../indexer/merkle.js';
import { writeCodemapAsync } from '../../codemap/io.js';
import { attachSymbolGraphToCodemap } from '../../symbols/graph.js';
import { getTokenCountStats } from '../../chunking/token-counter.js';
import { logger } from '../../utils/logger.js';
import type { IndexContextData } from './IndexContext.js';
import type { IndexState } from './IndexState.js';
import type { IndexProjectResult } from '../types.js';
import { PersistManager } from './PersistManager.js';
import fs from 'fs';
import path from 'path';

interface IndexProgressEvent {
  type: string;
  [key: string]: unknown;
}

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
    private onProgress: ((event: IndexProgressEvent) => void) | null,
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

      this.cleanupOrphanedChunks();

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
      this.cleanup();
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
  private buildResult(tokenStats: unknown): IndexProjectResult {
    return {
      success: true,
      processedChunks: this.state.processedChunks,
      totalChunks: Object.keys(this.state.codemap).length,
      provider: this.context.providerInstance.getName(),
      errors: this.state.errors as Array<{ type: string; file?: string; chunkId?: string; error: string }>,
      chunkingStats: this.state.chunkingStats,
      tokenStats: this.context.modelProfile.useTokens ? tokenStats : undefined
    };
  }

  /**
   * Remove orphaned chunks whose source files no longer exist
   */
  private cleanupOrphanedChunks(): void {
    if (!this.context.db) return;

    const paths = this.context.db.getAllFilePaths();
    if (!Array.isArray(paths) || paths.length === 0) return;

    const base = this.context.repo;
    const orphaned: string[] = [];

    for (const rel of paths) {
      const full = path.join(base, rel);
      if (!fs.existsSync(full)) {
        orphaned.push(rel);
      }
    }

    if (orphaned.length === 0) {
      return;
    }

    logger.info(`Removing ${orphaned.length} orphaned files from index`);

    for (const rel of orphaned) {
      this.context.db.deleteChunksByFilePath(rel);
      for (const [chunkId, meta] of Object.entries(this.state.codemap)) {
        if (meta && typeof meta === 'object' && 'file' in meta && meta.file === rel) {
          delete this.state.codemap[chunkId];
        }
      }
      delete this.state.updatedMerkle[rel];
    }

    this.state.markIndexMutated();
    this.state.markMerkleDirty();
    this.persistManager.scheduleCodemapSave();
    this.persistManager.scheduleMerkleSave();
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
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
