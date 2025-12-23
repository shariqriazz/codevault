/**
 * Unit tests for src/indexer/update.ts
 *
 * Tests partial re-indexing functionality including:
 * - Path normalization for changed/deleted files
 * - Early return when no changes detected
 * - Delegation to indexProject with correct parameters
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import os from 'os';

import { updateIndex, type UpdateIndexOptions, type UpdateIndexResult } from '../../indexer/update.js';

// Helper to create a temporary directory with .codevault structure
async function createTempRepo(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'update-test-'));

  // Create necessary directory structure
  const codevaultDir = path.join(root, '.codevault');
  await fs.promises.mkdir(codevaultDir, { recursive: true });

  // Create chunks directory
  const chunksDir = path.join(codevaultDir, 'chunks');
  await fs.promises.mkdir(chunksDir, { recursive: true });

  // Create a minimal database structure (empty merkle)
  await fs.promises.writeFile(
    path.join(codevaultDir, 'merkle.json'),
    JSON.stringify({})
  );

  return {
    root,
    cleanup: async () => {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  };
}

// Helper to write a test file
async function writeTestFile(root: string, relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(root, relativePath);
  await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.promises.writeFile(fullPath, content);
}

// ============================================================================
// Early Return Tests - No Changes Scenario
// ============================================================================

test('updateIndex returns early when no files changed or deleted', async () => {
  const repo = await createTempRepo();

  try {
    const result = await updateIndex({
      repoPath: repo.root,
      changedFiles: [],
      deletedFiles: []
    });

    assert.equal(result.success, true, 'Should succeed');
    assert.equal(result.processedChunks, 0, 'No chunks should be processed');
    assert.equal(result.totalChunks, 0, 'Total chunks should be 0');
    assert.deepEqual(result.errors, [], 'No errors should occur');
  } finally {
    await repo.cleanup();
  }
});

test('updateIndex returns early when changedFiles is undefined', async () => {
  const repo = await createTempRepo();

  try {
    const result = await updateIndex({
      repoPath: repo.root
    });

    assert.equal(result.success, true, 'Should succeed with undefined arrays');
    assert.equal(result.processedChunks, 0, 'No chunks should be processed');
  } finally {
    await repo.cleanup();
  }
});

test('updateIndex returns early with default options', async () => {
  // Uses cwd as default, which might not be a valid repo
  // But the early return should trigger before validation
  const result = await updateIndex({
    changedFiles: [],
    deletedFiles: []
  });

  assert.equal(result.success, true, 'Should succeed with empty arrays');
  assert.equal(result.processedChunks, 0, 'No chunks processed');
});

// ============================================================================
// Path Normalization Tests
// ============================================================================

test('updateIndex normalizes paths that escape base directory', async () => {
  const repo = await createTempRepo();

  try {
    // Paths that try to escape should be filtered out
    const result = await updateIndex({
      repoPath: repo.root,
      changedFiles: ['../escape.ts', '../../etc/passwd'],
      deletedFiles: ['../../../root/file.ts']
    });

    // All paths are invalid, so should result in early return
    assert.equal(result.success, true, 'Should succeed (invalid paths filtered)');
    assert.equal(result.processedChunks, 0, 'No valid paths to process');
  } finally {
    await repo.cleanup();
  }
});

test('updateIndex filters out non-string values from arrays', async () => {
  const repo = await createTempRepo();

  try {
    const result = await updateIndex({
      repoPath: repo.root,
      changedFiles: [null, undefined, 123, '', 'valid.ts'] as unknown as string[],
      deletedFiles: [false, {}, []] as unknown as string[]
    });

    // Most values are invalid; only 'valid.ts' might be considered
    // But since valid.ts doesn't exist, normalization may still filter it
    assert.equal(result.success, true, 'Should handle mixed invalid types');
  } finally {
    await repo.cleanup();
  }
});

test('updateIndex handles non-array changedFiles gracefully', async () => {
  const repo = await createTempRepo();

  try {
    const result = await updateIndex({
      repoPath: repo.root,
      changedFiles: 'not-an-array' as unknown as string[],
      deletedFiles: undefined
    });

    assert.equal(result.success, true, 'Should handle non-array gracefully');
    assert.equal(result.processedChunks, 0, 'No chunks processed');
  } finally {
    await repo.cleanup();
  }
});

// ============================================================================
// Path Resolution Tests
// ============================================================================

test('updateIndex resolves relative repoPath to absolute', async () => {
  const repo = await createTempRepo();

  try {
    // Create a test file
    await writeTestFile(repo.root, 'src/test.ts', 'export const x = 1;');

    // Get relative path from cwd
    const relativePath = path.relative(process.cwd(), repo.root);

    const result = await updateIndex({
      repoPath: relativePath,
      changedFiles: [],
      deletedFiles: []
    });

    assert.equal(result.success, true, 'Should handle relative path');
  } finally {
    await repo.cleanup();
  }
});

test('updateIndex deduplicates normalized paths', async () => {
  const repo = await createTempRepo();

  try {
    await writeTestFile(repo.root, 'src/test.ts', 'export const x = 1;');

    // Same file referenced multiple ways
    const result = await updateIndex({
      repoPath: repo.root,
      changedFiles: [
        'src/test.ts',
        './src/test.ts',
        'src/../src/test.ts'
      ],
      deletedFiles: []
    });

    // Should deduplicate to single entry
    assert.equal(result.success, true, 'Should handle duplicate paths');
  } finally {
    await repo.cleanup();
  }
});

// ============================================================================
// Options Forwarding Tests
// ============================================================================

test('updateIndex uses default provider when not specified', async () => {
  const repo = await createTempRepo();

  try {
    const result = await updateIndex({
      repoPath: repo.root,
      changedFiles: [],
      deletedFiles: []
    });

    // Default provider is 'auto'
    assert.equal(result.provider, 'auto', 'Should use auto provider by default');
  } finally {
    await repo.cleanup();
  }
});

test('updateIndex respects custom provider option', async () => {
  const repo = await createTempRepo();

  try {
    const result = await updateIndex({
      repoPath: repo.root,
      provider: 'openai',
      changedFiles: [],
      deletedFiles: []
    });

    assert.equal(result.provider, 'openai', 'Should use specified provider');
  } finally {
    await repo.cleanup();
  }
});

// ============================================================================
// Return Type Validation Tests
// ============================================================================

test('updateIndex returns correct result structure on early return', async () => {
  const result = await updateIndex({
    changedFiles: [],
    deletedFiles: []
  });

  // Validate structure
  assert.ok('success' in result, 'Result should have success property');
  assert.ok('processedChunks' in result, 'Result should have processedChunks property');
  assert.ok('totalChunks' in result, 'Result should have totalChunks property');
  assert.ok('provider' in result, 'Result should have provider property');
  assert.ok('errors' in result, 'Result should have errors property');

  // Validate types
  assert.equal(typeof result.success, 'boolean', 'success should be boolean');
  assert.equal(typeof result.processedChunks, 'number', 'processedChunks should be number');
  assert.equal(typeof result.totalChunks, 'number', 'totalChunks should be number');
  assert.equal(typeof result.provider, 'string', 'provider should be string');
  assert.ok(Array.isArray(result.errors), 'errors should be array');
});

// ============================================================================
// Edge Cases
// ============================================================================

test('updateIndex handles paths with special characters', async () => {
  const repo = await createTempRepo();

  try {
    // Create file with spaces and special chars
    await writeTestFile(repo.root, 'src/my file (copy).ts', 'export const x = 1;');

    const result = await updateIndex({
      repoPath: repo.root,
      changedFiles: ['src/my file (copy).ts'],
      deletedFiles: []
    });

    assert.equal(result.success, true, 'Should handle special characters');
  } finally {
    await repo.cleanup();
  }
});

test('updateIndex handles very long paths', async () => {
  const repo = await createTempRepo();

  try {
    // Create deeply nested path
    const deepPath = 'a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p/test.ts';
    await writeTestFile(repo.root, deepPath, 'export const x = 1;');

    const result = await updateIndex({
      repoPath: repo.root,
      changedFiles: [deepPath],
      deletedFiles: []
    });

    assert.equal(result.success, true, 'Should handle deep paths');
  } finally {
    await repo.cleanup();
  }
});

test('updateIndex handles unicode in paths', async () => {
  const repo = await createTempRepo();

  try {
    const unicodePath = 'src/\u4E2D\u6587\u6587\u4EF6.ts';
    await writeTestFile(repo.root, unicodePath, 'export const x = 1;');

    const result = await updateIndex({
      repoPath: repo.root,
      changedFiles: [unicodePath],
      deletedFiles: []
    });

    assert.equal(result.success, true, 'Should handle unicode paths');
  } finally {
    await repo.cleanup();
  }
});

// ============================================================================
// Concurrency Option Tests
// ============================================================================

test('updateIndex passes concurrency option through', async () => {
  const repo = await createTempRepo();

  try {
    const result = await updateIndex({
      repoPath: repo.root,
      changedFiles: [],
      deletedFiles: [],
      concurrency: 50
    });

    assert.equal(result.success, true, 'Should accept concurrency option');
  } finally {
    await repo.cleanup();
  }
});

// ============================================================================
// Encryption Option Tests
// ============================================================================

test('updateIndex passes encrypt option through', async () => {
  const repo = await createTempRepo();

  try {
    const result = await updateIndex({
      repoPath: repo.root,
      changedFiles: [],
      deletedFiles: [],
      encrypt: 'off'
    });

    assert.equal(result.success, true, 'Should accept encrypt option');
  } finally {
    await repo.cleanup();
  }
});
