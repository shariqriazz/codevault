import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { log } from '../utils/logger.js';

const DB_SCHEMA_VERSION = 2;

const DB_PRAGMA_DEFAULTS = {
  cacheSize: ((): number => {
    const parsed = Number(process.env.CODEVAULT_DB_CACHE_SIZE ?? '-16000'); // ~16MB
    return Number.isFinite(parsed) ? parsed : -16000;
  })(),
  mmapSize: ((): number => {
    const parsed = Number(process.env.CODEVAULT_DB_MMAP_SIZE ?? '268435456'); // 256MB
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 268435456;
  })(),
  tempStore: ((): 'MEMORY' | 'FILE' => {
    const raw = (process.env.CODEVAULT_DB_TEMP_STORE || 'MEMORY').toString().toUpperCase();
    return raw === 'FILE' ? 'FILE' : 'MEMORY';
  })()
};

function encodeEmbedding(embedding: ArrayLike<number>): Buffer {
  const buffer = Buffer.allocUnsafe(embedding.length * 4);
  for (let i = 0; i < embedding.length; i++) {
    buffer.writeFloatLE(Number(embedding[i]) || 0, i * 4);
  }
  return buffer;
}

function tryParseJsonEmbedding(buffer: Buffer): Float32Array | null {
  if (!buffer || buffer.length === 0) {
    return null;
  }

  // Fast reject for binary buffers
  const firstByte = buffer[0];
  const isLikelyJson =
    firstByte === 91 || // '['
    firstByte === 123 || // '{'
    firstByte === 45 || // '-'
    (firstByte >= 48 && firstByte <= 57); // digits

  if (!isLikelyJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(buffer.toString('utf8'));
    if (!Array.isArray(parsed)) {
      return null;
    }

    const vector = new Float32Array(parsed.length);
    for (let i = 0; i < parsed.length; i++) {
      vector[i] = Number(parsed[i]) || 0;
    }
    return vector;
  } catch {
    return null;
  }
}

export function decodeEmbedding(buffer: Buffer, dimensions?: number): Float32Array {
  const jsonEmbedding = tryParseJsonEmbedding(buffer);
  if (jsonEmbedding) {
    return jsonEmbedding;
  }

  if (!buffer || buffer.length < 4 || buffer.length % 4 !== 0) {
    return new Float32Array();
  }

  const length = buffer.length / 4;
  const targetLength =
    typeof dimensions === 'number' && dimensions > 0
      ? Math.min(dimensions, length)
      : length;

  return new Float32Array(buffer.buffer, buffer.byteOffset, targetLength);
}

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

export interface InsertChunkParams {
  id: string;
  file_path: string;
  symbol: string;
  sha: string;
  lang: string;
  chunk_type: string;
  embedding: ArrayLike<number>;
  embedding_provider: string;
  embedding_dimensions: number;
  codevault_tags: string[];
  codevault_intent: string | null;
  codevault_description: string | null;
  doc_comments: string | null;
  variables_used: string[];
  context_info: Record<string, unknown>;
}

/**
 * Thin wrapper around better-sqlite3 with prepared statements tuned for CodeVault.
 *
 * Provides chunk CRUD, intention tracking, query pattern stats, and ensures schema
 * creation/migrations. Call `close()` when finished to avoid leaking file handles.
 */
export class CodeVaultDatabase {
  private db: Database.Database;
  private insertChunkStmt!: Database.Statement;
  private getChunksStmt!: Database.Statement;
  private deleteChunksStmt: Database.Statement | null = null;
  private insertManyStmt: ((chunks: InsertChunkParams[]) => void) | null = null;
  // Prepared statements for orphan cleanup
  private getAllPathsStmt: Database.Statement | null = null;
  private deleteByPathStmt: Database.Statement | null = null;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');

    // Optimize for performance
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma(`cache_size = ${DB_PRAGMA_DEFAULTS.cacheSize}`);
    this.db.pragma(`temp_store = ${DB_PRAGMA_DEFAULTS.tempStore}`);
    this.db.pragma(`mmap_size = ${DB_PRAGMA_DEFAULTS.mmapSize}`);

    // Check if tables exist and create if needed
    this.ensureTablesExist();
    this.migrateLegacyEmbeddings();
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

    this.getAllPathsStmt = this.db.prepare(`
      SELECT DISTINCT file_path FROM code_chunks ORDER BY file_path
    `);

