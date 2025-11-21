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
  onChunkHeartbeat?: (etaMs: number | null) => void;
  onFinalizing?: () => void;
}

export async function indexProjectWithProgress(
  options: IndexProjectOptions & { callbacks?: IndexWithProgressCallbacks }
): Promise<IndexProjectResult> {
  const { callbacks, ...indexOptions } = options;

  // Progress tracking
  let totalFiles = 0;
  let processedCount = 0;
  const processedFiles = new Set<string>();
  const startTime = Date.now();
  const pendingByFile = new Map<string, number>();
  let totalPendingChunks = 0;
  let lastEtaMs: number | null = null;

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

      if (event.type === 'file_enqueued' && event.file !== undefined && typeof event.enqueuedChunks === 'number') {
        pendingByFile.set(event.file, event.enqueuedChunks);
        totalPendingChunks += event.enqueuedChunks;
        if (event.enqueuedChunks === 0 && callbacks?.onFileProgress) {
          // File with no work counts as completed immediately
          const isNewFile = !processedFiles.has(event.file);
          if (isNewFile) {
            processedFiles.add(event.file);
            processedCount++;
          }
          const elapsedMs = Date.now() - startTime;
          const avgPerFile = processedCount > 0 ? elapsedMs / processedCount : null;
          const remaining = totalFiles > 0 ? Math.max(totalFiles - processedCount, 0) : null;
          const etaMs = avgPerFile !== null && remaining !== null ? avgPerFile * remaining : null;
          lastEtaMs = etaMs;
          callbacks.onFileProgress(processedCount, totalFiles || remaining || 0, event.file, etaMs, avgPerFile, true);
        }
      }

      if (event.type === 'chunk_embedded' && event.file) {
        if (pendingByFile.has(event.file)) {
          const next = Math.max(0, (pendingByFile.get(event.file) || 0) - 1);
          pendingByFile.set(event.file, next);
          totalPendingChunks = Math.max(0, totalPendingChunks - 1);
          if (next === 0 && callbacks?.onFileProgress) {
            const isNewFile = !processedFiles.has(event.file);
            if (isNewFile) {
              processedFiles.add(event.file);
              processedCount++;
            }

            const elapsedMs = Date.now() - startTime;
            const avgPerFile = processedCount > 0 ? elapsedMs / processedCount : null;
            const remaining = totalFiles > 0 ? Math.max(totalFiles - processedCount, 0) : null;
            const etaMs = avgPerFile !== null && remaining !== null ? avgPerFile * remaining : null;
            lastEtaMs = etaMs;
            callbacks.onFileProgress(processedCount, totalFiles || remaining || 0, event.file, etaMs, avgPerFile, true);
          }
        }
      }

      if (event.type === 'chunk_processed' && callbacks?.onChunkHeartbeat) {
        callbacks.onChunkHeartbeat(lastEtaMs);
      }
      if (event.type === 'finalizing' && callbacks?.onFinalizing) {
        callbacks.onFinalizing();
      }
    }
  });
  
  return result;
}
