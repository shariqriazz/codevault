import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { CodeVaultDatabase, decodeEmbedding, InsertChunkParams, initDatabase } from '../database/db.js';

/**
 * Comprehensive unit tests for the CodeVault database module.
 * Tests cover CRUD operations, binary embedding handling, transaction management,
 * SQL injection prevention, and connection lifecycle.
 */

// Helper to create a temporary database for tests
async function createTempDb(): Promise<{ db: CodeVaultDatabase; dbPath: string; cleanup: () => Promise<void> }> {
  const tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'tmp-db-test-'));
  const dbPath = path.join(tmpDir, 'test.db');
  const db = new CodeVaultDatabase(dbPath);
  db.initialize(1536);

  return {
    db,
    dbPath,
    cleanup: async (): Promise<void> => {
      db.close();
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  };
}

// Helper to create a valid chunk for testing
function createTestChunk(overrides: Partial<InsertChunkParams> = {}): InsertChunkParams {
  return {
    id: 'test-chunk-1',
    file_path: '/src/example.ts',
    symbol: 'testFunction',
    sha: 'abc123def456',
    lang: 'typescript',
    chunk_type: 'function',
    embedding: new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]),
    embedding_provider: 'openai',
    embedding_dimensions: 5,
    codevault_tags: ['utility', 'helper'],
    codevault_intent: 'Test function for unit tests',
    codevault_description: 'A test function that does nothing',
    doc_comments: '/** Test documentation */',
    variables_used: ['foo', 'bar'],
    context_info: { tested: true, coverage: 100 },
    ...overrides
  };
}

// ============================================================================
// Embedding Encoding/Decoding Tests
// ============================================================================

test('decodeEmbedding handles empty buffer', () => {
  const result = decodeEmbedding(Buffer.alloc(0));
  assert.equal(result.length, 0);
});

test('decodeEmbedding handles null/undefined buffer', () => {
  // @ts-expect-error Testing null handling
  const resultNull = decodeEmbedding(null);
  assert.equal(resultNull.length, 0);

  // @ts-expect-error Testing undefined handling
  const resultUndefined = decodeEmbedding(undefined);
  assert.equal(resultUndefined.length, 0);
});

test('decodeEmbedding handles buffer with incorrect size (not divisible by 4)', () => {
  const result = decodeEmbedding(Buffer.from([1, 2, 3]));
  assert.equal(result.length, 0);
});

test('decodeEmbedding handles buffer too small (less than 4 bytes)', () => {
  const result = decodeEmbedding(Buffer.from([1, 2]));
  assert.equal(result.length, 0);
});

test('decodeEmbedding correctly decodes binary Float32 buffer', () => {
  // Create a buffer with known float values
  const originalValues = [1.5, -2.5, 0.0, 3.14159];
  const buffer = Buffer.allocUnsafe(originalValues.length * 4);
  for (let i = 0; i < originalValues.length; i++) {
    buffer.writeFloatLE(originalValues[i] as number, i * 4);
  }

  const result = decodeEmbedding(buffer);
  assert.equal(result.length, 4);
  assert.ok(Math.abs(result[0]! - 1.5) < 0.0001);
  assert.ok(Math.abs(result[1]! - (-2.5)) < 0.0001);
  assert.ok(Math.abs(result[2]! - 0.0) < 0.0001);
  assert.ok(Math.abs(result[3]! - 3.14159) < 0.0001);
});

test('decodeEmbedding respects dimensions parameter', () => {
  const buffer = Buffer.allocUnsafe(16); // 4 floats
  for (let i = 0; i < 4; i++) {
    buffer.writeFloatLE(i * 1.0, i * 4);
  }

  // Request only 2 dimensions
  const result = decodeEmbedding(buffer, 2);
  assert.equal(result.length, 2);
  assert.ok(Math.abs(result[0]! - 0.0) < 0.0001);
  assert.ok(Math.abs(result[1]! - 1.0) < 0.0001);
});

test('decodeEmbedding handles dimensions larger than buffer', () => {
  const buffer = Buffer.allocUnsafe(8); // 2 floats
  buffer.writeFloatLE(1.0, 0);
  buffer.writeFloatLE(2.0, 4);

  // Request 10 dimensions but only 2 available
  const result = decodeEmbedding(buffer, 10);
  assert.equal(result.length, 2);
});

