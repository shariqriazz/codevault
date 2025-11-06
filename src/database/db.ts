import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

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

export class Database {
  private db: sqlite3.Database;
  private run: (sql: string, params?: any[]) => Promise<void>;
  private get: <T = any>(sql: string, params?: any[]) => Promise<T | undefined>;
  private all: <T = any>(sql: string, params?: any[]) => Promise<T[]>;

  constructor(dbPath: string) {
    this.db = new sqlite3.Database(dbPath);
    this.run = promisify(this.db.run.bind(this.db));
    this.get = promisify(this.db.get.bind(this.db));
    this.all = promisify(this.db.all.bind(this.db));
  }

  async initialize(dimensions: number): Promise<void> {
    await this.run(`
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

    await this.run(`
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

    await this.run(`
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
      await this.run(sql);
    }
  }

  async insertChunk(params: {
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
    variables_used: any[];
    context_info: any;
  }): Promise<void> {
    await this.run(`
      INSERT OR REPLACE INTO code_chunks
      (id, file_path, symbol, sha, lang, chunk_type, embedding, embedding_provider, embedding_dimensions,
       codevault_tags, codevault_intent, codevault_description, doc_comments, variables_used, context_info, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
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
    ]);
  }

  async deleteChunks(chunkIds: string[]): Promise<void> {
    if (!Array.isArray(chunkIds) || chunkIds.length === 0) {
      return;
    }

    const placeholders = chunkIds.map(() => '?').join(', ');
    await this.run(`DELETE FROM code_chunks WHERE id IN (${placeholders})`, chunkIds);
  }

  async getChunks(providerName: string, dimensions: number): Promise<DatabaseChunk[]> {
    return await this.all<DatabaseChunk>(`
      SELECT id, file_path, symbol, sha, lang, chunk_type, embedding,
             codevault_tags, codevault_intent, codevault_description,
             embedding_provider, embedding_dimensions
      FROM code_chunks
      WHERE embedding_provider = ? AND embedding_dimensions = ?
      ORDER BY created_at DESC
    `, [providerName, dimensions]);
  }

  async getExistingDimensions(): Promise<Array<{ embedding_provider: string; embedding_dimensions: number }>> {
    return await this.all(`
      SELECT DISTINCT embedding_provider, embedding_dimensions
      FROM code_chunks
      LIMIT 10
    `);
  }

  async recordIntention(normalizedQuery: string, originalQuery: string, targetSha: string, confidence: number): Promise<void> {
    const existing = await this.get<{ id: number; usage_count: number }>(`
      SELECT id, usage_count FROM intention_cache 
      WHERE query_normalized = ? AND target_sha = ?
    `, [normalizedQuery, targetSha]);

    if (existing) {
      await this.run(`
        UPDATE intention_cache 
        SET usage_count = usage_count + 1, 
            confidence = ?, 
            last_used = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [confidence, existing.id]);
    } else {
      await this.run(`
        INSERT INTO intention_cache 
        (query_normalized, original_query, target_sha, confidence)
        VALUES (?, ?, ?, ?)
      `, [normalizedQuery, originalQuery, targetSha, confidence]);
    }
  }

  async searchByIntention(normalizedQuery: string): Promise<any> {
    return await this.get(`
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
    `, [normalizedQuery]);
  }

  async recordQueryPattern(pattern: string): Promise<void> {
    const existing = await this.get<{ id: number; frequency: number }>(`
      SELECT id, frequency FROM query_patterns WHERE pattern = ?
    `, [pattern]);

    if (existing) {
      await this.run(`
        UPDATE query_patterns 
        SET frequency = frequency + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [existing.id]);
    } else {
      await this.run(`
        INSERT INTO query_patterns (pattern) VALUES (?)
      `, [pattern]);
    }
  }

  async getOverviewChunks(limit: number): Promise<Array<{ id: string; file_path: string; symbol: string; sha: string; lang: string }>> {
    return await this.all(`
      SELECT id, file_path, symbol, sha, lang
      FROM code_chunks
      ORDER BY file_path, symbol
      LIMIT ?
    `, [limit]);
  }

  /**
   * Begin a database transaction
   */
  async beginTransaction(): Promise<void> {
    await this.run('BEGIN TRANSACTION');
  }

  /**
   * Commit the current transaction
   */
  async commit(): Promise<void> {
    await this.run('COMMIT');
  }

  /**
   * Rollback the current transaction
   */
  async rollback(): Promise<void> {
    await this.run('ROLLBACK');
  }

  /**
   * Execute a function within a transaction
   * Automatically commits on success and rolls back on error
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.beginTransaction();
    try {
      const result = await fn();
      await this.commit();
      return result;
    } catch (error) {
      await this.rollback();
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}

export async function initDatabase(dimensions: number, basePath = '.'): Promise<void> {
  const dbPath = path.join(path.resolve(basePath), '.codevault', 'codevault.db');
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(dbPath);
  await db.initialize(dimensions);
  db.close();
}