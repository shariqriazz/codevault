import type { Codemap } from '../../codemap/io.js';
import type { MerkleTree } from '../../indexer/merkle.js';
import type { ChunkingStats } from '../types.js';

/**
 * IndexState tracks mutable state during the indexing process
 */
export class IndexState {
  codemap: Codemap;
  updatedMerkle: MerkleTree;
  merkleDirty = false;
  indexMutated = false;
  processedChunks = 0;
  errors: any[] = [];
  chunkingStats: ChunkingStats = {
    totalNodes: 0,
    skippedSmall: 0,
    subdivided: 0,
    statementFallback: 0,
    normalChunks: 0,
    mergedSmall: 0
  };

  constructor(codemap: Codemap, updatedMerkle: MerkleTree) {
    this.codemap = codemap;
    this.updatedMerkle = updatedMerkle;
  }

  /**
   * Add an error to the error list
   */
  addError(error: { type: string; file?: string; chunkId?: string; error: string }): void {
    this.errors.push(error);
  }

  /**
   * Mark merkle tree as modified
   */
  markMerkleDirty(): void {
    this.merkleDirty = true;
  }

  /**
   * Mark index as modified
   */
  markIndexMutated(): void {
    this.indexMutated = true;
  }

  /**
   * Increment processed chunk counter
   */
  incrementProcessedChunks(): void {
    this.processedChunks++;
  }

  /**
   * Update chunking stats
   */
  updateChunkingStats(stats: Partial<ChunkingStats>): void {
    this.chunkingStats = { ...this.chunkingStats, ...stats };
  }

  /**
   * Get current error count
   */
  getErrorCount(): number {
    return this.errors.length;
  }

  /**
   * Check if index was modified
   */
  wasModified(): boolean {
    return this.indexMutated || this.merkleDirty;
  }
}