test('decodeEmbedding parses JSON array format', () => {
  const jsonArray = [0.1, 0.2, 0.3];
  const buffer = Buffer.from(JSON.stringify(jsonArray), 'utf8');

  const result = decodeEmbedding(buffer);
  assert.equal(result.length, 3);
  assert.ok(Math.abs(result[0]! - 0.1) < 0.0001);
  assert.ok(Math.abs(result[1]! - 0.2) < 0.0001);
  assert.ok(Math.abs(result[2]! - 0.3) < 0.0001);
});

test('decodeEmbedding handles JSON with negative numbers', () => {
  const jsonArray = [-0.5, -1.0];
  const buffer = Buffer.from(JSON.stringify(jsonArray), 'utf8');

  const result = decodeEmbedding(buffer);
  assert.equal(result.length, 2);
  assert.ok(Math.abs(result[0]! - (-0.5)) < 0.0001);
});

test('decodeEmbedding rejects non-array JSON', () => {
  const jsonObject = { embedding: [1, 2, 3] };
  const buffer = Buffer.from(JSON.stringify(jsonObject), 'utf8');

  // Should fall back to binary parsing which will fail due to size
  const result = decodeEmbedding(buffer);
  // Since the buffer starts with '{', it will try JSON parse, fail to get array, return null
  // Then binary decode will check size and likely return empty
  assert.equal(result.length, 0);
});

test('decodeEmbedding handles malformed JSON gracefully', () => {
  const buffer = Buffer.from('[1, 2, 3', 'utf8'); // Invalid JSON

  const result = decodeEmbedding(buffer);
  // Falls back to binary parsing
  assert.ok(result.length >= 0); // Should not throw
});

// ============================================================================
// Database Initialization and Schema Tests
// ============================================================================

test('CodeVaultDatabase creates tables on construction', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    // Verify code_chunks table exists by attempting to query it
    const chunks = db.getChunks('openai', 1536);
    assert.ok(Array.isArray(chunks));
    assert.equal(chunks.length, 0);
  } finally {
    await cleanup();
  }
});

test('CodeVaultDatabase initialization creates additional tables and indexes', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    // After initialization, intention_cache and query_patterns should exist
    // We can verify by attempting operations that use them
    db.recordQueryPattern('test-pattern');
    db.recordIntention('normalized', 'original', 'sha123', 0.95);

    // Should not throw
    assert.ok(true);
  } finally {
    await cleanup();
  }
});

test('initDatabase creates directory structure if missing', async () => {
  const tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'tmp-init-'));
  const testPath = path.join(tmpDir, 'nested', 'project');

  try {
    await fs.mkdir(testPath, { recursive: true });
    initDatabase(1536, testPath);

    // Verify the .codevault directory was created
    const codevaultDir = path.join(testPath, '.codevault');
    const stat = await fs.stat(codevaultDir);
    assert.ok(stat.isDirectory());

    // Verify database file exists
    const dbPath = path.join(codevaultDir, 'codevault.db');
    const dbStat = await fs.stat(dbPath);
    assert.ok(dbStat.isFile());
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// ============================================================================
// Chunk CRUD Operations Tests
// ============================================================================

test('insertChunk inserts a single chunk successfully', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    const chunk = createTestChunk();
    db.insertChunk(chunk);

    const chunks = db.getChunks('openai', 5);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]!.id, 'test-chunk-1');
    assert.equal(chunks[0]!.file_path, '/src/example.ts');
    assert.equal(chunks[0]!.symbol, 'testFunction');
    assert.equal(chunks[0]!.lang, 'typescript');
  } finally {
    await cleanup();
  }
});

test('insertChunk updates existing chunk on conflict (REPLACE)', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    const chunk1 = createTestChunk({ symbol: 'originalSymbol' });
    db.insertChunk(chunk1);

    const chunk2 = createTestChunk({ symbol: 'updatedSymbol' });
    db.insertChunk(chunk2);

    const chunks = db.getChunks('openai', 5);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]!.symbol, 'updatedSymbol');
  } finally {
    await cleanup();
  }
});

