import fs from 'fs';
import path from 'path';
import { createEmbeddingProvider } from '../providers/index.js';
import { Database } from '../database/db.js';
import { readCodemap } from '../codemap/io.js';
import { normalizeScopeFilters, applyScope } from '../search/scope.js';
import { BM25Index } from '../search/bm25.js';
import { reciprocalRankFusion } from '../search/hybrid.js';
import { rerankWithAPI } from '../ranking/api-reranker.js';
import { applySymbolBoost } from '../ranking/symbol-boost.js';
import { log } from '../utils/logger.js';
import { hasScopeFilters } from '../types/search.js';
import { readChunkFromDisk } from '../storage/encrypted-chunks.js';
import { RRF_K, DOC_BOOST } from '../config/constants.js';
import type { ScopeFilters } from '../types/search.js';
import type { SearchCodeResult, SearchResult, GetChunkResult } from './types.js';
import type { DatabaseChunk } from '../database/db.js';

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
  [key: string]: any; // Allow additional properties from reranker/symbol boost
}

// FIX: Add cache size limits to prevent memory leaks in long-running processes
const MAX_BM25_CACHE_SIZE = Number.parseInt(process.env.CODEVAULT_MAX_BM25_CACHE || '10', 10);
const MAX_CHUNK_TEXT_CACHE_SIZE = Number.parseInt(process.env.CODEVAULT_MAX_CHUNK_CACHE || '1000', 10);

const bm25IndexCache = new Map<string, { index: BM25Index; added: Set<string>; lastAccess: number }>();
const chunkTextCache = new Map<string, { text: string | null; lastAccess: number }>();
const RERANKER_MAX_CANDIDATES = Number.parseInt(process.env.CODEVAULT_RERANKER_MAX || '50', 10);

// Cache eviction helper for BM25 index cache (LRU)
function evictOldestBm25Index(): void {
  if (bm25IndexCache.size >= MAX_BM25_CACHE_SIZE) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    for (const [key, value] of bm25IndexCache.entries()) {
      if (value.lastAccess < oldestTime) {
        oldestTime = value.lastAccess;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      bm25IndexCache.delete(oldestKey);
    }
  }
}

// Cache eviction helper for chunk text cache (LRU)
function evictOldestChunkText(): void {
  if (chunkTextCache.size >= MAX_CHUNK_TEXT_CACHE_SIZE) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    for (const [key, value] of chunkTextCache.entries()) {
      if (value.lastAccess < oldestTime) {
        oldestTime = value.lastAccess;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      chunkTextCache.delete(oldestKey);
    }
  }
}

// Public function to clear caches (useful for long-running processes)
export function clearSearchCaches(): void {
  log.debug('Clearing search caches explicitly.');
  bm25IndexCache.clear();
  chunkTextCache.clear();
}

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/[¿?]/g, '')
    .replace(/\s+/g, ' ');
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function getBm25CacheKey(basePath: string, providerName: string, dimensions: number): string {
  return `${basePath}::${providerName}::${dimensions}`;
}

function getChunkCacheKey(basePath: string, sha: string): string {
  return `${basePath}::${sha}`;
}

function readChunkTextCached(sha: string, chunkDir: string, basePath: string): string | null {
  if (!sha) {
    return null;
  }

  const cacheKey = getChunkCacheKey(basePath, sha);
  const cached = chunkTextCache.get(cacheKey);
  if (cached) {
    // Update access time for LRU
    cached.lastAccess = Date.now();
    return cached.text;
  }

  try {
    const result = readChunkFromDisk({ chunkDir, sha });
    const code = result ? result.code : null;
    evictOldestChunkText();
    chunkTextCache.set(cacheKey, { text: code, lastAccess: Date.now() });
    return code;
  } catch (error) {
    evictOldestChunkText();
    chunkTextCache.set(cacheKey, { text: null, lastAccess: Date.now() });
    return null;
  }
}

function buildBm25Document(chunk: any, codeText: string | null): string {
  if (!chunk) {
    return '';
  }

  const parts = [
    chunk.symbol,
    chunk.file_path,
    chunk.codevault_description,
    chunk.codevault_intent,
    codeText
  ].filter(value => typeof value === 'string' && value.trim().length > 0);

  return parts.join('\n');
}

