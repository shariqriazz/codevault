import type { DatabaseChunk } from '../../database/db.js';
import type { SearchCandidate } from './CandidateRetriever.js';
import { BM25Index } from '../../search/bm25.js';
import { reciprocalRankFusion } from '../../search/hybrid.js';
import { SimpleLRU } from '../../utils/simple-lru.js';
import { readChunkFromDisk } from '../../storage/encrypted-chunks.js';
import { RRF_K, CACHE_CONSTANTS } from '../../config/constants.js';
import { logger } from '../../utils/logger.js';

/**
 * ChunkLoadingStats tracks failures when loading chunk text for BM25
 */
interface ChunkLoadingStats {
  totalAttempted: number;
  failed: number;
  reasons: Map<string, number>;
}

/**
 * HybridFusion handles:
 * - BM25 index management with caching
 * - Reciprocal Rank Fusion of vector + BM25 results
 * - Symbol boosting
 * - Result sorting
 */
export class HybridFusion {
  private bm25Cache: SimpleLRU<string, { index: BM25Index; added: Set<string> }>;
  private chunkCache: SimpleLRU<string, string | null>;
  private chunkLoadingStats: ChunkLoadingStats = {
    totalAttempted: 0,
    failed: 0,
    reasons: new Map()
  };

  constructor() {
    this.bm25Cache = new SimpleLRU(CACHE_CONSTANTS.MAX_BM25_CACHE_SIZE);
    this.chunkCache = new SimpleLRU(CACHE_CONSTANTS.MAX_CHUNK_TEXT_CACHE_SIZE);
    this.resetChunkLoadingStats();
  }

  /**
   * Use BM25 to prefilter candidates before vector scoring
   */
  async prefilterCandidates(params: {
    hybridEnabled: boolean;
    bm25Enabled: boolean;
    query: string;
    providerName: string;
    providerDimensions: number;
    chunkDir: string;
    basePath: string;
    scopedChunks: DatabaseChunk[];
    limit: number;
  }): Promise<{ candidateIds: Set<string>; bm25Results: Array<{ id: string; score: number }> }> {
    const {
      hybridEnabled,
      bm25Enabled,
      query,
      providerName,
      providerDimensions,
      chunkDir,
      basePath,
      scopedChunks,
      limit
    } = params;

    if (!hybridEnabled || !bm25Enabled) {
      return { candidateIds: new Set(), bm25Results: [] };
    }

    const bm25Index = await this.ensureBm25IndexForChunks(
      basePath,
      chunkDir,
      providerName,
      providerDimensions,
      scopedChunks
    );

    if (!bm25Index) {
      return { candidateIds: new Set(), bm25Results: [] };
    }

    const allowedIds = new Set(scopedChunks.map(chunk => chunk.id));
    const bm25RawResults = bm25Index.search(query, limit);
    const bm25Results = bm25RawResults.filter(result => allowedIds.has(result.id));
    const candidateIds = new Set(bm25Results.map(result => result.id));

    return { candidateIds, bm25Results };
  }