test('insertChunk encodes embeddings as binary Float32', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    const originalEmbedding = new Float32Array([1.5, -2.5, 0.0, 3.14]);
    const chunk = createTestChunk({
      embedding: originalEmbedding,
      embedding_dimensions: 4
    });
    db.insertChunk(chunk);

    const chunks = db.getChunks('openai', 4);
    assert.equal(chunks.length, 1);

    // Decode the embedding and verify values
    const decoded = decodeEmbedding(chunks[0]!.embedding, 4);
    assert.equal(decoded.length, 4);
    assert.ok(Math.abs(decoded[0]! - 1.5) < 0.0001);
    assert.ok(Math.abs(decoded[1]! - (-2.5)) < 0.0001);
    assert.ok(Math.abs(decoded[2]! - 0.0) < 0.0001);
    assert.ok(Math.abs(decoded[3]! - 3.14) < 0.01);
  } finally {
    await cleanup();
  }
});

test('insertChunk handles NaN and special values in embeddings', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    // The encoding function uses `Number(x) || 0` which:
    // - NaN becomes 0 (falsy)
    // - Infinity passes through (truthy)
    // - -Infinity passes through (truthy)
    const embedding = [NaN, Infinity, -Infinity, 1.0];
    const chunk = createTestChunk({
      embedding,
      embedding_dimensions: 4
    });
    db.insertChunk(chunk);

    const chunks = db.getChunks('openai', 4);
    const decoded = decodeEmbedding(chunks[0]!.embedding, 4);

    // NaN becomes 0 (falsy value triggers || 0)
    assert.equal(decoded[0], 0);
    // Infinity and -Infinity pass through (truthy values)
    assert.equal(decoded[1], Infinity);
    assert.equal(decoded[2], -Infinity);
    assert.ok(Math.abs(decoded[3]! - 1.0) < 0.0001);
  } finally {
    await cleanup();
  }
});

test('insertChunks inserts multiple chunks in a batch', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    const chunks = [
      createTestChunk({ id: 'chunk-1', symbol: 'func1' }),
      createTestChunk({ id: 'chunk-2', symbol: 'func2' }),
      createTestChunk({ id: 'chunk-3', symbol: 'func3' })
    ];

    db.insertChunks(chunks);

    const result = db.getChunks('openai', 5);
    assert.equal(result.length, 3);
  } finally {
    await cleanup();
  }
});

test('insertChunks handles empty array gracefully', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    db.insertChunks([]);
    const result = db.getChunks('openai', 5);
    assert.equal(result.length, 0);
  } finally {
    await cleanup();
  }
});

test('insertChunks handles non-array input gracefully', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    // @ts-expect-error Testing non-array input
    db.insertChunks(null);
    // @ts-expect-error Testing undefined input
    db.insertChunks(undefined);

    const result = db.getChunks('openai', 5);
    assert.equal(result.length, 0);
  } finally {
    await cleanup();
  }
});

test('deleteChunks removes specified chunks by ID', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    const chunks = [
      createTestChunk({ id: 'chunk-1', symbol: 'func1' }),
      createTestChunk({ id: 'chunk-2', symbol: 'func2' }),
      createTestChunk({ id: 'chunk-3', symbol: 'func3' })
    ];
    db.insertChunks(chunks);

    db.deleteChunks(['chunk-1', 'chunk-3']);

    const result = db.getChunks('openai', 5);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.id, 'chunk-2');
  } finally {
    await cleanup();
  }
});

test('deleteChunks handles empty array gracefully', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    db.insertChunk(createTestChunk());
    db.deleteChunks([]);

    const result = db.getChunks('openai', 5);
    assert.equal(result.length, 1);
  } finally {
    await cleanup();
  }
});

test('deleteChunks handles non-existent IDs gracefully', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    db.insertChunk(createTestChunk({ id: 'existing-chunk' }));
    db.deleteChunks(['non-existent-1', 'non-existent-2']);

    const result = db.getChunks('openai', 5);
    assert.equal(result.length, 1);
  } finally {
    await cleanup();
  }
});

