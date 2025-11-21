import path from 'path';
import os from 'node:os';
import { normalizeToProjectPath } from '../indexer/merkle.js';
import type { IndexProjectOptions, IndexProjectResult } from './types.js';
import { FileScanner } from './indexing/file-scanner.js';
import { IndexContext } from './indexing/IndexContext.js';
import { IndexState } from './indexing/IndexState.js';
import { FileProcessor } from './indexing/FileProcessor.js';
import { IndexFinalizationStage } from './indexing/IndexFinalizationStage.js';
import { INDEXING_CONSTANTS } from '../config/constants.js';

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
    const concurrency = this.resolveConcurrency();
    await this.runWithConcurrency(files, concurrency, async rel => {
      deletedSet.delete(rel);
      await fileProcessor.processFile(rel);
    });

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

  private resolveConcurrency(): number {
    const { DEFAULT_CONCURRENCY, MAX_CONCURRENCY } = INDEXING_CONSTANTS;
    const requested = this.options.concurrency;
    const envValue = process.env.CODEVAULT_INDEXING_CONCURRENCY;
    const parsedEnv = envValue ? Number.parseInt(envValue, 10) : null;

    const optionValue = typeof requested === 'number' && Number.isFinite(requested)
      ? requested
      : null;

    const dynamicDefault = this.computeDynamicDefault(MAX_CONCURRENCY);
    const fallbackDefault = Number.isFinite(DEFAULT_CONCURRENCY) ? DEFAULT_CONCURRENCY : dynamicDefault;

    const rawValue = optionValue ?? parsedEnv ?? dynamicDefault ?? fallbackDefault;
    const safeValue = Number.isFinite(rawValue) ? rawValue : 1;
    const bounded = Math.min(MAX_CONCURRENCY, Math.max(1, Math.floor(safeValue)));
    return bounded;
  }

  private computeDynamicDefault(maxConcurrency: number): number {
    const cpuCount = typeof os.cpus === 'function' ? os.cpus().length : 1;
    const calculated = Math.max(1, cpuCount * 2);
    return Math.min(calculated, maxConcurrency);
  }

  private async runWithConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>
  ): Promise<void> {
    if (!items.length) return;

    const queue = [...items];
    const workers = Array.from(
      { length: Math.min(concurrency, queue.length) },
      async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (typeof next === 'undefined') {
            break;
          }
          await worker(next);
        }
      }
    );

    await Promise.all(workers);
  }
}
