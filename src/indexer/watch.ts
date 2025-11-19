import chokidar from 'chokidar';
import path from 'path';
import { updateIndex } from './update.js';
import { toPosixPath } from './merkle.js';
import { getSupportedLanguageExtensions } from '../languages/rules.js';
import { createEmbeddingProvider, type EmbeddingProvider } from '../providers/index.js';
import { resolveProviderContext } from '../config/resolver.js';

const DEFAULT_DEBOUNCE_MS = 500;
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

interface WatchOptions {
  repoPath?: string;
  provider?: string;
  debounceMs?: number;
  onBatch?: ((event: { changed: string[]; deleted: string[] }) => void) | null;
  logger?: Console;
  encrypt?: string;
}

interface WatchController {
  watcher: ReturnType<typeof chokidar.watch>;
  ready: Promise<void>;
  close: () => Promise<void>;
  flush: () => Promise<void>;
}

export function startWatch({
  repoPath = '.',
  provider = 'auto',
  debounceMs = DEFAULT_DEBOUNCE_MS,
  onBatch = null,
  logger = console,
  encrypt = undefined
}: WatchOptions = {}): WatchController {
  const root = path.resolve(repoPath);
  const supportedExtensions = new Set(
    (getSupportedLanguageExtensions() || []).map(ext => ext.toLowerCase())
  );
  const watchPatterns = supportedExtensions.size > 0
    ? Array.from(supportedExtensions).map(ext => `**/*${ext}`)
    : ['**/*'];

  const effectiveDebounce = Number.isFinite(Number.parseInt(String(debounceMs), 10))
    ? Math.max(Number.parseInt(String(debounceMs), 10), 50)
    : DEFAULT_DEBOUNCE_MS;

  const watcher = chokidar.watch(watchPatterns, {
    cwd: root,
    ignoreInitial: true,
    ignored: IGNORED_GLOBS,
    awaitWriteFinish: {
      stabilityThreshold: Math.max(effectiveDebounce, 100),
      pollInterval: 50
    },
    persistent: true
  });

  const ready = new Promise<void>(resolve => {
    watcher.once('ready', resolve);
  });

  const pendingChanges = new Set<string>();
  const pendingDeletes = new Set<string>();
  let timer: NodeJS.Timeout | null = null;
  let processing = false;
  let flushPromise: Promise<void> | null = null;
  let embeddingProviderInstance: EmbeddingProvider | null = null;
  let embeddingProviderInitPromise: Promise<EmbeddingProvider> | null = null;
  let providerInitErrorLogged = false;
  const providerContext = resolveProviderContext(root);

  async function getEmbeddingProviderInstance(): Promise<EmbeddingProvider> {
    if (embeddingProviderInstance) {
      return embeddingProviderInstance;
    }

    if (!embeddingProviderInitPromise) {
      embeddingProviderInitPromise = (async () => {
        const instance = createEmbeddingProvider(provider, providerContext.embedding);
        if (instance.init) {
          await instance.init();
        }
        embeddingProviderInstance = instance;
        return instance;
      })();
    }

    try {
      return await embeddingProviderInitPromise;
    } catch (error) {
      embeddingProviderInitPromise = null;
      embeddingProviderInstance = null;
      throw error;
    }
  }

  function scheduleFlush(): void {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, effectiveDebounce);
  }

  function recordChange(type: string, filePath: string): void {
    const normalized = toPosixPath(filePath);
    if (!normalized) {
      return;
    }

    const ext = path.extname(normalized).toLowerCase();
    if (supportedExtensions.size > 0 && !supportedExtensions.has(ext)) {
      return;
    }

    if (type === 'unlink') {
      pendingDeletes.add(normalized);
      pendingChanges.delete(normalized);
    } else {
      pendingChanges.add(normalized);
      pendingDeletes.delete(normalized);
    }

    scheduleFlush();
  }

  async function flush(): Promise<void> {
    // FIX: Prevent race condition by waiting for any in-progress flush
    if (flushPromise) {
      await flushPromise;
      // After waiting, check if new changes came in and reschedule
      if (pendingChanges.size > 0 || pendingDeletes.size > 0) {
        scheduleFlush();
      }
      return;
    }

    if (pendingChanges.size === 0 && pendingDeletes.size === 0) {
      return;
    }

    // Atomically capture and clear pending changes
    const changed = Array.from(pendingChanges);
    const deleted = Array.from(pendingDeletes);
    pendingChanges.clear();
    pendingDeletes.clear();

    processing = true;
    
    // Create promise that tracks this flush operation
    flushPromise = (async () => {
      try {
        let embeddingProviderOverride: EmbeddingProvider | null = null;

        try {
          embeddingProviderOverride = await getEmbeddingProviderInstance();
        } catch (providerError) {
          if (!providerInitErrorLogged && logger && typeof logger.error === 'function') {
            logger.error('CodeVault watch provider initialization failed:', providerError);
            providerInitErrorLogged = true;
          }
        }

        await updateIndex({
          repoPath: root,
          provider,
          changedFiles: changed,
          deletedFiles: deleted,
          embeddingProvider: embeddingProviderOverride,
          encrypt
        });

        if (typeof onBatch === 'function') {
          await onBatch({ changed, deleted });
        } else if (logger && typeof logger.log === 'function') {
          logger.log(
            `CodeVault watch: indexed ${changed.length} changed / ${deleted.length} deleted files`
          );
        }
      } catch (error) {
        if (logger && typeof logger.error === 'function') {
          logger.error('CodeVault watch update failed:', error);
        }
      } finally {
        processing = false;
        flushPromise = null;
        // Check if new changes came in during processing
        if (pendingChanges.size > 0 || pendingDeletes.size > 0) {
          scheduleFlush();
        }
      }
    })();

    await flushPromise;
  }

  async function waitForProcessing(): Promise<void> {
    while (processing) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  const settleDelay = Math.min(effectiveDebounce, 200);

  async function drainPending(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    await flush();
    await waitForProcessing();

    if (pendingChanges.size > 0 || pendingDeletes.size > 0 || timer) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await flush();
      await waitForProcessing();
      return;
    }

    if (settleDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, settleDelay));
    }

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    if (pendingChanges.size > 0 || pendingDeletes.size > 0) {
      await flush();
      await waitForProcessing();
    }
  }

  watcher.on('add', file => recordChange('add', file));
  watcher.on('change', file => recordChange('change', file));
  watcher.on('unlink', file => recordChange('unlink', file));
  watcher.on('error', error => {
    if (logger && typeof logger.error === 'function') {
      logger.error('CodeVault watch error:', error);
    }
  });

  return {
    watcher,
    ready,
    async close() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      // FIX: Clean up embedding provider on close
      if (embeddingProviderInstance) {
        embeddingProviderInstance = null;
        embeddingProviderInitPromise = null;
      }
      await watcher.close();
    },
    flush: drainPending
  };
}