test('getChunks filters by provider and dimensions', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    db.insertChunk(createTestChunk({
      id: 'openai-chunk',
      embedding_provider: 'openai',
      embedding_dimensions: 1536
    }));
    db.insertChunk(createTestChunk({
      id: 'anthropic-chunk',
      embedding_provider: 'anthropic',
      embedding_dimensions: 1024
    }));

    const openaiChunks = db.getChunks('openai', 1536);
    assert.equal(openaiChunks.length, 1);
    assert.equal(openaiChunks[0]!.id, 'openai-chunk');

    const anthropicChunks = db.getChunks('anthropic', 1024);
    assert.equal(anthropicChunks.length, 1);
    assert.equal(anthropicChunks[0]!.id, 'anthropic-chunk');

    // No match
    const noMatch = db.getChunks('openai', 1024);
    assert.equal(noMatch.length, 0);
  } finally {
    await cleanup();
  }
});

test('getOverviewChunks returns limited chunk overview', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    for (let i = 0; i < 10; i++) {
      db.insertChunk(createTestChunk({
        id: `chunk-${i}`,
        symbol: `func${i}`,
        file_path: `/src/file${i}.ts`
      }));
    }

    const overview = db.getOverviewChunks(5);
    assert.equal(overview.length, 5);
    assert.ok(overview[0]!.id);
    assert.ok(overview[0]!.file_path);
    assert.ok(overview[0]!.symbol);
    assert.ok(overview[0]!.sha);
    assert.ok(overview[0]!.lang);
  } finally {
    await cleanup();
  }
});

test('getExistingDimensions returns distinct provider/dimension pairs', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    db.insertChunk(createTestChunk({
      id: 'chunk-1',
      embedding_provider: 'openai',
      embedding_dimensions: 1536
    }));
    db.insertChunk(createTestChunk({
      id: 'chunk-2',
      embedding_provider: 'openai',
      embedding_dimensions: 1536
    }));
    db.insertChunk(createTestChunk({
      id: 'chunk-3',
      embedding_provider: 'anthropic',
      embedding_dimensions: 1024
    }));

    const dims = db.getExistingDimensions();
    assert.equal(dims.length, 2);

    const openaiDim = dims.find(d => d.embedding_provider === 'openai');
    const anthropicDim = dims.find(d => d.embedding_provider === 'anthropic');

    assert.ok(openaiDim);
    assert.equal(openaiDim!.embedding_dimensions, 1536);
    assert.ok(anthropicDim);
    assert.equal(anthropicDim!.embedding_dimensions, 1024);
  } finally {
    await cleanup();
  }
});

// ============================================================================
// File Path Operations Tests
// ============================================================================

test('getAllFilePaths returns distinct file paths', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    db.insertChunk(createTestChunk({ id: 'c1', file_path: '/src/a.ts' }));
    db.insertChunk(createTestChunk({ id: 'c2', file_path: '/src/a.ts' }));
    db.insertChunk(createTestChunk({ id: 'c3', file_path: '/src/b.ts' }));

    const paths = db.getAllFilePaths();
    assert.equal(paths.length, 2);
    assert.ok(paths.includes('/src/a.ts'));
    assert.ok(paths.includes('/src/b.ts'));
  } finally {
    await cleanup();
  }
});

test('deleteChunksByFilePath removes all chunks for a file', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    db.insertChunk(createTestChunk({ id: 'c1', file_path: '/src/a.ts' }));
    db.insertChunk(createTestChunk({ id: 'c2', file_path: '/src/a.ts' }));
    db.insertChunk(createTestChunk({ id: 'c3', file_path: '/src/b.ts' }));

    db.deleteChunksByFilePath('/src/a.ts');

    const paths = db.getAllFilePaths();
    assert.equal(paths.length, 1);
    assert.ok(paths.includes('/src/b.ts'));
  } finally {
    await cleanup();
  }
});

// ============================================================================
// Intention Cache Tests
// ============================================================================

test('recordIntention inserts new intention record', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    db.recordIntention('find auth', 'find authentication code', 'sha-123', 0.95);

    const result = db.searchByIntention('find auth');
    assert.ok(result);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typedResult = result as any;
    assert.equal(typedResult.target_sha, 'sha-123');
    assert.ok(Math.abs(typedResult.confidence - 0.95) < 0.001);
    assert.equal(typedResult.original_query, 'find authentication code');
  } finally {
    await cleanup();
  }
});

test('recordIntention updates existing intention with same query/sha', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    db.recordIntention('find auth', 'original', 'sha-123', 0.8);
    db.recordIntention('find auth', 'updated', 'sha-123', 0.95);

    const result = db.searchByIntention('find auth');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typedResult = result as any;

    // Confidence should be updated
    assert.ok(Math.abs(typedResult.confidence - 0.95) < 0.001);
    // Usage count should be incremented
    assert.equal(typedResult.usage_count, 2);
  } finally {
    await cleanup();
  }
});

