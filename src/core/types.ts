import type { EmbeddingProvider } from '../providers/base.js';

export interface IndexProjectOptions {
  repoPath?: string;
  provider?: string;
  onProgress?: ((event: ProgressEvent) => void) | null;
  changedFiles?: string[] | null;
  deletedFiles?: string[];
  embeddingProviderOverride?: EmbeddingProvider | null;
  encryptMode?: string;
}

export interface IndexProjectResult {
  success: boolean;
  processedChunks: number;
  totalChunks: number;
  provider: string;
  errors: IndexError[];
  chunkingStats?: ChunkingStats;
  tokenStats?: any;
}

export interface ProgressEvent {
  type: string;
  file?: string;
  symbol?: string;
  chunkId?: string;
  fileCount?: number;
  languages?: number;
  stats?: {
    chunks?: number;
    merged?: number;
    subdivided?: number;
    skipped?: number;
  };
}

export interface IndexError {
  type: string;
  file?: string;
  chunkId?: string;
  error: string;
}

export interface ChunkingStats {
  totalNodes: number;
  skippedSmall: number;
  subdivided: number;
  statementFallback: number;
  normalChunks: number;
  mergedSmall: number;
  fileGrouped?: number;
  functionsGrouped?: number;
}

export interface SearchResult {
  type: string;
  lang: string;
  path: string;
  sha: string;
  data: string | null;
  meta: {
    id?: string;
    symbol: string;
    score: number;
    searchType?: string;
    intent?: string;
    description?: string;
    vectorScore?: number;
    hybridScore?: number;
    bm25Score?: number;
    bm25Rank?: number;
    vectorRank?: number;
    rerankerScore?: number;
    rerankerRank?: number;
    symbolBoost?: number;
    symbolBoostSources?: string[];
    scoreRaw?: number;
  };
}

export interface SearchCodeResult {
  success: boolean;
  query?: string;
  searchType?: string;
  intentionResults?: number;
  vectorResults?: number;
  provider: string;
  scope?: any;
  reranker?: string;
  hybrid?: {
    enabled: boolean;
    bm25Enabled: boolean;
    fused?: boolean;
    bm25Candidates?: number;
  };
  symbolBoost?: {
    enabled: boolean;
    boosted: boolean;
  };
  chunkLoadingFailures?: {
    totalAttempted: number;
    failed: number;
    reasons: {
      encryption_key_required?: number;
      encryption_auth_failed?: number;
      chunk_decompression_failed?: number;
      chunk_read_failed?: number;
      file_not_found?: number;
    };
  };
  warnings?: string[];
  results: SearchResult[];
  error?: string;
  message?: string;
  suggestion?: string;
}

export interface GetChunkResult {
  success: boolean;
  code?: string;
  error?: string;
}