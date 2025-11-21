import { decodeEmbedding, type DatabaseChunk } from '../../database/db.js';
import type { EmbeddingProvider } from '../../providers/index.js';
import { DOC_BOOST, DOC_BOOST_CONSTANTS } from '../../config/constants.js';
import { logger } from '../../utils/logger.js';

/**
 * SearchCandidate represents a chunk with search scores and metadata
 */
export interface SearchCandidate {
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

// Cache for decoded embeddings to avoid repeated JSON parsing
const embeddingCache = new WeakMap<DatabaseChunk, Float32Array>();

/**
 * CandidateRetriever handles:
 * - Vector similarity computation
 * - Tag/intent/doc boosting
 * - Building ranked candidate pools
 */
export class CandidateRetriever {
  /**
   * Build a pool of search candidates from chunks using vector similarity
   */
  async buildVectorPool(
    chunks: DatabaseChunk[],
    provider: EmbeddingProvider,
    query: string
  ): Promise<{ chunkInfoById: Map<string, SearchCandidate>; vectorPool: SearchCandidate[] }> {
    const chunkInfoById = new Map<string, SearchCandidate>();
    const results: SearchCandidate[] = [];

    // Generate query embedding
    let queryEmbedding: ArrayLike<number> | null = null;
    if (chunks.length > 0) {
      queryEmbedding = await provider.generateEmbedding(query);
    }

    // Score each chunk
    for (const chunk of chunks) {
      const embedding = this.decodeEmbedding(chunk);
      const vectorSimilarity = queryEmbedding
        ? this.cosineSimilarity(queryEmbedding, embedding)
        : 0;

      // Calculate boost scores
      let boostScore = 0;

      // Intent boost
      if (chunk.codevault_intent && query.includes(chunk.codevault_intent.toLowerCase())) {
        boostScore += DOC_BOOST_CONSTANTS.INTENT_MATCH_BOOST;
      }

      // Tag boost
      if (chunk.codevault_tags) {
        try {
          const tags: unknown = JSON.parse(chunk.codevault_tags || '[]');
          if (Array.isArray(tags)) {
            tags.forEach((tag: unknown) => {
              if (typeof tag === 'string' && query.includes(tag.toLowerCase())) {
                boostScore += DOC_BOOST_CONSTANTS.TAG_MATCH_BOOST;
              }
            });
          }
        } catch (error) {
          logger.warn('Failed to parse codevault_tags for chunk', {
            chunkId: chunk.id,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // Documentation file boost
      let docBoost = 0;
      const filePath = chunk.file_path.toLowerCase();
      if (
        filePath.includes('readme') ||
        filePath.includes('/docs/') ||
        filePath.startsWith('docs/') ||
        filePath.includes('changelog') ||
        filePath.includes('contributing') ||
        filePath.endsWith('.md')
      ) {
        docBoost = DOC_BOOST;
      }

      // Final score (capped at 1.0)
      const finalScore = Math.min(1, Math.max(0, vectorSimilarity + boostScore + docBoost));

      const candidate: SearchCandidate = {
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

      chunkInfoById.set(chunk.id, candidate);
      results.push(candidate);
    }

    // Sort by score (highest first)
    results.sort((a, b) => b.score - a.score);

    return { chunkInfoById, vectorPool: results };
  }

  /**
   * Cosine similarity between two vectors
   */
  private cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Decode and cache embedding to avoid repeated JSON parsing
   */
  private decodeEmbedding(chunk: DatabaseChunk): Float32Array {
    const cached = embeddingCache.get(chunk);
    if (cached) {
      return cached;
    }

    const vector = decodeEmbedding(
      chunk.embedding,
      chunk.embedding_dimensions || undefined
    );
    if (vector.length === 0 && chunk.embedding && chunk.embedding.length > 0) {
      logger.warn('Embedding decoded to empty vector', { chunkId: chunk.id });
    }
    embeddingCache.set(chunk, vector);
    return vector;
  }
}
