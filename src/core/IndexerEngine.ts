import path from 'path';
import { normalizeToProjectPath } from '../indexer/merkle.js';
import type { IndexProjectOptions, IndexProjectResult } from './types.js';
import { FileScanner } from './indexing/file-scanner.js';
import { IndexContext } from './indexing/IndexContext.js';
import { IndexState } from './indexing/IndexState.js';
import { FileProcessor } from './indexing/FileProcessor.js';
import { IndexFinalizationStage } from './indexing/IndexFinalizationStage.js';

/**
 * IndexerEngine orchestrates the code indexing process using a stage-based architecture:
 * - IndexContext: Setup and initialization
 * - IndexState: Mutable state tracking
 * - FileProcessor: Individual file processing
 * - IndexFinalizationStage: Finalization and cleanup
 */
export class IndexerEngine {
  constructor(private options: IndexProjectOptions = {}) {}

  public async index(): Promise<IndexProjectResult> {
    const {
      repoPath = '.',
      onProgress = null,
      changedFiles = null,
      deletedFiles = []
    } = this.options;

    const repo = path.resolve(repoPath);

    // Normalize file paths
    const normalizedChanged = Array.isArray(changedFiles)
      ? Array.from(new Set(
          changedFiles
            .map(file => normalizeToProjectPath(repo, file))
            .filter(Boolean) as string[]
        ))
      : null;

    const normalizedDeleted = Array.from(new Set(
      (Array.isArray(deletedFiles) ? deletedFiles : [])
        .map(file => normalizeToProjectPath(repo, file))
        .filter(Boolean) as string[]
    ));

    const deletedSet = new Set(normalizedDeleted);

    // Scan for files to process
    const scanner = new FileScanner();
    const { files, toDelete } = await scanner.scan(repo, normalizedChanged);

    for (const file of toDelete) {
      deletedSet.add(file);
    }

    const isPartialUpdate = normalizedChanged !== null;

    // Stage 1: Setup and initialization
    const context = await IndexContext.prepare(this.options);
    const state = new IndexState(context.codemap, context.updatedMerkle);
    const fileProcessor = new FileProcessor(context, state, onProgress);

    // Stage 2: Process files
    for (const rel of files) {
      deletedSet.delete(rel);
      await fileProcessor.processFile(rel);
    }

    // Stage 3: Handle deleted files
    for (const fileRel of deletedSet) {
      await fileProcessor.removeFileArtifacts(fileRel);
    }

    // Clean up stale files (full re-index only)
    if (!isPartialUpdate) {
      const existingFilesSet = new Set(files);
      for (const fileRel of Object.keys(context.merkle)) {
        if (!existingFilesSet.has(fileRel)) {
          await fileProcessor.removeFileArtifacts(fileRel);
        }
      }
    }

    // Stage 4: Finalization
    const finalizer = new IndexFinalizationStage(context, state, onProgress);
    return await finalizer.finalize();
  }
}
