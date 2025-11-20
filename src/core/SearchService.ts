import fs from 'fs';
import path from 'path';
import { createEmbeddingProvider } from '../providers/index.js';
import { Database, type DatabaseChunk } from '../database/db.js';
import { readCodemap, readCodemapAsync } from '../codemap/io.js';
import { normalizeScopeFilters, applyScope } from '../search/scope.js';
import { BM25Index } from '../search/bm25.js';
import { reciprocalRankFusion } from '../search/hybrid.js';
import { rerankWithAPI } from '../ranking/api-reranker.js';
import { applySymbolBoost } from '../ranking/symbol-boost.js';
import { logger } from '../utils/logger.js';
import { SimpleLRU } from '../utils/simple-lru.js';
import { readChunkFromDisk } from '../storage/encrypted-chunks.js';
import { 
    RRF_K, 
    DOC_BOOST, 
    CACHE_CONSTANTS, 
    DOC_BOOST_CONSTANTS, 
    SEARCH_CONSTANTS 
} from '../config/constants.js';
import { resolveProviderContext } from '../config/resolver.js';
import type { ScopeFilters } from '../types/search.js';
import type { SearchCodeResult, SearchResult, GetChunkResult } from './types.js';

// Internal types for search processing
interface SearchCandidate {
  id: string;
  sha: string;
  file_path: string;
  symbol: string;
  lang: string;
  chunk_type: string;
  codevault_intent?: string;
  codevault_description?: string;
  score: number;
  vectorScore: number;
  boostScore: number;
  hybridScore?: number | null;
  bm25Score?: number | null;
  bm25Rank?: number | null;
  vectorRank?: number | null;
  symbolBoost?: number;
  symbolBoostSources?: string[];
  rerankerScore?: number;
  rerankerRank?: number;
  [key: string]: any;
}

interface ChunkLoadingStats {
  totalAttempted: number;
  failed: number;
  reasons: Map<string, number>;
}

export class SearchService {
  private bm25Cache: SimpleLRU<string, { index: BM25Index; added: Set<string> }>;
  private chunkCache: SimpleLRU<string, string | null>;
  private chunkLoadingStats: ChunkLoadingStats;

  constructor() {
    this.bm25Cache = new SimpleLRU(CACHE_CONSTANTS.MAX_BM25_CACHE_SIZE);
    this.chunkCache = new SimpleLRU(CACHE_CONSTANTS.MAX_CHUNK_TEXT_CACHE_SIZE);
    this.chunkLoadingStats = { totalAttempted: 0, failed: 0, reasons: new Map() };
  }

  public clearCaches(): void {
    logger.debug('Clearing search caches explicitly.');
    this.bm25Cache.clear();
    this.chunkCache.clear();
  }

  private resetChunkLoadingStats(): void {
    this.chunkLoadingStats = { totalAttempted: 0, failed: 0, reasons: new Map() };
  }

