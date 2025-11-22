import type { SearchCandidate } from './CandidateRetriever.js';
import type { SearchResult } from '../types.js';
import { rerankWithAPI } from '../../ranking/api-reranker.js';
import { readChunkFromDisk } from '../../storage/encrypted-chunks.js';
import { SEARCH_CONSTANTS } from '../../config/constants.js';
import { logger } from '../../utils/logger.js';
import { resolveProviderContext } from '../../config/resolver.js';

/**
 * ResultMapper handles:
 * - API reranking of results
 * - Mapping candidates to search results
 * - Building result metadata
 * - Score normalization
 */
export class ResultMapper {
  /**
   * Map search candidates to formatted search results
   */
  mapResults(
    candidates: SearchCandidate[],
    searchType: string
  ): SearchResult[] {
    return candidates.map(result => {
      const meta: SearchResult['meta'] = {
        id: result.id,
        symbol: result.symbol,
        score: Math.min(1, Math.max(result.score || 0, 0)),
        intent: result.codevault_intent,
        description: result.codevault_description,
        searchType: searchType,
        vectorScore: result.vectorScore
      };

      // Add hybrid fusion scores
      if (typeof result.hybridScore === 'number') meta.hybridScore = result.hybridScore;
      if (typeof result.bm25Score === 'number') meta.bm25Score = result.bm25Score;
      if (typeof result.bm25Rank === 'number') meta.bm25Rank = result.bm25Rank;
      if (typeof result.vectorRank === 'number') meta.vectorRank = result.vectorRank;

      // Add reranker scores
      if (typeof result.rerankerScore === 'number')
        meta.rerankerScore = result.rerankerScore;
      if (typeof result.rerankerRank === 'number')
        meta.rerankerRank = result.rerankerRank;

      // Add symbol boost scores
      if (typeof result.symbolBoost === 'number' && result.symbolBoost > 0) {
        meta.symbolBoost = result.symbolBoost;
        if (Array.isArray(result.symbolBoostSources))
          meta.symbolBoostSources = result.symbolBoostSources;
      }

      // Include raw score if it exceeded 1.0
      if (typeof result.score === 'number' && result.score > 1)
        meta.scoreRaw = result.score;

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

  /**
   * Apply API reranking to results
   */
  async applyReranker(
    query: string,
    candidates: SearchCandidate[],
    chunkDir: string,
    basePath: string,
    providerContext: ReturnType<typeof resolveProviderContext>
  ): Promise<SearchCandidate[]> {
    try {
      const reranked = await rerankWithAPI(query, candidates, {
        max: Math.min(SEARCH_CONSTANTS.RERANKER_MAX_CANDIDATES, candidates.length),
        getTextAsync: async candidate => {
          const codeText = (await this.readChunkText(candidate.sha as string, chunkDir)) || '';
          return this.buildBm25Document(candidate as SearchCandidate, codeText);
        },
        apiUrl: providerContext.reranker.apiUrl,
        apiKey: providerContext.reranker.apiKey,
        model: providerContext.reranker.model,
        maxTokens: providerContext.reranker.maxTokens
      });

      if (Array.isArray(reranked) && reranked.length === candidates.length) {
        return reranked as SearchCandidate[];
      }
    } catch (error) {
      logger.warn(
        'API reranking failed, falling back to original ranking',
        {
          error: error instanceof Error ? error.message : String(error)
        }
      );
    }

    return candidates;
  }

  /**
   * Enforce score bounds on results
   */
  enforceScoreBounds(candidates: SearchCandidate[]): SearchCandidate[] {
    return candidates.map(candidate => ({
      ...candidate,
      score: Math.min(1, Math.max(candidate.score ?? 0, 0))
    }));
  }

  /**
   * Sort results by reranker score, then by regular score
   */
  sortByScore(results: SearchResult[]): SearchResult[] {
    return [...results].sort((a, b) => {
      if (
        typeof a.meta?.rerankerScore === 'number' &&
        typeof b.meta?.rerankerScore === 'number'
      ) {
        return b.meta.rerankerScore - a.meta.rerankerScore;
      }
      return (b.meta?.score ?? 0) - (a.meta?.score ?? 0);
    });
  }

  // Private helpers

  private async readChunkText(sha: string, chunkDir: string): Promise<string | null> {
    try {
      const result = await readChunkFromDisk({ chunkDir, sha });
      return result ? result.code : null;
    } catch {
      return null;
    }
  }

  private buildBm25Document(chunk: SearchCandidate, codeText: string | null): string {
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
}
