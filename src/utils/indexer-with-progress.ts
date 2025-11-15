import fg from 'fast-glob';
import path from 'path';
import fs from 'fs';
import { indexProject } from '../core/indexer.js';
import { getSupportedLanguageExtensions } from '../languages/rules.js';
import { DEFAULT_SCAN_IGNORES } from './scan-patterns.js';
import type { IndexProjectOptions, IndexProjectResult } from '../core/types.js';

export interface IndexWithProgressCallbacks {
  onScanComplete?: (fileCount: number) => void;
  onFileProgress?: (current: number, total: number, fileName: string) => void;
  onFinalizing?: () => void;
}

export async function indexProjectWithProgress(
  options: IndexProjectOptions & { callbacks?: IndexWithProgressCallbacks }
): Promise<IndexProjectResult> {
  const { callbacks, ...indexOptions } = options;
  const repo = path.resolve(options.repoPath || '.');
  
  // Phase 1: Scan files (fast)
  const languagePatterns = getSupportedLanguageExtensions().map(ext => `**/*${ext}`);
  const files = await fg(languagePatterns, {
    cwd: repo,
    absolute: false,
    followSymbolicLinks: false,
    ignore: DEFAULT_SCAN_IGNORES,
    onlyFiles: true,
    dot: false
  });
  
  if (callbacks?.onScanComplete) {
    callbacks.onScanComplete(files.length);
  }
  
  // Phase 2: Index with progress tracking
  let processedCount = 0;
  const processedFiles = new Set<string>();
  const result = await indexProject({
    ...indexOptions,
    onProgress: (event) => {
      if (event.type === 'chunk_processed' && event.file && callbacks?.onFileProgress) {
        // Only count each file once (not per chunk)
        if (!processedFiles.has(event.file)) {
          processedFiles.add(event.file);
          processedCount++;
          callbacks.onFileProgress(processedCount, files.length, event.file);
        }
      }
      if (event.type === 'finalizing' && callbacks?.onFinalizing) {
        callbacks.onFinalizing();
      }
    }
  });
  
  return result;
}