  private getChunkLoadingFailures() {
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

  private buildWarnings(): string[] | undefined {
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

    const otherFailures = stats.failed -
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

  public async search(
    query: string,
    limit: number = SEARCH_CONSTANTS.DEFAULT_SEARCH_LIMIT,
    provider: string = 'auto',
    workingPath: string = '.',
    scopeOptions: ScopeFilters = {}
  ): Promise<SearchCodeResult> {
    // Reset chunk loading stats at the start of each search
    this.resetChunkLoadingStats();

    const basePath = path.resolve(workingPath);
    const dbPath = path.join(basePath, '.codevault/codevault.db');
    const chunkDir = path.join(basePath, '.codevault/chunks');
    const codemapPath = path.join(basePath, 'codevault.codemap.json');
    const normalizedQuery = this.normalizeQuery(query);
    const providerContext = resolveProviderContext(basePath);

    if (!normalizedQuery) {
      return this.getOverview(limit, workingPath);
    }

    const normalizedScope = normalizeScopeFilters(scopeOptions);
    const effectiveProvider = normalizedScope.provider || provider;
    const hybridEnabled = normalizedScope.hybrid !== false;
    const bm25Enabled = normalizedScope.bm25 !== false;
    const symbolBoostEnabled = normalizedScope.symbol_boost !== false;

    const embeddingProvider = createEmbeddingProvider(effectiveProvider, providerContext.embedding);
    let db: Database | null = null;

    try {
      if (!fs.existsSync(dbPath)) {
        return this.createErrorResult('database_not_found', `Database not found at ${dbPath}`, embeddingProvider.getName(), normalizedScope, hybridEnabled, bm25Enabled, symbolBoostEnabled);
      }

      db = new Database(dbPath);
      const chunks = await db.getChunks(embeddingProvider.getName(), embeddingProvider.getDimensions());
      
      if (chunks.length === 0) {
        return this.createErrorResult('no_chunks_found', `No indexed chunks found`, embeddingProvider.getName(), normalizedScope, hybridEnabled, bm25Enabled, symbolBoostEnabled);
      }

      const codemapData = await readCodemapAsync(codemapPath);
      const scopedChunks = applyScope(chunks, normalizedScope) as DatabaseChunk[];
      const { chunkInfoById, vectorPool } = await this.buildVectorPool(
        scopedChunks,
        embeddingProvider,
        normalizedQuery
      );

      if (symbolBoostEnabled) {
        try {
          applySymbolBoost(vectorPool, { query: normalizedQuery, codemap: codemapData });
        } catch (error) {
          // Log symbol boost failure but continue without it (degraded functionality is acceptable)
          logger.warn('Symbol boost failed, continuing without boost', { error: error instanceof Error ? error.message : String(error) });
        }
      }

      const selectionBudget = Math.max(limit, RRF_K);
      const { fusedResults, bm25Fused, bm25CandidateCount } = this.tryHybridFusion({
        hybridEnabled,
        bm25Enabled,
        selectionBudget,
        normalizedQuery,
        embeddingProvider,
        chunkDir,
        basePath,
        scopedChunks,
        chunkInfoById,
        vectorPool
      });

      let vectorResults = fusedResults.length > 0 ? fusedResults : vectorPool.slice(0, selectionBudget);
      vectorResults = this.sortWithSymbolBoost(vectorResults, symbolBoostEnabled);
      vectorResults = vectorResults.slice(0, limit);

      if (vectorResults.length > 1 && normalizedScope.reranker === 'api') {
        vectorResults = await this.applyReranker(
          normalizedQuery,
          vectorResults,
          chunkDir,
          basePath,
          providerContext
        );
      }

      // Enforce score bounds after boosts/reranking
      vectorResults = vectorResults.map(candidate => ({
        ...candidate,
        score: Math.min(1, Math.max(candidate.score ?? 0, 0))
      }));

      const combinedResults = this.mapResults(vectorResults, bm25Fused ? 'hybrid' : 'vector');

      combinedResults.sort((a, b) => {
          if (typeof a.meta?.rerankerScore === 'number' && typeof b.meta?.rerankerScore === 'number') {
              return b.meta.rerankerScore! - a.meta.rerankerScore!;
          }
          return (b.meta?.score ?? 0) - (a.meta?.score ?? 0);
      });

      if (combinedResults.length === 0) {
          return this.createErrorResult('no_relevant_matches', `No relevant matches found for "${query}"`, embeddingProvider.getName(), normalizedScope, hybridEnabled, bm25Enabled, symbolBoostEnabled);
      }

      if (symbolBoostEnabled && combinedResults.length > 0 && combinedResults[0].meta.score > 0.8) {
          await db.recordIntention(normalizedQuery, query, combinedResults[0].sha, combinedResults[0].meta.score);
      }

      const pattern = normalizedQuery
        .replace(/\b[\w-]+Session\b/gi, '[SESSION]')
        .replace(/\bstripe\b/gi, '[PAYMENT_PROVIDER]')
        .replace(/\b\w+Service\b/gi, '[SERVICE]')
        .replace(/\b\w+Controller\b/gi, '[CONTROLLER]')
        .trim();

      await db.recordQueryPattern(pattern);

      return {
        success: true,
        query,
        searchType: bm25Fused ? 'hybrid' : 'vector',
        vectorResults: vectorResults.length,
        provider: embeddingProvider.getName(),
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
            boosted: symbolBoostEnabled && vectorResults.some((result: any) => typeof result.symbolBoost === 'number' && result.symbolBoost > 0)
        },
        chunkLoadingFailures: this.getChunkLoadingFailures(),
        warnings: this.buildWarnings(),
        results: combinedResults
      };

    } catch (error) {
        logger.error('Error in searchCode', error);
        return this.createErrorResult('search_error', (error as Error).message, embeddingProvider.getName(), normalizedScope, hybridEnabled, bm25Enabled, symbolBoostEnabled);
    } finally {
        if (db) {
            try { db.close(); } catch {}
        }
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
      const result = readChunkFromDisk({ chunkDir, sha });
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

  private createErrorResult(error: string, message: string, provider: string, scope: any, hybrid: boolean, bm25: boolean, symbolBoost: boolean) {
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

  private normalizeQuery(query: string): string {
    return query.toLowerCase().trim().replace(/[¿?]/g, '').replace(/\s+/g, ' ');
  }

  private async buildVectorPool(
    scopedChunks: DatabaseChunk[],
    embeddingProvider: any,
    normalizedQuery: string
  ): Promise<{ chunkInfoById: Map<string, SearchCandidate>; vectorPool: SearchCandidate[] }> {
    const chunkInfoById = new Map<string, SearchCandidate>();
    const results: SearchCandidate[] = [];

    let queryEmbedding: number[] | null = null;
    if (scopedChunks.length > 0) {
      if (embeddingProvider.init) {
        await embeddingProvider.init();
      }
      queryEmbedding = await embeddingProvider.generateEmbedding(normalizedQuery);
    }

    for (const chunk of scopedChunks) {
      const embedding = JSON.parse(chunk.embedding.toString());
      const vectorSimilarity = queryEmbedding ? this.cosineSimilarity(queryEmbedding, embedding) : 0;

      let boostScore = 0;

      if (chunk.codevault_intent && normalizedQuery.includes(chunk.codevault_intent.toLowerCase())) {
        boostScore += DOC_BOOST_CONSTANTS.INTENT_MATCH_BOOST;
      }

      if (chunk.codevault_tags) {
        try {
          const tags = JSON.parse(chunk.codevault_tags || '[]');
          tags.forEach((tag: string) => {
            if (typeof tag === 'string' && normalizedQuery.includes(tag.toLowerCase())) {
              boostScore += DOC_BOOST_CONSTANTS.TAG_MATCH_BOOST;
            }
          });
        } catch (error) {
          logger.warn('Failed to parse codevault_tags for chunk', { chunkId: chunk.id, error });
        }
      }

      let docBoost = 0;
      const filePath = chunk.file_path.toLowerCase();
      if (filePath.includes('readme') ||
          filePath.includes('/docs/') ||
          filePath.startsWith('docs/') ||
          filePath.includes('changelog') ||
          filePath.includes('contributing') ||
          filePath.endsWith('.md')) {
        docBoost = DOC_BOOST;
      }
      
      const finalScore = Math.min(1, Math.max(0, vectorSimilarity + boostScore + docBoost));

      const info = {
        id: chunk.id,
        file_path: chunk.file_path,
        symbol: chunk.symbol,
        sha: chunk.sha,
        lang: chunk.lang,
        chunk_type: chunk.chunk_type,
        codevault_intent: chunk.codevault_intent,
        codevault_description: chunk.codevault_description,
        score: finalScore,
        vectorScore: vectorSimilarity,
        boostScore: boostScore
      };

      chunkInfoById.set(chunk.id, info);
      results.push(info);
    }

    // Highest vector scores first
    results.sort((a, b) => b.score - a.score);

    return { chunkInfoById, vectorPool: results };
  }

  private tryHybridFusion(params: {
    hybridEnabled: boolean;
    bm25Enabled: boolean;
    selectionBudget: number;
    normalizedQuery: string;
    embeddingProvider: any;
    chunkDir: string;
    basePath: string;
    scopedChunks: DatabaseChunk[];
    chunkInfoById: Map<string, SearchCandidate>;
    vectorPool: SearchCandidate[];
  }): { fusedResults: SearchCandidate[]; bm25Fused: boolean; bm25CandidateCount: number } {
    const {
      hybridEnabled,
      bm25Enabled,
      selectionBudget,
      normalizedQuery,
      embeddingProvider,
      chunkDir,
      basePath,
      scopedChunks,
      chunkInfoById,
      vectorPool
    } = params;

    let vectorResults: SearchCandidate[] = [];
    let bm25Fused = false;
    let bm25CandidateCount = 0;

    if (hybridEnabled && bm25Enabled) {
      const bm25Index = this.ensureBm25IndexForChunks(
        basePath,
        chunkDir,
        embeddingProvider.getName(),
        embeddingProvider.getDimensions(),
        scopedChunks
      );

      if (bm25Index) {
        const allowedIds = new Set(scopedChunks.map((chunk) => chunk.id));
        const bm25RawResults = bm25Index.search(normalizedQuery, selectionBudget);
        const bm25Results = bm25RawResults.filter(result => allowedIds.has(result.id));
        bm25CandidateCount = bm25Results.length;

        if (bm25Results.length > 0) {
          const fused = reciprocalRankFusion({
            vectorResults: vectorPool.slice(0, selectionBudget).map((item) => ({ id: item.id, score: item.score })),
            bm25Results: bm25Results.map(item => ({ id: item.id, score: item.score })),
            limit: selectionBudget,
            k: RRF_K
          });

          if (fused.length > 0) {
            bm25Fused = true;
            vectorResults = fused
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

    return { fusedResults: vectorResults, bm25Fused, bm25CandidateCount };
  }

  private sortWithSymbolBoost(results: SearchCandidate[], symbolBoostEnabled: boolean): SearchCandidate[] {
    const hasSymbolBoost = symbolBoostEnabled && results.some(
      (candidate) => typeof candidate.symbolBoost === 'number' && candidate.symbolBoost > 0
    );

    if (hasSymbolBoost && results.length > 1) {
      return [...results].sort((a, b) => {
        const scoreA = typeof a.score === 'number' ? a.score : 0;
        const scoreB = typeof b.score === 'number' ? b.score : 0;
        if (scoreB !== scoreA) return scoreB - scoreA;

        const boostA = typeof a.symbolBoost === 'number' ? a.symbolBoost : 0;
        const boostB = typeof b.symbolBoost === 'number' ? b.symbolBoost : 0;
        if (boostB !== boostA) return boostB - boostA;

        const hybridA = typeof a.hybridScore === 'number' ? a.hybridScore : Number.NEGATIVE_INFINITY;
        const hybridB = typeof b.hybridScore === 'number' ? b.hybridScore : Number.NEGATIVE_INFINITY;
        return hybridB - hybridA;
      });
    }

    return results;
  }

  private async applyReranker(
    normalizedQuery: string,
    vectorResults: SearchCandidate[],
    chunkDir: string,
    basePath: string,
    providerContext: ReturnType<typeof resolveProviderContext>
  ): Promise<SearchCandidate[]> {
    try {
      const reranked = await rerankWithAPI(normalizedQuery, vectorResults, {
        max: Math.min(SEARCH_CONSTANTS.RERANKER_MAX_CANDIDATES, vectorResults.length),
        getText: (candidate) => {
          const codeText = this.readChunkTextCached(candidate.sha, chunkDir, basePath) || '';
          return this.buildBm25Document(candidate, codeText);
        },
        apiUrl: providerContext.reranker.apiUrl,
        apiKey: providerContext.reranker.apiKey,
        model: providerContext.reranker.model,
        maxTokens: providerContext.reranker.maxTokens
      });

      if (Array.isArray(reranked) && reranked.length === vectorResults.length) {
        return reranked as SearchCandidate[];
      }
    } catch (error) {
      // Log reranking failure but fallback to original results gracefully
      logger.warn('API reranking failed, falling back to original ranking', { error: error instanceof Error ? error.message : String(error) });
    }
    return vectorResults;
  }

  private mapResults(vectorResults: SearchCandidate[], searchType: string): SearchResult[] {
    return vectorResults.map((result) => {
        const meta: any = {
          id: result.id,
          symbol: result.symbol,
          score: Math.min(1, Math.max(result.score || 0, 0)),
          intent: result.codevault_intent,
          description: result.codevault_description,
          searchType: searchType,
          vectorScore: result.vectorScore
        };
        
        if (typeof result.hybridScore === 'number') meta.hybridScore = result.hybridScore;
        if (typeof result.bm25Score === 'number') meta.bm25Score = result.bm25Score;
        if (typeof result.bm25Rank === 'number') meta.bm25Rank = result.bm25Rank;
        if (typeof result.vectorRank === 'number') meta.vectorRank = result.vectorRank;
        if (typeof result.rerankerScore === 'number') meta.rerankerScore = result.rerankerScore;
        if (typeof result.rerankerRank === 'number') meta.rerankerRank = result.rerankerRank;
        if (typeof result.symbolBoost === 'number' && result.symbolBoost > 0) {
          meta.symbolBoost = result.symbolBoost;
          if (Array.isArray(result.symbolBoostSources)) meta.symbolBoostSources = result.symbolBoostSources;
        }
        if (typeof result.score === 'number' && result.score > 1) meta.scoreRaw = result.score;

        return {
          type: 'code',
          lang: result.lang,
          path: result.file_path,
          sha: result.sha,
          data: null,
          meta
        };
    });
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private getBm25CacheKey(basePath: string, providerName: string, dimensions: number): string {
    return `${basePath}::${providerName}::${dimensions}`;
  }

  private getChunkCacheKey(basePath: string, sha: string): string {
    return `${basePath}::${sha}`;
  }

  private readChunkTextCached(sha: string, chunkDir: string, basePath: string): string | null {
    if (!sha) return null;
    const cacheKey = this.getChunkCacheKey(basePath, sha);
    const cached = this.chunkCache.get(cacheKey);
    if (cached !== undefined) return cached;

    this.chunkLoadingStats.totalAttempted++;

    try {
      const result = readChunkFromDisk({ chunkDir, sha });
      const code = result ? result.code : null;
      this.chunkCache.set(cacheKey, code);
      if (!result) {
        // File not found
        this.chunkLoadingStats.failed++;
        const reason = 'file_not_found';
        this.chunkLoadingStats.reasons.set(reason, (this.chunkLoadingStats.reasons.get(reason) || 0) + 1);
      }
      return code;
    } catch (error: any) {
      // Track the specific failure reason from error code
      this.chunkLoadingStats.failed++;
      const reason = error.code ? String(error.code).toLowerCase() : 'unknown_error';
      this.chunkLoadingStats.reasons.set(reason, (this.chunkLoadingStats.reasons.get(reason) || 0) + 1);

      // Log the error for debugging
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

  private ensureBm25IndexForChunks(
    basePath: string,
    chunkDir: string,
    providerName: string,
    dimensions: number,
    chunks: DatabaseChunk[]
  ): BM25Index | null {
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
      const codeText = this.readChunkTextCached(chunk.sha, chunkDir, basePath);
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
}