  /**
   * Attempt hybrid fusion of vector and BM25 results
   */
  async fuseResults(params: {
    hybridEnabled: boolean;
    bm25Enabled: boolean;
    selectionBudget: number;
    query: string;
    providerName: string;
    providerDimensions: number;
    chunkDir: string;
    basePath: string;
    scopedChunks: DatabaseChunk[];
    chunkInfoById: Map<string, SearchCandidate>;
    vectorPool: SearchCandidate[];
    bm25ResultsOverride?: Array<{ id: string; score: number }>;
  }): Promise<{
    fusedResults: SearchCandidate[];
    bm25Fused: boolean;
    bm25CandidateCount: number;
  }> {
    const {
      hybridEnabled,
      bm25Enabled,
      selectionBudget,
      query,
      providerName,
      providerDimensions,
      chunkDir,
      basePath,
      scopedChunks,
      chunkInfoById,
      vectorPool,
      bm25ResultsOverride
    } = params;

    let fusedResults: SearchCandidate[] = [];
    let bm25Fused = false;
    let bm25CandidateCount = 0;

    if (hybridEnabled && bm25Enabled) {
      const bm25Index = await this.ensureBm25IndexForChunks(
        basePath,
        chunkDir,
        providerName,
        providerDimensions,
        scopedChunks
      );

      if (bm25Index) {
        const allowedIds = new Set(scopedChunks.map(chunk => chunk.id));
        const bm25RawResults =
          bm25ResultsOverride && bm25ResultsOverride.length > 0
            ? bm25ResultsOverride
            : bm25Index.search(query, selectionBudget);

        const bm25Results = bm25RawResults.filter(result => allowedIds.has(result.id));
        bm25CandidateCount = bm25Results.length;
        const bm25ResultsForFusion = bm25Results.slice(0, selectionBudget);

        if (bm25ResultsForFusion.length > 0) {
          const fused = reciprocalRankFusion({
            vectorResults: vectorPool
              .slice(0, selectionBudget)
              .map(item => ({ id: item.id, score: item.score })),
            bm25Results: bm25ResultsForFusion.map(item => ({
              id: item.id,
              score: item.score
            })),
            limit: selectionBudget,
            k: RRF_K
          });

          if (fused.length > 0) {
            bm25Fused = true;
            fusedResults = fused
              .map(entry => {
                const info = chunkInfoById.get(entry.id);
                if (!info) return null;
                info.hybridScore = entry.score;
                info.bm25Score = entry.bm25Score;
                info.bm25Rank = entry.bm25Rank;
                info.vectorRank = entry.vectorRank;
                return info;
              })
              .filter((item): item is SearchCandidate => item !== null);
          }
        }
      }
    }

    return { fusedResults, bm25Fused, bm25CandidateCount };
  }

  /**
   * Sort results with symbol boost priority
   */
  sortWithSymbolBoost(
    results: SearchCandidate[],
    symbolBoostEnabled: boolean
  ): SearchCandidate[] {
    const hasSymbolBoost =
      symbolBoostEnabled &&
      results.some(
        candidate =>
          typeof candidate.symbolBoost === 'number' && candidate.symbolBoost > 0
      );

    if (hasSymbolBoost && results.length > 1) {
      return [...results].sort((a, b) => {
        const scoreA = typeof a.score === 'number' ? a.score : 0;
        const scoreB = typeof b.score === 'number' ? b.score : 0;
        if (scoreB !== scoreA) return scoreB - scoreA;

        const boostA = typeof a.symbolBoost === 'number' ? a.symbolBoost : 0;
        const boostB = typeof b.symbolBoost === 'number' ? b.symbolBoost : 0;
        if (boostB !== boostA) return boostB - boostA;

        const hybridA =
          typeof a.hybridScore === 'number'
            ? a.hybridScore
            : Number.NEGATIVE_INFINITY;
        const hybridB =
          typeof b.hybridScore === 'number'
            ? b.hybridScore
            : Number.NEGATIVE_INFINITY;
        return hybridB - hybridA;
      });
    }

    return results;
  }

  /**
   * Clear caches
   */
  clearCaches(): void {
    logger.debug('Clearing hybrid fusion caches');
    this.bm25Cache.clear();
    this.chunkCache.clear();
  }

  /**
   * Get chunk loading failure statistics
   */
  getChunkLoadingFailures() {
    if (this.chunkLoadingStats.failed === 0) {
      return undefined;
    }

    const reasons: any = {};
    for (const [reason, count] of this.chunkLoadingStats.reasons.entries()) {
      reasons[reason] = count;
    }

    return {
      totalAttempted: this.chunkLoadingStats.totalAttempted,
      failed: this.chunkLoadingStats.failed,
      reasons
    };
  }

