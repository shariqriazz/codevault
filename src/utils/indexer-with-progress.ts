import fg from 'fast-glob';
import path from 'path';
import fs from 'fs';
import { indexProject } from '../core/indexer.js';
import type { IndexProjectOptions, IndexProjectResult } from '../core/types.js';

export interface IndexWithProgressCallbacks {
  onScanComplete?: (fileCount: number) => void;
  onFileProgress?: (
    current: number,
    total: number,
    fileName: string,
    etaMs: number | null,
    avgPerFileMs: number | null,
    countFile?: boolean
  ) => void;
  onFinalizing?: () => void;
}

export async function indexProjectWithProgress(
  options: IndexProjectOptions & { callbacks?: IndexWithProgressCallbacks }
): Promise<IndexProjectResult> {
  const { callbacks, ...indexOptions } = options;
  const repo = path.resolve(options.repoPath || '.');

  // Progress tracking
  let totalFiles = 0;
  let processedCount = 0;
  const processedFiles = new Set<string>();
  const startTime = Date.now();
  let lastFileCompletion = startTime;

  const result = await indexProject({
    ...indexOptions,
    onProgress: (event) => {
      if (event.type === 'scan_complete') {
        totalFiles = event.fileCount || 0;
        if (callbacks?.onScanComplete) {
          callbacks.onScanComplete(totalFiles);
        }
        return;
      }

      if (event.type === 'chunk_processed' && event.file && callbacks?.onFileProgress) {
        const isNewFile = !processedFiles.has(event.file);
        if (isNewFile) {
          processedFiles.add(event.file);
          processedCount++;
          lastFileCompletion = Date.now();
        }

        const elapsedMs = Date.now() - startTime;
        const avgPerFile = processedCount > 0 ? elapsedMs / processedCount : null;
        const remaining = totalFiles > 0 ? Math.max(totalFiles - processedCount, 0) : null;

        // Stall-aware ETA: if no file completed for 5s, signal stalled (-1)
        const sinceLastCompletion = Date.now() - lastFileCompletion;
        let etaMs: number | null = null;
        if (avgPerFile !== null && remaining !== null) {
          etaMs = avgPerFile * remaining;
          if (sinceLastCompletion > 5000 && isNewFile === false) {
            etaMs = -1; // stalled
          }
        }

        callbacks.onFileProgress(processedCount, totalFiles || remaining || 0, event.file, etaMs, avgPerFile, isNewFile);
      }
      if (event.type === 'finalizing' && callbacks?.onFinalizing) {
        callbacks.onFinalizing();
      }
    }
  });
  
  return result;
}