    this.deleteByPathStmt = this.db.prepare(`
      DELETE FROM code_chunks WHERE file_path = ?
    `);
  }

  /**
   * Migrate legacy JSON embeddings to binary Float32 buffers
   */
  private migrateLegacyEmbeddings(): void {
    try {
      const userVersion = this.db.pragma('user_version', { simple: true }) as number;
      if (userVersion >= DB_SCHEMA_VERSION) {
        return;
      }

      const selectStmt = this.db.prepare(`
        SELECT id, embedding, embedding_dimensions
        FROM code_chunks
      `);
      const updateStmt = this.db.prepare(`
        UPDATE code_chunks
        SET embedding = ?
        WHERE id = ?
      `);

      const migrate = this.db.transaction(() => {
        let converted = 0;
        for (const row of selectStmt.iterate() as Iterable<{
          id: string;
          embedding: Buffer;
          embedding_dimensions: number;
        }>) {
          const parsed = tryParseJsonEmbedding(row.embedding);
          if (!parsed) continue;

          const encoded = encodeEmbedding(parsed);
          updateStmt.run(encoded, row.id);
          converted++;
        }

        if (converted > 0) {
          log.info('Migrated legacy JSON embeddings to binary', { converted });
        } else {
          log.debug('No legacy embeddings found for migration');
        }
      });

      migrate();
      this.db.pragma(`user_version = ${DB_SCHEMA_VERSION}`);
    } catch (error) {
      log.error('Failed to migrate embeddings to binary', error);
      throw error;
    }
  }

  insertChunk(params: InsertChunkParams): void {
    try {
      this.insertChunkStmt.run(
        params.id,
        params.file_path,
        params.symbol,
        params.sha,
        params.lang,
        params.chunk_type,
        encodeEmbedding(params.embedding),
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

  insertChunks(chunks: InsertChunkParams[]): void {
    if (!Array.isArray(chunks) || chunks.length === 0) {
      return;
    }

    if (!this.insertManyStmt) {
      const insertMany = this.db.transaction((batch: typeof chunks) => {
        for (const chunk of batch) {
          this.insertChunkStmt.run(
            chunk.id,
            chunk.file_path,
            chunk.symbol,
            chunk.sha,
            chunk.lang,
            chunk.chunk_type,
            encodeEmbedding(chunk.embedding),
            chunk.embedding_provider,
            chunk.embedding_dimensions,
            JSON.stringify(chunk.codevault_tags),
            chunk.codevault_intent,
            chunk.codevault_description,
            chunk.doc_comments,
            JSON.stringify(chunk.variables_used),
            JSON.stringify(chunk.context_info)
          );
        }
      });

      this.insertManyStmt = insertMany;
    }

    try {
      this.insertManyStmt(chunks);
    } catch (error) {
      log.error('Failed to insert chunk batch', error, { count: chunks.length });
      throw error;
    }
  }

  private buildDeleteStatement(count: number): Database.Statement {
    const placeholders = Array.from({ length: count }, () => '?').join(', ');
    return this.db.prepare(`DELETE FROM code_chunks WHERE id IN (${placeholders})`);
  }

  async deleteChunks(chunkIds: string[]): Promise<void> {
    if (!Array.isArray(chunkIds) || chunkIds.length === 0) {
      return;
    }

    try {
      // Build a fresh statement per invocation to avoid parameter count mismatches
      const stmt = this.buildDeleteStatement(chunkIds.length);
      stmt.run(...chunkIds);
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
  /**
   * Execute a synchronous function within a database transaction.
   * better-sqlite3 transactions must be synchronous; do async work before/after.
   */
  transaction<T>(fn: () => T): T {
    const wrapped = this.db.transaction(() => {
      const result = fn();
      if (result && typeof (result as any).then === 'function') {
        throw new Error('better-sqlite3 transactions must be synchronous; avoid returning a Promise.');
      }
      return result;
    });
    return wrapped();
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

  getAllFilePaths(): string[] {
    if (!this.getAllPathsStmt) {
      return [];
    }
    const rows = this.getAllPathsStmt.all();
    return Array.isArray(rows) ? rows.map((row: any): string => row.file_path as string).filter(Boolean) : [];
  }

  deleteChunksByFilePath(filePath: string): void {
    if (!this.deleteByPathStmt) {
      return;
    }
    this.deleteByPathStmt.run(filePath);
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
