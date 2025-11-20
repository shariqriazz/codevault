import { updateIndex } from './update.js';
import type { EmbeddingProvider } from '../providers/base.js';
import { WATCHER_CONSTANTS } from '../config/constants.js';

export interface ChangeQueueOptions {
  repoPath: string;
  provider: string;
  debounceMs: number;
  encrypt?: string;
  logger?: Console;
  onBatch?: ((event: { changed: string[]; deleted: string[] }) => void | Promise<void>) | null;
  providerGetter?: () => Promise<EmbeddingProvider | null>;
}

/**
 * Manages a queue of file changes with debouncing and race-condition-free flushing.
 * Ensures changes are batched and indexed atomically.
 */
export class ChangeQueue {
  private pendingChanges = new Set<string>();
  private pendingDeletes = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private flushPromise: Promise<void> | null = null;
  private processing = false;

  constructor(private options: ChangeQueueOptions) {}

  /**
   * Add a file change to the queue
   */
  enqueue(type: 'add' | 'change' | 'unlink', filePath: string): void {
    if (type === 'unlink') {
      this.pendingDeletes.add(filePath);
      this.pendingChanges.delete(filePath);
    } else {
      this.pendingChanges.add(filePath);
      this.pendingDeletes.delete(filePath);
    }

    this.scheduleFlush();
  }

  /**
   * Schedule a debounced flush
   */
  private scheduleFlush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.options.debounceMs);
  }

  /**
   * Flush pending changes (race-condition safe)
   */
  async flush(): Promise<void> {
    // Prevent race condition: if flush is already in progress, wait for it
    if (this.flushPromise) {
      await this.flushPromise;
      // After waiting, check if new changes accumulated and reschedule
      if (this.pendingChanges.size > 0 || this.pendingDeletes.size > 0) {
        this.scheduleFlush();
      }
      return;
    }

    // Nothing to flush
    if (this.pendingChanges.size === 0 && this.pendingDeletes.size === 0) {
      return;
    }

    // Atomically capture and clear pending changes
    const changed = Array.from(this.pendingChanges);
    const deleted = Array.from(this.pendingDeletes);
    this.pendingChanges.clear();
    this.pendingDeletes.clear();

    this.processing = true;

    // Create promise that tracks this flush operation
    this.flushPromise = this.executeFlush(changed, deleted);

    await this.flushPromise;
  }

  /**
   * Execute the actual flush operation
   */
  private async executeFlush(changed: string[], deleted: string[]): Promise<void> {
    try {
      // Get provider if provider getter is available
      let embeddingProviderOverride: EmbeddingProvider | null = null;
      if (this.options.providerGetter) {
        embeddingProviderOverride = await this.options.providerGetter();
      }

      // Update the index
      await updateIndex({
        repoPath: this.options.repoPath,
        provider: this.options.provider,
        changedFiles: changed,
        deletedFiles: deleted,
        embeddingProvider: embeddingProviderOverride,
        encrypt: this.options.encrypt
      });

      // Notify callback or log
      if (typeof this.options.onBatch === 'function') {
        await this.options.onBatch({ changed, deleted });
      } else if (this.options.logger && typeof this.options.logger.log === 'function') {
        this.options.logger.log(
          `CodeVault watch: indexed ${changed.length} changed / ${deleted.length} deleted files`
        );
      }
    } catch (error) {
      if (this.options.logger && typeof this.options.logger.error === 'function') {
        this.options.logger.error('CodeVault watch update failed:', error);
      }
    } finally {
      this.processing = false;
      this.flushPromise = null;

      // Check if new changes came in during processing
      if (this.pendingChanges.size > 0 || this.pendingDeletes.size > 0) {
        this.scheduleFlush();
      }
    }
  }

  /**
   * Wait for any in-progress processing to complete
   */
  private async waitForProcessing(): Promise<void> {
    while (this.processing) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  /**
   * Drain all pending changes (for shutdown).
   * Ensures all queued changes are flushed before returning.
   */
  async drain(): Promise<void> {
    const settleDelay = Math.min(this.options.debounceMs, WATCHER_CONSTANTS.SETTLE_DELAY_MS);

    // Cancel any pending timer
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // First flush
    await this.flush();
    await this.waitForProcessing();

    // Check if more changes accumulated, flush again if needed
    if (this.pendingChanges.size > 0 || this.pendingDeletes.size > 0 || this.timer) {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      await this.flush();
      await this.waitForProcessing();
      return;
    }

    // Wait settle period for any last-minute changes
    if (settleDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, settleDelay));
    }

    // Final check and flush
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.pendingChanges.size > 0 || this.pendingDeletes.size > 0) {
      await this.flush();
      await this.waitForProcessing();
    }
  }

  /**
   * Cancel any pending flush (for cleanup)
   */
  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Check if there are pending changes
   */
  hasPending(): boolean {
    return this.pendingChanges.size > 0 || this.pendingDeletes.size > 0;
  }

  /**
   * Get count of pending changes
   */
  getPendingCount(): { changes: number; deletes: number } {
    return {
      changes: this.pendingChanges.size,
      deletes: this.pendingDeletes.size
    };
  }
}
