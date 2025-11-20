import { SearchService } from './SearchService.js';
import type { ScopeFilters } from '../types/search.js';
import type { SearchCodeResult, GetChunkResult } from './types.js';

// Singleton instance to maintain cache state
const searchService = new SearchService();

/**
 * Execute a hybrid search against the indexed workspace.
 *
 * @param query - Natural language or keyword query
 * @param limit - Maximum number of results to return (defaults to config)
 * @param provider - Embedding provider name ('auto' by default)
 * @param workingPath - Workspace root containing .codevault artifacts
 * @param scopeOptions - Optional filters (paths, tags, language, reranker, etc.)
 */
export async function searchCode(
  query: string,
  limit?: number,
  provider?: string,
  workingPath?: string,
  scopeOptions?: ScopeFilters
): Promise<SearchCodeResult> {
  return await searchService.search(query, limit, provider, workingPath, scopeOptions);
}

/**
 * Return a lightweight overview of the index (no query required).
 *
 * @param limit - Number of representative chunks to return
 * @param workingPath - Workspace root containing .codevault artifacts
 */
export async function getOverview(limit?: number, workingPath?: string): Promise<SearchCodeResult> {
  return await searchService.getOverview(limit, workingPath);
}

/**
 * Fetch a chunk's code contents by SHA.
 *
 * @param sha - Chunk SHA to retrieve
 * @param workingPath - Workspace root containing .codevault artifacts
 */
export async function getChunk(sha: string, workingPath?: string): Promise<GetChunkResult> {
  return await searchService.getChunk(sha, workingPath);
}

/**
 * Preload provider, codemap, and caches for faster subsequent searches.
 *
 * @param workingPath - Workspace root containing .codevault artifacts
 * @param provider - Embedding provider name ('auto' by default)
 */
export async function warmupSearch(workingPath?: string, provider?: string): Promise<void> {
  await searchService.warmup(workingPath, provider);
}

/**
 * Clear in-memory search caches and close any retained resources.
 */
export function clearSearchCaches(): void {
  searchService.clearCaches();
}
