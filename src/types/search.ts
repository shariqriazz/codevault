export const RERANKER_OPTIONS = ['off', 'api'] as const;
export const DEFAULT_RERANKER = 'off';

export type RerankMode = typeof RERANKER_OPTIONS[number];

export interface ScopeFilters {
  path_glob?: string[];
  tags?: string[];
  lang?: string[];
  provider?: string;
  reranker?: RerankMode;
  hybrid?: boolean;
  bm25?: boolean;
  symbol_boost?: boolean;
}

export function hasScopeFilters(scope?: ScopeFilters): boolean {
  if (!scope) {
    return false;
  }

  return Boolean(
    (Array.isArray(scope.path_glob) && scope.path_glob.length > 0) ||
    (Array.isArray(scope.tags) && scope.tags.length > 0) ||
    (Array.isArray(scope.lang) && scope.lang.length > 0)
  );
}