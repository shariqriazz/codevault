import { IndexerEngine } from './IndexerEngine.js';
import type { IndexProjectOptions, IndexProjectResult } from './types.js';

/**
 * Indexes a project into CodeVault's SQLite + chunk store for hybrid search.
 *
 * The indexer performs Tree-sitter based chunking, embedding generation, codemap
 * construction, Merkle tracking, and optional encryption. It supports both full
 * and incremental runs by passing `changedFiles` / `deletedFiles`.
 *
 * @param options - Indexing configuration (repo path, provider, hooks, encryption)
 * @returns Summary of processed chunks, provider used, and any encountered errors
 * @throws {Error} When the target repository path does not exist or cannot be read
 * @example
 * await indexProject({ repoPath: '/path/to/repo', provider: 'openai' });
 */
export async function indexProject(options: IndexProjectOptions = {}): Promise<IndexProjectResult> {
  const engine = new IndexerEngine(options);
  return await engine.index();
}
