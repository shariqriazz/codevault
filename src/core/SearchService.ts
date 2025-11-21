import fs from 'fs';
import path from 'path';
import { Database } from '../database/db.js';
import { normalizeScopeFilters, applyScope } from '../search/scope.js';
import { applySymbolBoost } from '../ranking/symbol-boost.js';
import { logger } from '../utils/logger.js';
import { readChunkFromDisk } from '../storage/encrypted-chunks.js';
import { RRF_K, SEARCH_CONSTANTS } from '../config/constants.js';
import type { ScopeFilters } from '../types/search.js';
import type { SearchCodeResult, SearchResult, GetChunkResult } from './types.js';
import { SearchContextManager } from './search/SearchContextManager.js';
import { CandidateRetriever } from './search/CandidateRetriever.js';
import { HybridFusion } from './search/HybridFusion.js';
import { ResultMapper } from './search/ResultMapper.js';

/**
 * SearchService orchestrates the search pipeline using specialized sub-services:
 * - SearchContextManager: Manages and caches DB, codemap, and provider
 * - CandidateRetriever: Handles vector search and candidate retrieval
 * - HybridFusion: Manages BM25 indexing and hybrid result fusion
 * - ResultMapper: Formats results and applies reranking
 */
export class SearchService {
  private contextManager: SearchContextManager | null = null;
  private retriever: CandidateRetriever;
  private fusion: HybridFusion;
  private mapper: ResultMapper;
  private lastWorkingPath: string | null = null;

  constructor() {
    this.retriever = new CandidateRetriever();
    this.fusion = new HybridFusion();
    this.mapper = new ResultMapper();
  }

  public async warmup(
    workingPath: string = '.',
    provider: string = 'auto'
  ): Promise<void> {
    const basePath = path.resolve(workingPath);

    if (!this.contextManager || this.lastWorkingPath !== basePath) {
      if (this.contextManager) {
        this.contextManager.cleanup();
      }
      this.contextManager = new SearchContextManager(basePath);
      this.lastWorkingPath = basePath;
    }

    await this.contextManager.warmup(provider);
  }

  public clearCaches(): void {
    logger.debug('Clearing search caches explicitly.');
    this.fusion.clearCaches();
    if (this.contextManager) {
      this.contextManager.cleanup();
      this.contextManager = null;
    }
  }

