import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { log } from '../utils/logger.js';

export interface DatabaseChunk {
  id: string;
  file_path: string;
  symbol: string;
  sha: string;
  lang: string;
  chunk_type: string;
  embedding: Buffer;
  embedding_provider: string;
  embedding_dimensions: number;
  codevault_tags?: string;
  codevault_intent?: string;
  codevault_description?: string;
  doc_comments?: string;
  variables_used?: string;
  context_info?: string;
  created_at?: string;
  updated_at?: string;
}

export class CodeVaultDatabase {
  private db: Database.Database;
  private insertChunkStmt!: Database.Statement;
  private getChunksStmt!: Database.Statement;
  private deleteChunksStmt: Database.Statement | null = null;
  private initialized = false;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');

    // Optimize for performance
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -64000'); // 64MB cache
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('mmap_size = 30000000000'); // 30GB mmap

    // Check if tables exist and create if needed
    this.ensureTablesExist();
  }

  /**
   * Ensure database tables exist and prepare statements
   */
  private ensureTablesExist(): void {
    // Create tables if they don't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS code_chunks (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        symbol TEXT NOT NULL,
        sha TEXT NOT NULL,
        lang TEXT NOT NULL,
        chunk_type TEXT DEFAULT 'function',
        embedding BLOB,
        embedding_provider TEXT,
        embedding_dimensions INTEGER,
        codevault_tags TEXT,
        codevault_intent TEXT,
        codevault_description TEXT,
        doc_comments TEXT,
        variables_used TEXT,
        context_info TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Prepare statements after tables exist
    this.insertChunkStmt = this.db.prepare(`
      INSERT OR REPLACE INTO code_chunks
      (id, file_path, symbol, sha, lang, chunk_type, embedding, embedding_provider, embedding_dimensions,
       codevault_tags, codevault_intent, codevault_description, doc_comments, variables_used, context_info, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    this.getChunksStmt = this.db.prepare(`
      SELECT id, file_path, symbol, sha, lang, chunk_type, embedding,
             codevault_tags, codevault_intent, codevault_description,
             embedding_provider, embedding_dimensions
      FROM code_chunks
      WHERE embedding_provider = ? AND embedding_dimensions = ?
      ORDER BY created_at DESC
    `);
  }

  async initialize(dimensions: number): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS code_chunks (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        symbol TEXT NOT NULL,
        sha TEXT NOT NULL,
        lang TEXT NOT NULL,
        chunk_type TEXT DEFAULT 'function',
        embedding BLOB,
        embedding_provider TEXT,
        embedding_dimensions INTEGER,
        codevault_tags TEXT,
        codevault_intent TEXT,
        codevault_description TEXT,
        doc_comments TEXT,
        variables_used TEXT,
        context_info TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS intention_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query_normalized TEXT NOT NULL,
        original_query TEXT NOT NULL,
        target_sha TEXT NOT NULL,
        confidence REAL DEFAULT 1.0,
        usage_count INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_used DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS query_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern TEXT NOT NULL UNIQUE,
        frequency INTEGER DEFAULT 1,
        typical_results TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_file_path ON code_chunks(file_path)',
      'CREATE INDEX IF NOT EXISTS idx_symbol ON code_chunks(symbol)',
      'CREATE INDEX IF NOT EXISTS idx_lang ON code_chunks(lang)',
      'CREATE INDEX IF NOT EXISTS idx_provider ON code_chunks(embedding_provider)',
      'CREATE INDEX IF NOT EXISTS idx_chunk_type ON code_chunks(chunk_type)',
      'CREATE INDEX IF NOT EXISTS idx_codevault_tags ON code_chunks(codevault_tags)',
      'CREATE INDEX IF NOT EXISTS idx_codevault_intent ON code_chunks(codevault_intent)',
      'CREATE INDEX IF NOT EXISTS idx_lang_provider ON code_chunks(lang, embedding_provider, embedding_dimensions)',
      'CREATE INDEX IF NOT EXISTS idx_query_normalized ON intention_cache(query_normalized)',
      'CREATE INDEX IF NOT EXISTS idx_target_sha ON intention_cache(target_sha)',
      'CREATE INDEX IF NOT EXISTS idx_usage_count ON intention_cache(usage_count DESC)',
      'CREATE INDEX IF NOT EXISTS idx_pattern_frequency ON query_patterns(frequency DESC)'
    ];

    for (const sql of indexes) {
      this.db.exec(sql);
    }

    // Prepare statements after tables are created
    if (!this.initialized) {
      this.insertChunkStmt = this.db.prepare(`
        INSERT OR REPLACE INTO code_chunks
        (id, file_path, symbol, sha, lang, chunk_type, embedding, embedding_provider, embedding_dimensions,
         codevault_tags, codevault_intent, codevault_description, doc_comments, variables_used, context_info, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      this.getChunksStmt = this.db.prepare(`
        SELECT id, file_path, symbol, sha, lang, chunk_type, embedding,
               codevault_tags, codevault_intent, codevault_description,
               embedding_provider, embedding_dimensions
        FROM code_chunks
        WHERE embedding_provider = ? AND embedding_dimensions = ?
        ORDER BY created_at DESC
      `);

      this.initialized = true;
    }
  }

  insertChunk(params: {
    id: string;
    file_path: string;
    symbol: string;
    sha: string;
    lang: string;
    chunk_type: string;
    embedding: number[];
    embedding_provider: string;
    embedding_dimensions: number;
    codevault_tags: string[];
    codevault_intent: string | null;
    codevault_description: string | null;
    doc_comments: string | null;
    variables_used: string[];
    context_info: Record<string, unknown>;
  }): void {
    try {
      this.insertChunkStmt.run(
        params.id,
        params.file_path,
        params.symbol,
        params.sha,
        params.lang,
        params.chunk_type,
        Buffer.from(JSON.stringify(params.embedding)),
        params.embedding_provider,
        params.embedding_dimensions,
        JSON.stringify(params.codevault_tags),
        params.codevault_intent,
        params.codevault_description,
        params.doc_comments,
        JSON.stringify(params.variables_used),
        JSON.stringify(params.context_info)
      );
    } catch (error) {
      log.error('Failed to insert chunk', error, { chunkId: params.id });
      throw error;
    }
  }

  async deleteChunks(chunkIds: string[]): Promise<void> {
    if (!Array.isArray(chunkIds) || chunkIds.length === 0) {
      return;
    }

    try {
      const placeholders = chunkIds.map(() => '?').join(', ');
      if (!this.deleteChunksStmt) {
        this.deleteChunksStmt = this.db.prepare(`DELETE FROM code_chunks WHERE id IN (${placeholders})`);
      }
      this.deleteChunksStmt.run(...chunkIds);
    } catch (error) {
      log.error('Failed to delete chunks', error, { count: chunkIds.length });
      throw error;
    }
  }

  async getChunks(providerName: string, dimensions: number): Promise<DatabaseChunk[]> {
    try {
      return this.getChunksStmt.all(providerName, dimensions) as DatabaseChunk[];
    } catch (error) {
      log.error('Failed to get chunks', error, { provider: providerName, dimensions });
      throw error;
    }
  }

  async getExistingDimensions(): Promise<Array<{ embedding_provider: string; embedding_dimensions: number }>> {
    try {
      const stmt = this.db.prepare(`
        SELECT DISTINCT embedding_provider, embedding_dimensions
        FROM code_chunks
        LIMIT 10
      `);
      return stmt.all() as Array<{ embedding_provider: string; embedding_dimensions: number }>;
    } catch (error) {
      log.error('Failed to get existing dimensions', error);
      throw error;
    }
  }

  async recordIntention(normalizedQuery: string, originalQuery: string, targetSha: string, confidence: number): Promise<void> {
    try {
      const existing = this.db.prepare(`
        SELECT id, usage_count FROM intention_cache
        WHERE query_normalized = ? AND target_sha = ?
      `).get(normalizedQuery, targetSha) as { id: number; usage_count: number } | undefined;

      if (existing) {
        this.db.prepare(`
          UPDATE intention_cache
          SET usage_count = usage_count + 1,
              confidence = ?,
              last_used = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(confidence, existing.id);
      } else {
        this.db.prepare(`
          INSERT INTO intention_cache
          (query_normalized, original_query, target_sha, confidence)
          VALUES (?, ?, ?, ?)
        `).run(normalizedQuery, originalQuery, targetSha, confidence);
      }
    } catch (error) {
      log.error('Failed to record intention', error, { query: normalizedQuery });
      throw error;
    }
  }

  async searchByIntention(normalizedQuery: string): Promise<any> {
    try {
      return this.db.prepare(`
        SELECT
          i.target_sha,
          i.confidence,
          i.usage_count,
          i.original_query,
          c.file_path,
          c.symbol,
          c.lang,
          c.chunk_type
        FROM intention_cache i
        LEFT JOIN code_chunks c ON i.target_sha = c.sha
        WHERE i.query_normalized = ?
        ORDER BY i.confidence DESC, i.usage_count DESC
        LIMIT 1
      `).get(normalizedQuery);
    } catch (error) {
      log.error('Failed to search by intention', error, { query: normalizedQuery });
      return null;
    }
  }

  async recordQueryPattern(pattern: string): Promise<void> {
    try {
      const existing = this.db.prepare(`
        SELECT id, frequency FROM query_patterns WHERE pattern = ?
      `).get(pattern) as { id: number; frequency: number } | undefined;

      if (existing) {
        this.db.prepare(`
          UPDATE query_patterns
          SET frequency = frequency + 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(existing.id);
      } else {
        this.db.prepare(`
          INSERT INTO query_patterns (pattern) VALUES (?)
        `).run(pattern);
      }
    } catch (error) {
      log.error('Failed to record query pattern', error, { pattern });
      throw error;
    }
  }

  async getOverviewChunks(limit: number): Promise<Array<{ id: string; file_path: string; symbol: string; sha: string; lang: string }>> {
    try {
      return this.db.prepare(`
        SELECT id, file_path, symbol, sha, lang
        FROM code_chunks
        ORDER BY file_path, symbol
        LIMIT ?
      `).all(limit) as Array<{ id: string; file_path: string; symbol: string; sha: string; lang: string }>;
    } catch (error) {
      log.error('Failed to get overview chunks', error, { limit });
      throw error;
    }
  }

  /**
   * Begin a database transaction
   */
  async beginTransaction(): Promise<void> {
    this.db.prepare('BEGIN TRANSACTION').run();
  }

  /**
   * Commit the current transaction
   */
  async commit(): Promise<void> {
    this.db.prepare('COMMIT').run();
  }

  /**
   * Rollback the current transaction
   */
  async rollback(): Promise<void> {
    this.db.prepare('ROLLBACK').run();
  }

  /**
   * Execute a function within a transaction
   * Automatically commits on success and rolls back on error
   *
   * Note: better-sqlite3 transactions MUST be synchronous
   * If you need async operations, use beginTransaction/commit/rollback manually
   */
  async transaction<T>(fn: () => Promise<T> | T): Promise<T> {
    try {
      // Start transaction
      this.db.prepare('BEGIN TRANSACTION').run();

      // Execute function (can be async)
      const result = await fn();

      // Commit if successful
      this.db.prepare('COMMIT').run();

      return result;
    } catch (error) {
      // Rollback on error
      try {
        this.db.prepare('ROLLBACK').run();
      } catch (rollbackError) {
        log.error('Failed to rollback transaction', rollbackError);
      }

      log.error('Transaction failed and was rolled back', error);
      throw error;
    }
  }

  /**
   * Close the database connection
   * IMPORTANT: Always call this when done to avoid resource leaks
   */
  close(): void {
    try {
      this.db.close();
      log.debug('Database connection closed');
    } catch (error) {
      log.error('Failed to close database', error);
    }
  }

  /**
   * Get database statistics for monitoring
   */
  getStats(): {
    isOpen: boolean;
    inTransaction: boolean;
    readonly: boolean;
    memory: boolean;
  } {
    return {
      isOpen: this.db.open,
      inTransaction: this.db.inTransaction,
      readonly: this.db.readonly,
      memory: this.db.memory,
    };
  }
}

export async function initDatabase(dimensions: number, basePath = '.'): Promise<void> {
  const dbPath = path.join(path.resolve(basePath), '.codevault', 'codevault.db');
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new CodeVaultDatabase(dbPath);
  await db.initialize(dimensions);
  db.close();
}

// Export as Database for backward compatibility
export { CodeVaultDatabase as Database };
