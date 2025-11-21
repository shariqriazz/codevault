/**
 * Mutex implementation for coordinating async operations
 *
 * Provides a proper mutex/lock mechanism to replace polling-based
 * concurrency control patterns.
 */

export class Mutex {
  private locked = false;
  private queue: Array<() => void> = [];

  /**
   * Check if the mutex is currently locked
   */
  isLocked(): boolean {
    return this.locked;
  }

  /**
   * Acquire the mutex lock
   * Waits if already locked
   */
  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    // Wait for lock to be released
    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  /**
   * Release the mutex lock
   * Allows next queued operation to proceed
   */
  release(): void {
    if (this.queue.length > 0) {
      const resolve = this.queue.shift();
      if (resolve) {
        resolve();
      }
    } else {
      this.locked = false;
    }
  }

  /**
   * Run a function with automatic acquire/release
   * Ensures lock is always released even if function throws
   */
  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /**
   * Get queue length (for debugging)
   */
  getQueueLength(): number {
    return this.queue.length;
  }
}

/**
 * Async semaphore for limiting concurrent operations
 */
export class Semaphore {
  private permits: number;
  private maxPermits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
    this.maxPermits = permits;
  }

  /**
   * Acquire a permit
   */
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  /**
   * Release a permit
   */
  release(): void {
    if (this.queue.length > 0) {
      const resolve = this.queue.shift();
      if (resolve) {
        resolve();
      }
    } else {
      this.permits = Math.min(this.permits + 1, this.maxPermits);
    }
  }

  /**
   * Run function with automatic acquire/release
   */
  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /**
   * Get available permits
   */
  getAvailablePermits(): number {
    return this.permits;
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }
}
