import { SearchService } from './SearchService.js';
import type { ScopeFilters } from '../types/search.js';
import type { SearchCodeResult, GetChunkResult } from './types.js';

// Singleton instance to maintain cache state
const searchService = new SearchService();

export async function searchCode(
  query: string,
  limit?: number,
  provider?: string,
  workingPath?: string,
  scopeOptions?: ScopeFilters
): Promise<SearchCodeResult> {
  return await searchService.search(query, limit, provider, workingPath, scopeOptions);
}

export async function getOverview(limit?: number, workingPath?: string): Promise<SearchCodeResult> {
  return await searchService.getOverview(limit, workingPath);
}

export async function getChunk(sha: string, workingPath?: string): Promise<GetChunkResult> {
  return await searchService.getChunk(sha, workingPath);
}

export function clearSearchCaches(): void {
  searchService.clearCaches();
}
