import fs from 'fs';
import path from 'path';
import { createEmbeddingProvider, type EmbeddingProvider } from '../../providers/index.js';
import { Database, type DatabaseChunk } from '../../database/db.js';
import { readCodemapAsync, type Codemap } from '../../codemap/io.js';
import { resolveProviderContext } from '../../config/resolver.js';

/**
 * SearchContextManager handles lazy initialization and caching of:
 * - Database connections
 * - Codemap data
 * - Embedding providers
 * - Provider context
 *
 * This enables reuse across multiple queries instead of repeatedly
 * instantiating resources on every search.
 */
export interface SearchContext {
  db: Database;
  codemap: Codemap;
  provider: EmbeddingProvider;
  providerContext: ReturnType<typeof resolveProviderContext>;
  dbPath: string;
  chunkDir: string;
  codemapPath: string;
  codemapMtime: number;
  chunksCache: { chunks: DatabaseChunk[]; dbMtime: number } | null;
}

export class SearchContextManager {
  private context: SearchContext | null = null;
  private lastProvider: string | null = null;

  constructor(private basePath: string) {}

  /**
   * Get or create the search context
   * Caches and reuses context unless provider changes
   */
  async getContext(providerName: string = 'auto'): Promise<SearchContext> {
    // If provider changed, invalidate cached context
    if (this.context && this.lastProvider !== providerName) {
      this.cleanup();
    }

    // Return cached context if available
    if (this.context) {
      await this.refreshCodemapIfNeeded(this.context);
      return this.context;
    }

    // Initialize new context
    const dbPath = path.join(this.basePath, '.codevault/codevault.db');
    const chunkDir = path.join(this.basePath, '.codevault/chunks');
    const codemapPath = path.join(this.basePath, 'codevault.codemap.json');
    const codemapMtime = this.getFileMtime(codemapPath);

    // Validate database exists
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Database not found at ${dbPath}`);
    }

    // Initialize provider
    const providerContext = resolveProviderContext(this.basePath);
    const provider = createEmbeddingProvider(providerName, providerContext.embedding);

    if (provider.init) {
      await provider.init();
    }

    // Open database
    const db = new Database(dbPath);

    // Load codemap
    const codemap = await readCodemapAsync(codemapPath);

    this.context = {
      db,
      codemap,
      provider,
      providerContext,
      dbPath,
      chunkDir,
      codemapPath,
      codemapMtime,
      chunksCache: null
    };

    this.lastProvider = providerName;
    return this.context;
  }

  /**
   * Warm search state by initializing provider, codemap, and chunk cache
   */
  async warmup(providerName: string = 'auto'): Promise<SearchContext> {
    const context = await this.getContext(providerName);
    await this.refreshCodemapIfNeeded(context);
    this.getChunks(context);
    return context;
  }

  /**
   * Get chunks for the current provider/dimensions with caching
   */
  getChunks(context: SearchContext): DatabaseChunk[] {
    const dbMtime = this.getFileMtime(context.dbPath);
    const hasCachedChunks = Boolean(context.chunksCache);
    const cacheFresh =
      hasCachedChunks &&
      (dbMtime === 0 || (context.chunksCache?.dbMtime ?? 0) === dbMtime);

    if (hasCachedChunks && cacheFresh && context.chunksCache) {
      return context.chunksCache.chunks;
    }

    const chunks = context.db.getChunks(
      context.provider.getName(),
      context.provider.getDimensions()
    );

    context.chunksCache = { chunks, dbMtime };
    return chunks;
  }

  /**
   * Get cached context without initialization
   * Returns null if not initialized
   */
  getCached(): SearchContext | null {
    return this.context;
  }

  /**
   * Refresh codemap if underlying file changed
   */
  private async refreshCodemapIfNeeded(context: SearchContext): Promise<void> {
    const currentMtime = this.getFileMtime(context.codemapPath);
    if (currentMtime > 0 && currentMtime > context.codemapMtime) {
      context.codemap = await readCodemapAsync(context.codemapPath);
      context.codemapMtime = currentMtime;
    }
  }

  /**
   * Safely fetch file mtime, returning 0 if missing
   */
  private getFileMtime(filePath: string): number {
    try {
      const stats = fs.statSync(filePath);
      return stats.mtimeMs;
    } catch {
      return 0;
    }
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    if (this.context?.db) {
      try {
        this.context.db.close();
      } catch {
        // Ignore close errors
      }
    }
    if (this.context) {
      this.context.chunksCache = null;
    }
    this.context = null;
    this.lastProvider = null;
  }

  /**
   * Check if context is initialized
   */
  isInitialized(): boolean {
    return this.context !== null;
  }
}