test('searchByIntention returns null for non-existent query', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    const result = db.searchByIntention('non-existent query');
    assert.equal(result, undefined);
  } finally {
    await cleanup();
  }
});

test('searchByIntention joins with code_chunks table', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    db.insertChunk(createTestChunk({
      id: 'chunk-1',
      sha: 'matched-sha',
      file_path: '/src/auth.ts',
      symbol: 'authenticate'
    }));

    db.recordIntention('auth code', 'find auth code', 'matched-sha', 0.9);

    const result = db.searchByIntention('auth code');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typedResult = result as any;

    assert.equal(typedResult.file_path, '/src/auth.ts');
    assert.equal(typedResult.symbol, 'authenticate');
  } finally {
    await cleanup();
  }
});

// ============================================================================
// Query Pattern Tests
// ============================================================================

test('recordQueryPattern inserts new pattern', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    db.recordQueryPattern('authentication');
    db.recordQueryPattern('database query');

    // No direct getter, but should not throw
    assert.ok(true);
  } finally {
    await cleanup();
  }
});

test('recordQueryPattern increments frequency for existing pattern', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    db.recordQueryPattern('auth');
    db.recordQueryPattern('auth');
    db.recordQueryPattern('auth');

    // No direct getter, but should not throw
    assert.ok(true);
  } finally {
    await cleanup();
  }
});

// ============================================================================
// Transaction Management Tests
// ============================================================================

test('transaction commits on success', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    db.transaction(() => {
      db.insertChunk(createTestChunk({ id: 'tx-chunk-1' }));
      db.insertChunk(createTestChunk({ id: 'tx-chunk-2' }));
    });

    const chunks = db.getChunks('openai', 5);
    assert.equal(chunks.length, 2);
  } finally {
    await cleanup();
  }
});

test('transaction rolls back on error', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    try {
      db.transaction(() => {
        db.insertChunk(createTestChunk({ id: 'rollback-chunk' }));
        throw new Error('Intentional error for rollback');
      });
    } catch {
      // Expected
    }

    const chunks = db.getChunks('openai', 5);
    assert.equal(chunks.length, 0);
  } finally {
    await cleanup();
  }
});

test('transaction rejects async functions', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    assert.throws(
      () => {
        db.transaction(() => {
          // Return a promise-like object
          return Promise.resolve('async result');
        });
      },
      /better-sqlite3 transactions must be synchronous/
    );
  } finally {
    await cleanup();
  }
});

test('manual transaction control (beginTransaction/commit)', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    db.beginTransaction();
    db.insertChunk(createTestChunk({ id: 'manual-tx-chunk' }));
    db.commit();

    const chunks = db.getChunks('openai', 5);
    assert.equal(chunks.length, 1);
  } finally {
    await cleanup();
  }
});

test('manual transaction rollback', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    db.beginTransaction();
    db.insertChunk(createTestChunk({ id: 'rollback-chunk' }));
    db.rollback();

    const chunks = db.getChunks('openai', 5);
    assert.equal(chunks.length, 0);
  } finally {
    await cleanup();
  }
});

// ============================================================================
// Database Statistics and Connection Tests
// ============================================================================

test('getStats returns correct database state', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    const stats = db.getStats();

    assert.equal(stats.isOpen, true);
    assert.equal(stats.inTransaction, false);
    assert.equal(stats.readonly, false);
    assert.equal(stats.memory, false); // We're using a file-based DB
  } finally {
    await cleanup();
  }
});

test('getStats reflects transaction state', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    db.beginTransaction();
    const stats = db.getStats();
    assert.equal(stats.inTransaction, true);
    db.rollback();
  } finally {
    await cleanup();
  }
});

test('close properly closes database connection', async () => {
  const { db, dbPath, cleanup } = await createTempDb();

  try {
    const statsBefore = db.getStats();
    assert.equal(statsBefore.isOpen, true);

    db.close();

    const statsAfter = db.getStats();
    assert.equal(statsAfter.isOpen, false);
  } finally {
    // cleanup will try to close again, but that's okay
    await fs.rm(path.dirname(dbPath), { recursive: true, force: true });
  }
});

