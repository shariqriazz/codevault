import chokidar from 'chokidar';
import path from 'path';
import { toPosixPath } from './merkle.js';
import { getSupportedLanguageExtensions } from '../languages/rules.js';
import { resolveProviderContext } from '../config/resolver.js';
import { WATCHER_CONSTANTS } from '../config/constants.js';
import { ChangeQueue } from './ChangeQueue.js';
import { ProviderManager } from './ProviderManager.js';

const DEFAULT_DEBOUNCE_MS = WATCHER_CONSTANTS.DEFAULT_DEBOUNCE_MS;
const IGNORED_GLOBS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.codevault/**',
  '**/dist/**',
  '**/build/**',
  '**/tmp/**',
  '**/.tmp/**',
  '**/vendor/**'
];

export interface WatchServiceOptions {
  repoPath?: string;
  provider?: string;
  debounceMs?: number;
  onBatch?: ((event: { changed: string[]; deleted: string[] }) => void) | null;
  logger?: Console;
  encrypt?: string;
}

export interface WatchController {
  watcher: ReturnType<typeof chokidar.watch>;
  ready: Promise<void>;
  close: () => Promise<void>;
  flush: () => Promise<void>;
}

/**
 * WatchService manages file system watching and coordinates with the change queue
 * and provider manager to keep the index up-to-date.
 */
export class WatchService {
  private watcher: ReturnType<typeof chokidar.watch>;
  private changeQueue: ChangeQueue;
  private providerManager: ProviderManager;
  private supportedExtensions: Set<string>;
  private ready: Promise<void>;
  private root: string;

  constructor(private options: WatchServiceOptions = {}) {
    this.root = path.resolve(options.repoPath || '.');

    // Setup supported file extensions
    this.supportedExtensions = new Set(
      (getSupportedLanguageExtensions() || []).map(ext => ext.toLowerCase())
    );

    // Calculate effective debounce
    const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    const effectiveDebounce = Number.isFinite(Number.parseInt(String(debounceMs), 10))
      ? Math.max(Number.parseInt(String(debounceMs), 10), WATCHER_CONSTANTS.MIN_DEBOUNCE_MS)
      : DEFAULT_DEBOUNCE_MS;

    // Initialize provider manager
    const providerContext = resolveProviderContext(this.root);
    this.providerManager = new ProviderManager(
      options.provider || 'auto',
      providerContext.embedding,
      options.logger || console
    );

    // Initialize change queue
    this.changeQueue = new ChangeQueue({
      repoPath: this.root,
      provider: options.provider || 'auto',
      debounceMs: effectiveDebounce,
      encrypt: options.encrypt,
      logger: options.logger || console,
      onBatch: options.onBatch,
      providerGetter: () => this.providerManager.getProviderSafe()
    });

    // Setup file watcher
    const watchPatterns = this.supportedExtensions.size > 0
      ? Array.from(this.supportedExtensions).map(ext => `**/*${ext}`)
      : ['**/*'];

    this.watcher = chokidar.watch(watchPatterns, {
      cwd: this.root,
      ignoreInitial: true,
      ignored: IGNORED_GLOBS,
      awaitWriteFinish: {
        stabilityThreshold: Math.max(effectiveDebounce, WATCHER_CONSTANTS.STABILITY_THRESHOLD_MS),
        pollInterval: WATCHER_CONSTANTS.POLL_INTERVAL_MS
      },
      persistent: true
    });

    // Setup ready promise
    this.ready = new Promise<void>(resolve => {
      this.watcher.once('ready', resolve);
    });

    // Attach event handlers
    this.attachEventHandlers();
  }

  /**
   * Attach chokidar event handlers
   */
  private attachEventHandlers(): void {
    this.watcher.on('add', file => this.handleFileEvent('add', file));
    this.watcher.on('change', file => this.handleFileEvent('change', file));
    this.watcher.on('unlink', file => this.handleFileEvent('unlink', file));
    this.watcher.on('error', error => this.handleError(error as Error));
  }

  /**
   * Handle file system events
   */
  private handleFileEvent(type: 'add' | 'change' | 'unlink', filePath: string): void {
    const normalized = toPosixPath(filePath);
    if (!normalized) {
      return;
    }

    // Check if file extension is supported
    const ext = path.extname(normalized).toLowerCase();
    if (this.supportedExtensions.size > 0 && !this.supportedExtensions.has(ext)) {
      return;
    }

    // Enqueue the change
    this.changeQueue.enqueue(type, normalized);
  }

  /**
   * Handle watcher errors
   */
  private handleError(error: Error): void {
    const logger = this.options.logger || console;
    if (logger && typeof logger.error === 'function') {
      logger.error('CodeVault watch error:', error);
    }
  }

  /**
   * Wait for watcher to be ready
   */
  async waitForReady(): Promise<void> {
    await this.ready;
  }

  /**
   * Flush all pending changes
   */
  async flush(): Promise<void> {
    await this.changeQueue.drain();
  }

  /**
   * Close the watcher and clean up resources
   */
  async close(): Promise<void> {
    // Cancel any pending flushes
    this.changeQueue.cancel();

    // Clean up provider
    this.providerManager.cleanup();

    // Close the watcher
    await this.watcher.close();
  }

  /**
   * Get a controller object (for backward compatibility)
   */
  getController(): WatchController {
    return {
      watcher: this.watcher,
      ready: this.ready,
      close: () => this.close(),
      flush: () => this.flush()
    };
  }
}

/**
 * Start watching a repository (factory function for backward compatibility)
 */
export function startWatch(options: WatchServiceOptions = {}): WatchController {
  const service = new WatchService(options);
  return service.getController();
}