function ensureBm25IndexForChunks(
  basePath: string,
  chunkDir: string,
  providerName: string,
  dimensions: number,
  chunks: DatabaseChunk[]
): BM25Index | null {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return null;
  }

  const key = getBm25CacheKey(basePath, providerName, dimensions);
  let entry = bm25IndexCache.get(key);
  
  if (!entry) {
    evictOldestBm25Index();
    entry = { index: new BM25Index(), added: new Set(), lastAccess: Date.now() };
    bm25IndexCache.set(key, entry);
  } else {
    // Update access time for LRU
    entry.lastAccess = Date.now();
  }

  const toAdd: Array<{ id: string; text: string }> = [];

  for (const chunk of chunks) {
    if (!chunk || !chunk.id || entry.added.has(chunk.id)) {
      continue;
    }

    const codeText = readChunkTextCached(chunk.sha, chunkDir, basePath);
    const docText = buildBm25Document(chunk, codeText);

    if (docText && docText.trim().length > 0) {
      toAdd.push({ id: chunk.id, text: docText });
    }

    entry.added.add(chunk.id);
  }

  if (toAdd.length > 0) {
    entry.index.addDocuments(toAdd);
  }

  entry.index.consolidate();
  return entry.index;
}

export async function searchCode(
  query: string,
  limit = 10,
  provider = 'auto',
  workingPath = '.',
  scopeOptions: ScopeFilters = {}
): Promise<SearchCodeResult> {
  const basePath = path.resolve(workingPath);
  const dbPath = path.join(basePath, '.codevault/codevault.db');
  const chunkDir = path.join(basePath, '.codevault/chunks');
  const codemapPath = path.join(basePath, 'codevault.codemap.json');

  if (!query || !query.trim()) {
    return getOverview(limit, workingPath);
  }

  const normalizedScope = normalizeScopeFilters(scopeOptions);
  const effectiveProvider = normalizedScope.provider || provider;
  const hybridEnabled = normalizedScope.hybrid !== false;
  const bm25Enabled = normalizedScope.bm25 !== false;
  const symbolBoostEnabled = normalizedScope.symbol_boost !== false;

  const embeddingProvider = createEmbeddingProvider(effectiveProvider);

  // FIX: Ensure database is always closed, even on error paths
  let db: Database | null = null;
  
  try {
    if (!fs.existsSync(dbPath)) {
      return {
        success: false,
        error: 'database_not_found',
        message: `Database not found at ${dbPath}. Project needs to be indexed first.`,
        suggestion: `Run index_project on directory: ${workingPath}`,
        provider: embeddingProvider.getName(),
        scope: normalizedScope,
        hybrid: { enabled: hybridEnabled, bm25Enabled },
        symbolBoost: { enabled: symbolBoostEnabled, boosted: false },
        reranker: normalizedScope.reranker,
        results: []
      };
    }

    db = new Database(dbPath);
    const chunks = await db.getChunks(embeddingProvider.getName(), embeddingProvider.getDimensions());
    const codemapData = readCodemap(codemapPath);

    if (chunks.length === 0) {
      return {
        success: false,
        error: 'no_chunks_found',
        message: `No indexed chunks found with ${embeddingProvider.getName()} in ${basePath}`,
        suggestion: `Run: codevault index --provider ${effectiveProvider} from ${basePath}`,
        provider: embeddingProvider.getName(),
        scope: normalizedScope,
        hybrid: { enabled: hybridEnabled, bm25Enabled },
        reranker: normalizedScope.reranker,
        results: []
      };
    }

    const scopedChunks = applyScope(chunks, normalizedScope) as DatabaseChunk[];
    const chunkInfoById = new Map<string, SearchCandidate>();
    const results: SearchCandidate[] = [];

    let queryEmbedding: number[] | null = null;
    if (scopedChunks.length > 0) {
      if (embeddingProvider.init) {
        await embeddingProvider.init();
      }
      queryEmbedding = await embeddingProvider.generateEmbedding(query);
    }

    for (const chunk of scopedChunks) {
      const embedding = JSON.parse(chunk.embedding.toString());
      const vectorSimilarity = queryEmbedding ? cosineSimilarity(queryEmbedding, embedding) : 0;

      let boostScore = 0;

      if (chunk.codevault_intent && query.toLowerCase().includes(chunk.codevault_intent.toLowerCase())) {
        boostScore += 0.2;
      }

      if (chunk.codevault_tags) {
        try {
          const tags = JSON.parse(chunk.codevault_tags || '[]');
          const queryLower = query.toLowerCase();
          tags.forEach((tag: string) => {
            if (typeof tag === 'string' && queryLower.includes(tag.toLowerCase())) {
              boostScore += 0.1;
            }
          });
        } catch (error) {
          log.warn('Failed to parse codevault_tags for chunk', { chunkId: chunk.id, error });
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
      
      const finalScore = Math.min(vectorSimilarity + boostScore + docBoost, 1.0);

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

    if (symbolBoostEnabled) {
      try {
        applySymbolBoost(results, { query, codemap: codemapData });
      } catch (error) {
        // Symbol boost fails silently
      }
    }

    const sortedResults = results.sort((a, b) => b.score - a.score);
    const remainingSlots = limit;
    let vectorResults: SearchCandidate[] = [];
    let bm25Fused = false;
    let bm25CandidateCount = 0;

    if (remainingSlots > 0) {
      const selectionBudget = Math.max(remainingSlots, RRF_K);
      const vectorPool = sortedResults.slice(0, selectionBudget);

      if (hybridEnabled && bm25Enabled) {
        const bm25Index = ensureBm25IndexForChunks(
          basePath,
          chunkDir,
          embeddingProvider.getName(),
          embeddingProvider.getDimensions(),
          scopedChunks
        );

        if (bm25Index) {
          const allowedIds = new Set(scopedChunks.map((chunk) => chunk.id));
          const bm25RawResults = bm25Index.search(query, selectionBudget);
          const bm25Results = bm25RawResults.filter(result => allowedIds.has(result.id));
          bm25CandidateCount = bm25Results.length;

          if (bm25Results.length > 0) {
            const fused = reciprocalRankFusion({
              vectorResults: vectorPool.map((item) => ({ id: item.id, score: item.score })),
              bm25Results: bm25Results.map(item => ({ id: item.id, score: item.score })),
              limit: selectionBudget,
              k: RRF_K
            });

            if (fused.length > 0) {
              bm25Fused = true;
              vectorResults = fused
                .map(entry => {
                  const info = chunkInfoById.get(entry.id);
                  if (!info) {
                    return null;
                  }

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

      if (vectorResults.length === 0) {
        vectorResults = vectorPool;
      }

      const hasSymbolBoost = symbolBoostEnabled && vectorResults.some(
        (candidate) => typeof candidate.symbolBoost === 'number' && candidate.symbolBoost > 0
      );

      if (hasSymbolBoost && vectorResults.length > 1) {
        vectorResults.sort((a, b) => {
          const scoreA = typeof a.score === 'number' ? a.score : 0;
          const scoreB = typeof b.score === 'number' ? b.score : 0;
          if (scoreB !== scoreA) {
            return scoreB - scoreA;
          }

          const boostA = typeof a.symbolBoost === 'number' ? a.symbolBoost : 0;
          const boostB = typeof b.symbolBoost === 'number' ? b.symbolBoost : 0;
          if (boostB !== boostA) {
            return boostB - boostA;
          }

          const hybridA = typeof a.hybridScore === 'number' ? a.hybridScore : Number.NEGATIVE_INFINITY;
          const hybridB = typeof b.hybridScore === 'number' ? b.hybridScore : Number.NEGATIVE_INFINITY;
          return hybridB - hybridA;
        });
      }

      vectorResults = vectorResults.slice(0, remainingSlots);

      if (vectorResults.length > 1 && normalizedScope.reranker === 'api') {
        try {
          const reranked = await rerankWithAPI(query, vectorResults, {
            max: Math.min(RERANKER_MAX_CANDIDATES, vectorResults.length),
            getText: (candidate) => {
              const codeText = readChunkTextCached(candidate.sha, chunkDir, basePath) || '';
              return buildBm25Document(candidate, codeText);
            }
          });

          if (Array.isArray(reranked) && reranked.length === vectorResults.length) {
            // Reranker preserves input objects and adds rerankerScore/rerankerRank
            vectorResults = reranked as SearchCandidate[];
          }
        } catch (error) {
          // Silent fallback when reranker is unavailable
        }
      }
    }

    const vectorSearchType = bm25Fused ? 'hybrid' : 'vector';
    const combinedResults: SearchResult[] = vectorResults.map((result) => {
      const rawScore = typeof result.score === 'number' ? result.score : 0;
      const meta: any = {
        id: result.id,
        symbol: result.symbol,
        score: Math.min(1, rawScore),
        intent: result.codevault_intent,
        description: result.codevault_description,
        searchType: vectorSearchType,
        vectorScore: result.vectorScore
      };

      if (typeof result.hybridScore === 'number') {
        meta.hybridScore = result.hybridScore;
      }

      if (typeof result.bm25Score === 'number') {
        meta.bm25Score = result.bm25Score;
      }

      if (typeof result.bm25Rank === 'number') {
        meta.bm25Rank = result.bm25Rank;
      }

      if (typeof result.vectorRank === 'number') {
        meta.vectorRank = result.vectorRank;
      }

      if (typeof result.rerankerScore === 'number') {
        meta.rerankerScore = result.rerankerScore;
      }

      if (typeof result.rerankerRank === 'number') {
        meta.rerankerRank = result.rerankerRank;
      }

      if (typeof result.symbolBoost === 'number' && result.symbolBoost > 0) {
        meta.symbolBoost = result.symbolBoost;
        if (Array.isArray(result.symbolBoostSources) && result.symbolBoostSources.length > 0) {
          meta.symbolBoostSources = result.symbolBoostSources;
        }
      }

      if (typeof rawScore === 'number' && rawScore > 1) {
        meta.scoreRaw = rawScore;
      }

      return {
        type: 'code',
        lang: result.lang,
        path: result.file_path,
        sha: result.sha,
        data: null,
        meta
      };
    });

    combinedResults.sort((a, b) => {
      const hasRerankerA = typeof a.meta?.rerankerScore === 'number';
      const hasRerankerB = typeof b.meta?.rerankerScore === 'number';
      
      if (hasRerankerA && hasRerankerB) {
        return b.meta.rerankerScore! - a.meta.rerankerScore!;
      }
      
      const scoreA = a.meta?.score ?? 0;
      const scoreB = b.meta?.score ?? 0;
      return scoreB - scoreA;
    });

    if (combinedResults.length === 0) {
      return {
        success: false,
        error: 'no_relevant_matches',
        message: `No relevant matches found for "${query}"`,
        suggestion: 'Try broader search terms or check if the project is properly indexed',
        provider: embeddingProvider.getName(),
        scope: normalizedScope,
        hybrid: { enabled: hybridEnabled, bm25Enabled },
        symbolBoost: { enabled: symbolBoostEnabled, boosted: false },
        reranker: normalizedScope.reranker,
        results: []
      };
    }

    if (symbolBoostEnabled && combinedResults.length > 0 && combinedResults[0].meta.score > 0.8) {
      await db.recordIntention(normalizeQuery(query), query, combinedResults[0].sha, combinedResults[0].meta.score);
    }

    const pattern = query
      .toLowerCase()
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
      results: combinedResults
    };

  } catch (error) {
    console.error('Error in searchCode:', error);
    return {
      success: false,
      error: 'search_error',
      message: (error as Error).message,
      provider: embeddingProvider.getName(),
      scope: normalizedScope,
      hybrid: { enabled: hybridEnabled, bm25Enabled },
      symbolBoost: { enabled: symbolBoostEnabled, boosted: false },
      reranker: normalizedScope.reranker,
      results: []
    };
  } finally {
    // FIX: Always close database connection in finally block
    if (db) {
      try {
        db.close();
      } catch (closeError) {
        // Ignore close errors during cleanup
      }
    }
  }
}

export async function getOverview(limit = 20, workingPath = '.'): Promise<SearchCodeResult> {
  const basePath = path.resolve(workingPath);
  const dbPath = path.join(basePath, '.codevault/codevault.db');

  try {
    if (!fs.existsSync(dbPath)) {
      return {
        success: false,
        error: 'database_not_found',
        message: `Database not found at ${dbPath}. Project needs to be indexed first.`,
        suggestion: `Run index_project on directory: ${workingPath}`,
        provider: 'unknown',
        results: []
      };
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
      meta: {
        id: chunk.id,
        symbol: chunk.symbol,
        score: 1.0
      }
    }));

    return {
      success: true,
      provider: 'overview',
      results
    };
  } catch (error) {
    return {
      success: false,
      error: 'overview_error',
      message: (error as Error).message,
      provider: 'overview',
      results: []
    };
  }
}

export async function getChunk(sha: string, workingPath = '.'): Promise<GetChunkResult> {
  const basePath = path.resolve(workingPath);
  const chunkDir = path.join(basePath, '.codevault/chunks');

  try {
    const result = readChunkFromDisk({ chunkDir, sha });
    if (!result) {
      const plainPath = path.join(chunkDir, `${sha}.gz`);
      const encryptedPath = path.join(chunkDir, `${sha}.gz.enc`);
      throw new Error(`Chunk ${sha} not found at ${plainPath} or ${encryptedPath}`);
    }
    return { success: true, code: result.code };
  } catch (error: any) {
    if (error && error.code === 'ENCRYPTION_KEY_REQUIRED') {
      return {
        success: false,
        error: `Chunk ${sha} is encrypted. Configure CODEVAULT_ENCRYPTION_KEY to decrypt.`
      };
    }
    return { success: false, error: error.message };
  }
}