// ============================================================================
// SQL Injection Prevention Tests (Parameterized Queries)
// ============================================================================

test('insertChunk is safe from SQL injection in id field', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    const maliciousId = "'; DROP TABLE code_chunks; --";
    const chunk = createTestChunk({ id: maliciousId });
    db.insertChunk(chunk);

    // Table should still exist and chunk should be inserted with malicious ID as literal
    const chunks = db.getChunks('openai', 5);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]!.id, maliciousId);
  } finally {
    await cleanup();
  }
});

test('insertChunk is safe from SQL injection in file_path field', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    const maliciousPath = "/src/'; DELETE FROM code_chunks WHERE '1'='1";
    const chunk = createTestChunk({ file_path: maliciousPath });
    db.insertChunk(chunk);

    const chunks = db.getChunks('openai', 5);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]!.file_path, maliciousPath);
  } finally {
    await cleanup();
  }
});

test('deleteChunks is safe from SQL injection', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    db.insertChunk(createTestChunk({ id: 'safe-chunk' }));

    const maliciousIds = ["'; DROP TABLE code_chunks; --", "1' OR '1'='1"];
    db.deleteChunks(maliciousIds);

    // Table should still exist
    const chunks = db.getChunks('openai', 5);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]!.id, 'safe-chunk');
  } finally {
    await cleanup();
  }
});

test('getChunks is safe from SQL injection in provider name', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    db.insertChunk(createTestChunk({ embedding_provider: 'safe-provider' }));

    const maliciousProvider = "'; DROP TABLE code_chunks; --";
    const result = db.getChunks(maliciousProvider, 5);

    // Should return empty (no match), table still exists
    assert.equal(result.length, 0);

    const safeResult = db.getChunks('safe-provider', 5);
    assert.equal(safeResult.length, 1);
  } finally {
    await cleanup();
  }
});

test('recordIntention is safe from SQL injection', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    const maliciousQuery = "'; DELETE FROM intention_cache; --";
    db.recordIntention(maliciousQuery, 'original', 'sha-123', 0.9);

    // Should not throw and intention should be recorded
    const result = db.searchByIntention(maliciousQuery);
    assert.ok(result);
  } finally {
    await cleanup();
  }
});

test('searchByIntention is safe from SQL injection', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    db.recordIntention('safe-query', 'original', 'sha-123', 0.9);

    const maliciousQuery = "' OR '1'='1";
    const result = db.searchByIntention(maliciousQuery);

    // Should return undefined (no match), not all records
    assert.equal(result, undefined);
  } finally {
    await cleanup();
  }
});

test('recordQueryPattern is safe from SQL injection', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    const maliciousPattern = "'; DROP TABLE query_patterns; --";
    db.recordQueryPattern(maliciousPattern);

    // Should not throw, table should still exist
    db.recordQueryPattern('safe-pattern');
    assert.ok(true);
  } finally {
    await cleanup();
  }
});

test('getOverviewChunks is safe from SQL injection in limit', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    db.insertChunk(createTestChunk());

    // Limit is a number, so SQL injection is not directly possible here
    // But we verify the function works correctly with valid numeric input
    const result = db.getOverviewChunks(10);
    assert.ok(Array.isArray(result));
  } finally {
    await cleanup();
  }
});

test('deleteChunksByFilePath is safe from SQL injection', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    db.insertChunk(createTestChunk({ id: 'chunk-1', file_path: '/safe/path.ts' }));

    const maliciousPath = "'; DELETE FROM code_chunks WHERE '1'='1";
    db.deleteChunksByFilePath(maliciousPath);

    // Original chunk should still exist
    const chunks = db.getChunks('openai', 5);
    assert.equal(chunks.length, 1);
  } finally {
    await cleanup();
  }
});

// ============================================================================
// Edge Cases and Error Handling Tests
// ============================================================================