  public async search(
    query: string,
    limit: number = SEARCH_CONSTANTS.DEFAULT_SEARCH_LIMIT,
    provider: string = 'auto',
    workingPath: string = '.',
    scopeOptions: ScopeFilters = {}
  ): Promise<SearchCodeResult> {
    const basePath = path.resolve(workingPath);
    const normalizedQuery = this.normalizeQuery(query);

    if (!normalizedQuery) {
      return this.getOverview(limit, workingPath);
    }

    // Initialize context manager for this workspace if needed
    if (!this.contextManager || this.lastWorkingPath !== basePath) {
      if (this.contextManager) {
        this.contextManager.cleanup();
      }
      this.contextManager = new SearchContextManager(basePath);
      this.lastWorkingPath = basePath;
    }
    const contextManager = this.contextManager;
    if (!contextManager) {
      throw new Error('Search context manager failed to initialize');
    }

    // Reset stats for this search
    this.fusion.resetChunkLoadingStats();

    const normalizedScope = normalizeScopeFilters(scopeOptions);
    const effectiveProvider = normalizedScope.provider || provider;
    const hybridEnabled = normalizedScope.hybrid !== false;
    const bm25Enabled = normalizedScope.bm25 !== false;
    const symbolBoostEnabled = normalizedScope.symbol_boost !== false;

    try {
      // Get or initialize search context
      const context = await contextManager.warmup(effectiveProvider);

      // Fetch chunks from database
      const chunks = await contextManager.getChunks(context);

      if (chunks.length === 0) {
        return this.createErrorResult(
          'no_chunks_found',
          'No indexed chunks found',
          context.provider.getName(),
          normalizedScope,
          hybridEnabled,
          bm25Enabled,
          symbolBoostEnabled
        );
      }

      // Apply scope filtering
      const scopedChunks = applyScope(chunks, normalizedScope) as any[];
      const selectionBudget = Math.max(limit, RRF_K);
      const bm25CandidateLimit = Math.max(
        selectionBudget,
        SEARCH_CONSTANTS.BM25_PREFILTER_LIMIT
      );

      // Limit vector scoring to BM25-selected candidates when available
      let bm25PrefilterResults: Array<{ id: string; score: number }> | undefined;
      let vectorCandidates = scopedChunks;
      if (hybridEnabled && bm25Enabled) {
        const prefilter = await this.fusion.prefilterCandidates({
          hybridEnabled,
          bm25Enabled,
          query: normalizedQuery,
          providerName: context.provider.getName(),
          providerDimensions: context.provider.getDimensions(),
          chunkDir: context.chunkDir,
          basePath,
          scopedChunks,
          limit: bm25CandidateLimit
        });

        bm25PrefilterResults = prefilter.bm25Results;
        if (prefilter.candidateIds.size > 0) {
          const filtered = scopedChunks.filter(chunk =>
            prefilter.candidateIds.has(chunk.id)
          );
          if (filtered.length > 0) {
            vectorCandidates = filtered;
          }
        }
      }

      // Build vector pool
      const { chunkInfoById, vectorPool } = await this.retriever.buildVectorPool(
        vectorCandidates,
        context.provider,
        normalizedQuery
      );

      // Apply symbol boost
      if (symbolBoostEnabled) {
        try {
          applySymbolBoost(vectorPool, {
            query: normalizedQuery,
            codemap: context.codemap
          });
        } catch (error) {
          logger.warn('Symbol boost failed, continuing without boost', {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // Hybrid fusion
      const {
        fusedResults,
        bm25Fused,
        bm25CandidateCount: fusedBm25CandidateCount
      } = await this.fusion.fuseResults({
        hybridEnabled,
        bm25Enabled,
        selectionBudget,
        query: normalizedQuery,
        providerName: context.provider.getName(),
        providerDimensions: context.provider.getDimensions(),
        chunkDir: context.chunkDir,
        basePath,
        scopedChunks: vectorCandidates,
        chunkInfoById,
        vectorPool,
        bm25ResultsOverride: bm25PrefilterResults
      });
      const bm25CandidateCount =
        bm25PrefilterResults && bm25PrefilterResults.length > 0
          ? bm25PrefilterResults.length
          : fusedBm25CandidateCount;

      // Select and sort results
      let results =
        fusedResults.length > 0 ? fusedResults : vectorPool.slice(0, selectionBudget);
      results = this.fusion.sortWithSymbolBoost(results, symbolBoostEnabled);
      results = results.slice(0, limit);

      // Apply API reranking
      if (results.length > 1 && normalizedScope.reranker === 'api') {
        results = await this.mapper.applyReranker(
          normalizedQuery,
          results,
          context.chunkDir,
          basePath,
          context.providerContext
        );
      }

      // Enforce score bounds
      results = this.mapper.enforceScoreBounds(results);

      // Map to search results
      const mappedResults = this.mapper.mapResults(
        results,
        bm25Fused ? 'hybrid' : 'vector'
      );

      // Sort by score
      const sortedResults = this.mapper.sortByScore(mappedResults);

      if (sortedResults.length === 0) {
        return this.createErrorResult(
          'no_relevant_matches',
          `No relevant matches found for "${query}"`,
          context.provider.getName(),
          normalizedScope,
          hybridEnabled,
          bm25Enabled,
          symbolBoostEnabled
        );
      }

      // Record intention and query pattern
      if (
        symbolBoostEnabled &&
        sortedResults.length > 0 &&
        sortedResults[0].meta.score > 0.8
      ) {
        await context.db.recordIntention(
          normalizedQuery,
          query,
          sortedResults[0].sha,
          sortedResults[0].meta.score
        );
      }

      const pattern = normalizedQuery
        .replace(/\b[\w-]+Session\b/gi, '[SESSION]')
        .replace(/\bstripe\b/gi, '[PAYMENT_PROVIDER]')
        .replace(/\b\w+Service\b/gi, '[SERVICE]')
        .replace(/\b\w+Controller\b/gi, '[CONTROLLER]')
        .trim();

      await context.db.recordQueryPattern(pattern);

      return {
        success: true,
        query,
        searchType: bm25Fused ? 'hybrid' : 'vector',
        vectorResults: results.length,
        provider: context.provider.getName(),
        scope: normalizedScope,
        reranker: normalizedScope.reranker,
        hybrid: {
          enabled: hybridEnabled,
          bm25Enabled,
          fused: bm25Fused,
          bm25Candidates: bm25CandidateCount
        },
        symbolBoost: {
          enabled: symbolBoostEnabled,
          boosted:
            symbolBoostEnabled &&
            results.some(
              (result: any) =>
                typeof result.symbolBoost === 'number' && result.symbolBoost > 0
            )
        },
        chunkLoadingFailures: this.fusion.getChunkLoadingFailures(),
        warnings: this.fusion.buildWarnings(),
        results: sortedResults
      };
    } catch (error) {
      logger.error('Error in searchCode', error);
      return this.createErrorResult(
        'search_error',
        (error as Error).message,
        provider,
        normalizedScope,
        hybridEnabled,
        bm25Enabled,
        symbolBoostEnabled
      );
    }
  }

  public async getOverview(limit: number = 20, workingPath: string = '.'): Promise<SearchCodeResult> {
    const basePath = path.resolve(workingPath);
    const dbPath = path.join(basePath, '.codevault/codevault.db');

    try {
      if (!fs.existsSync(dbPath)) {
        return { success: false, error: 'database_not_found', message: 'Database not found', provider: 'overview', results: [] };
      }

      const db = new Database(dbPath);
      const chunks = await db.getOverviewChunks(limit);
      db.close();

      const results: SearchResult[] = chunks.map(chunk => ({
        type: 'code',
        lang: chunk.lang,
        path: chunk.file_path,
        sha: chunk.sha,
        data: null,
        meta: { id: chunk.id, symbol: chunk.symbol, score: 1.0 }
      }));

      return { success: true, provider: 'overview', results };
    } catch (error) {
      return { success: false, error: 'overview_error', message: (error as Error).message, provider: 'overview', results: [] };
    }
  }

  public async getChunk(sha: string, workingPath = '.'): Promise<GetChunkResult> {
    const basePath = path.resolve(workingPath);
    const chunkDir = path.join(basePath, '.codevault/chunks');

    try {
      const result = await readChunkFromDisk({ chunkDir, sha });
      if (!result) {
        return { success: false, error: 'Chunk not found' };
      }
      return { success: true, code: result.code };
    } catch (error: any) {
      if (error && error.code === 'ENCRYPTION_KEY_REQUIRED') {
        return { success: false, error: 'Chunk is encrypted. Configure CODEVAULT_ENCRYPTION_KEY.' };
      }
      return { success: false, error: error.message };
    }
  }

  // Helpers

  private createErrorResult(error: string, message: string, provider: string, scope: any, hybrid: boolean, bm25: boolean, symbolBoost: boolean): { success: false; error: string; message: string; provider: string; scope: any; hybrid: { enabled: boolean; bm25Enabled: boolean }; symbolBoost: { enabled: boolean; boosted: false }; reranker: any; results: [] } {
    return {
      success: false,
      error,
      message,
      provider,
      scope,
      hybrid: { enabled: hybrid, bm25Enabled: bm25 },
      symbolBoost: { enabled: symbolBoost, boosted: false },
      reranker: scope.reranker,
      results: []
    };
  }

  // Private helpers

  private normalizeQuery(query: string): string {
    return query.toLowerCase().trim().replace(/[¿?]/g, '').replace(/\s+/g, ' ');
  }
}
