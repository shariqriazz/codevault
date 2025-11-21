import path from 'path';
import { normalizeToProjectPath } from './merkle.js';
import { indexProject } from '../core/indexer.js';
import type { EmbeddingProvider } from '../providers/base.js';
import type { ProgressEvent, IndexError } from '../core/types.js';

function normalizeList(basePath: string, values: string[] = []): string[] {
  const normalized = new Set<string>();

  if (!Array.isArray(values)) {
    return [];
  }

  for (const value of values) {
    const relative = normalizeToProjectPath(basePath, value);
    if (relative) {
      normalized.add(relative);
    }
  }

  return Array.from(normalized);
}

export interface UpdateIndexOptions {
  repoPath?: string;
  provider?: string;
  changedFiles?: string[];
  deletedFiles?: string[];
  onProgress?: ((event: ProgressEvent) => void) | null;
  embeddingProvider?: EmbeddingProvider | null;
  encrypt?: string;
  concurrency?: number;
}

export interface UpdateIndexResult {
  success: boolean;
  processedChunks: number;
  totalChunks: number;
  provider: string;
  errors: IndexError[];
}

/**
 * Incrementally update the index for a repository by processing changed/deleted files.
 *
 * @param repoPath - Project root containing `.codevault` artifacts
 * @param provider - Embedding provider name ('auto' uses config/defaults)
 * @param changedFiles - Relative paths to re-index; if empty and no deletes, returns early
 * @param deletedFiles - Relative paths whose artifacts should be removed
 * @param onProgress - Optional progress callback for UI/CLI integrations
 * @param embeddingProvider - Optional initialized provider instance (reuses watch provider)
 * @param encrypt - Optional encryption mode override ('on' | 'off')
 */
export async function updateIndex({
  repoPath = '.',
  provider = 'auto',
  changedFiles = [],
  deletedFiles = [],
  onProgress = null,
  embeddingProvider = null,
  encrypt = undefined,
  concurrency = undefined
}: UpdateIndexOptions = {}): Promise<UpdateIndexResult> {
  const root = path.resolve(repoPath);
  const normalizedChanged = normalizeList(root, changedFiles);
  const normalizedDeleted = normalizeList(root, deletedFiles);

  if (normalizedChanged.length === 0 && normalizedDeleted.length === 0) {
    return {
      success: true,
      processedChunks: 0,
      totalChunks: 0,
      provider,
      errors: []
    };
  }

  return indexProject({
    repoPath: root,
    provider,
    onProgress,
    changedFiles: normalizedChanged,
    deletedFiles: normalizedDeleted,
    embeddingProviderOverride: embeddingProvider,
    encryptMode: encrypt,
    concurrency
  });
}