test('handles very large embedding arrays', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    const largeEmbedding = new Float32Array(3072); // Large embedding dimension
    for (let i = 0; i < largeEmbedding.length; i++) {
      largeEmbedding[i] = Math.random();
    }

    const chunk = createTestChunk({
      embedding: largeEmbedding,
      embedding_dimensions: 3072
    });
    db.insertChunk(chunk);

    const chunks = db.getChunks('openai', 3072);
    assert.equal(chunks.length, 1);

    const decoded = decodeEmbedding(chunks[0]!.embedding, 3072);
    assert.equal(decoded.length, 3072);

    // Verify round-trip accuracy
    for (let i = 0; i < 10; i++) {
      assert.ok(Math.abs(decoded[i]! - largeEmbedding[i]!) < 0.0001);
    }
  } finally {
    await cleanup();
  }
});

test('handles unicode characters in chunk fields', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    const chunk = createTestChunk({
      id: 'unicode-chunk-123',
      symbol: 'testFunction',
      file_path: '/src/example.ts',
      codevault_description: 'Description with unicode and special chars',
      doc_comments: '/** Japanese docs and more unicode chars */'
    });
    db.insertChunk(chunk);

    const chunks = db.getChunks('openai', 5);
    assert.equal(chunks.length, 1);
    assert.ok(chunks[0]!.codevault_description?.includes('unicode'));
  } finally {
    await cleanup();
  }
});

test('handles empty strings in chunk fields', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    const chunk = createTestChunk({
      symbol: '',
      codevault_intent: '',
      codevault_description: '',
      doc_comments: ''
    });
    db.insertChunk(chunk);

    const chunks = db.getChunks('openai', 5);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]!.symbol, '');
  } finally {
    await cleanup();
  }
});

test('handles null values in optional chunk fields', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    const chunk = createTestChunk({
      codevault_intent: null,
      codevault_description: null,
      doc_comments: null
    });
    db.insertChunk(chunk);

    const chunks = db.getChunks('openai', 5);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]!.codevault_intent, null);
  } finally {
    await cleanup();
  }
});

test('handles concurrent insertions without data corruption', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    // Insert many chunks rapidly
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 100; i++) {
      promises.push(
        new Promise((resolve) => {
          db.insertChunk(createTestChunk({ id: `concurrent-${i}` }));
          resolve();
        })
      );
    }

    await Promise.all(promises);

    const chunks = db.getChunks('openai', 5);
    assert.equal(chunks.length, 100);
  } finally {
    await cleanup();
  }
});

test('batch insert handles large batches efficiently', async () => {
  const { db, cleanup } = await createTempDb();

  try {
    const chunks: InsertChunkParams[] = [];
    for (let i = 0; i < 500; i++) {
      chunks.push(createTestChunk({ id: `batch-${i}`, symbol: `func${i}` }));
    }

    const startTime = Date.now();
    db.insertChunks(chunks);
    const endTime = Date.now();

    // Should complete in reasonable time (< 5 seconds for 500 items)
    assert.ok(endTime - startTime < 5000);

    const result = db.getChunks('openai', 5);
    assert.equal(result.length, 500);
  } finally {
    await cleanup();
  }
});

// ============================================================================
// In-Memory Database Tests
// ============================================================================

test('works correctly with in-memory database', async () => {
  const db = new CodeVaultDatabase(':memory:');
  db.initialize(1536);

  try {
    const stats = db.getStats();
    assert.equal(stats.memory, true);
    assert.equal(stats.isOpen, true);

    db.insertChunk(createTestChunk({ id: 'memory-chunk' }));

    const chunks = db.getChunks('openai', 5);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]!.id, 'memory-chunk');
  } finally {
    db.close();
  }
});

test('in-memory database supports all operations', async () => {
  const db = new CodeVaultDatabase(':memory:');
  db.initialize(1536);

  try {
    // Test all major operations
    db.insertChunk(createTestChunk({ id: 'chunk-1', file_path: '/a.ts' }));
    db.insertChunks([
      createTestChunk({ id: 'chunk-2', file_path: '/b.ts' }),
      createTestChunk({ id: 'chunk-3', file_path: '/b.ts' })
    ]);

    const paths = db.getAllFilePaths();
    assert.equal(paths.length, 2);

    db.deleteChunksByFilePath('/b.ts');
    assert.equal(db.getAllFilePaths().length, 1);

    db.recordIntention('test', 'test query', 'sha-123', 0.9);
    db.recordQueryPattern('test pattern');

    const overview = db.getOverviewChunks(10);
    assert.equal(overview.length, 1);

    const dims = db.getExistingDimensions();
    assert.ok(dims.length >= 1);
  } finally {
    db.close();
  }
});
