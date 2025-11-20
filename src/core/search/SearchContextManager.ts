import fs from 'fs';
import path from 'path';
import { createEmbeddingProvider, type EmbeddingProvider } from '../../providers/index.js';
import { Database } from '../../database/db.js';
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
      return this.context;
    }

    // Initialize new context
    const dbPath = path.join(this.basePath, '.codevault/codevault.db');
    const chunkDir = path.join(this.basePath, '.codevault/chunks');
    const codemapPath = path.join(this.basePath, 'codevault.codemap.json');

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
      codemapPath
    };

    this.lastProvider = providerName;
    return this.context;
  }

  /**
   * Get cached context without initialization
   * Returns null if not initialized
   */
  getCached(): SearchContext | null {
    return this.context;
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    if (this.context?.db) {
      try {
        this.context.db.close();
      } catch (error) {
        // Ignore close errors
      }
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