  /**
   * Build warning messages from chunk loading failures
   */
  buildWarnings(): string[] | undefined {
    if (this.chunkLoadingStats.failed === 0) {
      return undefined;
    }

    const warnings: string[] = [];
    const stats = this.chunkLoadingStats;

    if (stats.reasons.has('encryption_key_required')) {
      const count = stats.reasons.get('encryption_key_required');
      warnings.push(
        `Could not load ${count} encrypted chunk(s). Set CODEVAULT_ENCRYPTION_KEY environment variable to access encrypted chunks.`
      );
    }

    if (stats.reasons.has('encryption_auth_failed')) {
      const count = stats.reasons.get('encryption_auth_failed');
      warnings.push(
        `Failed to decrypt ${count} chunk(s). The encryption key may be incorrect.`
      );
    }

    if (stats.reasons.has('file_not_found')) {
      const count = stats.reasons.get('file_not_found');
      warnings.push(
        `${count} chunk file(s) not found. The index may be out of sync. Try re-indexing.`
      );
    }

    const otherFailures =
      stats.failed -
      (stats.reasons.get('encryption_key_required') || 0) -
      (stats.reasons.get('encryption_auth_failed') || 0) -
      (stats.reasons.get('file_not_found') || 0);

    if (otherFailures > 0) {
      warnings.push(
        `${otherFailures} chunk(s) failed to load due to other errors. Check logs for details.`
      );
    }

    return warnings.length > 0 ? warnings : undefined;
  }

  /**
   * Reset chunk loading statistics
   */
  resetChunkLoadingStats(): void {
    this.chunkLoadingStats = {
      totalAttempted: 0,
      failed: 0,
      reasons: new Map()
    };
  }

  // Private helpers

  private async ensureBm25IndexForChunks(
    basePath: string,
    chunkDir: string,
    providerName: string,
    dimensions: number,
    chunks: DatabaseChunk[]
  ): Promise<BM25Index | null> {
    if (!Array.isArray(chunks) || chunks.length === 0) return null;

    const key = this.getBm25CacheKey(basePath, providerName, dimensions);
    let entry = this.bm25Cache.get(key);

    if (!entry) {
      entry = { index: new BM25Index(), added: new Set() };
      this.bm25Cache.set(key, entry);
    }

    const toAdd: Array<{ id: string; text: string }> = [];
    for (const chunk of chunks) {
      if (!chunk || !chunk.id || entry.added.has(chunk.id)) continue;

      const codeText = await this.readChunkTextCached(chunk.sha, chunkDir, basePath);
      const docText = this.buildBm25Document(chunk, codeText);

      if (docText && docText.trim().length > 0) {
        toAdd.push({ id: chunk.id, text: docText });
      }
      entry.added.add(chunk.id);
    }

    if (toAdd.length > 0) entry.index.addDocuments(toAdd);
    entry.index.consolidate();

    return entry.index;
  }

  private async readChunkTextCached(
    sha: string,
    chunkDir: string,
    basePath: string
  ): Promise<string | null> {
    if (!sha) return null;

    const cacheKey = this.getChunkCacheKey(basePath, sha);
    const cached = this.chunkCache.get(cacheKey);
    if (cached !== undefined) return cached;

    this.chunkLoadingStats.totalAttempted++;

    try {
      const result = await readChunkFromDisk({ chunkDir, sha });
      const code = result ? result.code : null;
      this.chunkCache.set(cacheKey, code);

      if (!result) {
        this.chunkLoadingStats.failed++;
        const reason = 'file_not_found';
        this.chunkLoadingStats.reasons.set(
          reason,
          (this.chunkLoadingStats.reasons.get(reason) || 0) + 1
        );
      }

      return code;
    } catch (error: any) {
      this.chunkLoadingStats.failed++;
      const reason = error.code ? String(error.code).toLowerCase() : 'unknown_error';
      this.chunkLoadingStats.reasons.set(
        reason,
        (this.chunkLoadingStats.reasons.get(reason) || 0) + 1
      );

      logger.warn(`Failed to load chunk ${sha}`, {
        error: error.message,
        code: error.code
      });

      this.chunkCache.set(cacheKey, null);
      return null;
    }
  }

  private buildBm25Document(chunk: any, codeText: string | null): string {
    if (!chunk) return '';

    const parts = [
      chunk.symbol,
      chunk.file_path,
      chunk.codevault_description,
      chunk.codevault_intent,
      codeText
    ].filter(value => typeof value === 'string' && value.trim().length > 0);

    return parts.join('\n');
  }

  private getBm25CacheKey(
    basePath: string,
    providerName: string,
    dimensions: number
  ): string {
    return `${basePath}::${providerName}::${dimensions}`;
  }

  private getChunkCacheKey(basePath: string, sha: string): string {
    return `${basePath}::${sha}`;
  }
}
