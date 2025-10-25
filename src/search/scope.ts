import micromatch from 'micromatch';
import { DEFAULT_RERANKER, RERANKER_OPTIONS, type ScopeFilters, type RerankMode } from '../types/search.js';

function toArray(value: any): any[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function normalizeList(values: any): string[] {
  return toArray(values)
    .map(value => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
}

function normalizeToggle(value: any, defaultValue: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['on', 'true', '1', 'yes', 'enable', 'enabled'].includes(normalized)) {
      return true;
    }

    if (['off', 'false', '0', 'no', 'disable', 'disabled'].includes(normalized)) {
      return false;
    }
  }

  return defaultValue;
}

export function normalizeScopeFilters(scope: any = {}): ScopeFilters {
  const normalized: ScopeFilters = {};

  const normalizedPath = normalizeList(scope.path_glob || scope.pathGlob || scope.path);
  if (normalizedPath.length > 0) {
    normalized.path_glob = normalizedPath;
  }

  const normalizedTags = normalizeList(scope.tags || scope.tag);
  if (normalizedTags.length > 0) {
    normalized.tags = normalizedTags.map(tag => tag.toLowerCase());
  }

  const normalizedLang = normalizeList(scope.lang || scope.language || scope.languages);
  if (normalizedLang.length > 0) {
    normalized.lang = normalizedLang.map(lang => lang.toLowerCase());
  }

  const candidateProvider = typeof scope.provider === 'string' ? scope.provider.trim() : '';
  if (candidateProvider) {
    normalized.provider = candidateProvider;
  }

  const candidateReranker = typeof scope.reranker === 'string' ? scope.reranker.trim() : '';
  if (candidateReranker && RERANKER_OPTIONS.includes(candidateReranker as RerankMode)) {
    normalized.reranker = candidateReranker as RerankMode;
  } else {
    normalized.reranker = DEFAULT_RERANKER;
  }

  normalized.hybrid = normalizeToggle(scope.hybrid, true);
  normalized.bm25 = normalizeToggle(scope.bm25, true);
  normalized.symbol_boost = normalizeToggle(scope.symbol_boost, true);

  return normalized;
}

import type { DatabaseChunk } from '../database/db.js';

export function applyScope(chunks: DatabaseChunk[], scope: ScopeFilters = {}): DatabaseChunk[] {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return chunks;
  }

  const normalized: ScopeFilters = {
    path_glob: Array.isArray(scope.path_glob) ? scope.path_glob : normalizeList(scope.path_glob),
    tags: Array.isArray(scope.tags) ? scope.tags : normalizeList(scope.tags).map(tag => tag.toLowerCase()),
    lang: Array.isArray(scope.lang) ? scope.lang : normalizeList(scope.lang).map(lang => lang.toLowerCase())
  };

  let filtered = chunks;

  if (normalized.path_glob && normalized.path_glob.length > 0) {
    filtered = filtered.filter(chunk => {
      const filePath = chunk.file_path || '';
      if (!filePath) {
        return false;
      }

      return micromatch.isMatch(filePath, normalized.path_glob!, { dot: true });
    });
  }

  if (normalized.tags && normalized.tags.length > 0) {
    const tagSet = new Set(normalized.tags);
    filtered = filtered.filter(chunk => {
      if (!chunk.codevault_tags) {
        return false;
      }

      try {
        const tags = JSON.parse(chunk.codevault_tags || '[]');
        if (!Array.isArray(tags)) {
          return false;
        }

        return tags.some(tag => typeof tag === 'string' && tagSet.has(tag.toLowerCase()));
      } catch (error) {
        return false;
      }
    });
  }

  if (normalized.lang && normalized.lang.length > 0) {
    const langSet = new Set(normalized.lang);
    filtered = filtered.filter(chunk => {
      if (!chunk.lang) {
        return false;
      }

      return langSet.has(String(chunk.lang).toLowerCase());
    });
  }

  return filtered;
}