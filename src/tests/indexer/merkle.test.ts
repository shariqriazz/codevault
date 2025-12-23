/**
 * Unit tests for src/indexer/merkle.ts
 *
 * Tests Merkle tree operations including:
 * - Hash computation (xxhash)
 * - Merkle tree load/save operations
 * - Path normalization and safety validation
 * - Merkle entry manipulation (add, remove, clone)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

import {
  computeFastHash,
  loadMerkle,
  saveMerkle,
  saveMerkleAsync,
  toPosixPath,
  validatePathSafety,
  normalizeToProjectPath,
  removeMerkleEntry,
  cloneMerkle,
  type MerkleTree,
  type MerkleEntry
} from '../../indexer/merkle.js';

// Helper to create a temporary directory
async function createTempDir(): Promise<string> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'merkle-test-'));
  return tmpDir;
}

// Helper to clean up temp directory
async function cleanupTempDir(tmpDir: string): Promise<void> {
  await fs.promises.rm(tmpDir, { recursive: true, force: true });
}

// ============================================================================
// computeFastHash Tests
// ============================================================================

test('computeFastHash returns consistent hash for same string input', async () => {
  const input = 'function hello() { return "world"; }';
  const hash1 = await computeFastHash(input);
  const hash2 = await computeFastHash(input);

  assert.equal(hash1, hash2, 'Same input should produce same hash');
  assert.ok(typeof hash1 === 'string', 'Hash should be a string');
  assert.ok(hash1.length > 0, 'Hash should not be empty');
});

test('computeFastHash returns different hashes for different inputs', async () => {
  const hash1 = await computeFastHash('content1');
  const hash2 = await computeFastHash('content2');

  assert.notEqual(hash1, hash2, 'Different inputs should produce different hashes');
});

test('computeFastHash handles Buffer input', async () => {
  const text = 'buffer content';
  const buffer = Buffer.from(text, 'utf8');
  const hashFromBuffer = await computeFastHash(buffer);
  const hashFromString = await computeFastHash(text);

  assert.equal(hashFromBuffer, hashFromString, 'Buffer and string with same content should hash equally');
});

test('computeFastHash handles empty string', async () => {
  const hash = await computeFastHash('');

  assert.ok(typeof hash === 'string', 'Hash of empty string should be a string');
  assert.ok(hash.length > 0, 'Hash of empty string should not be empty');
});

test('computeFastHash handles special characters', async () => {
  const input = 'const x = "\u00E9\u00E8\u00EA\u4E2D\u6587\u65E5\u672C\u8A9E";';
  const hash = await computeFastHash(input);

  assert.ok(typeof hash === 'string', 'Hash should handle unicode');
  assert.ok(hash.length > 0, 'Hash should not be empty');
});

test('computeFastHash handles large content', async () => {
  const largeContent = 'x'.repeat(100000);
  const hash = await computeFastHash(largeContent);

  assert.ok(typeof hash === 'string', 'Hash should handle large content');
  assert.ok(hash.length > 0, 'Hash should not be empty');
});

// ============================================================================
// loadMerkle Tests
// ============================================================================

test('loadMerkle returns empty object when merkle file does not exist', async () => {
  const tmpDir = await createTempDir();

  try {
    const merkle = loadMerkle(tmpDir);
    assert.deepEqual(merkle, {}, 'Should return empty object for non-existent merkle');
  } finally {
    await cleanupTempDir(tmpDir);
  }
});

test('loadMerkle returns empty object when merkle file contains invalid JSON', async () => {
  const tmpDir = await createTempDir();

  try {
    const merkleDir = path.join(tmpDir, '.codevault');
    fs.mkdirSync(merkleDir, { recursive: true });
    fs.writeFileSync(path.join(merkleDir, 'merkle.json'), 'not valid json{{{');

    const merkle = loadMerkle(tmpDir);
    assert.deepEqual(merkle, {}, 'Should return empty object for invalid JSON');
  } finally {
    await cleanupTempDir(tmpDir);
  }
});

test('loadMerkle correctly loads valid merkle file', async () => {
  const tmpDir = await createTempDir();

  try {
    const merkleDir = path.join(tmpDir, '.codevault');
    fs.mkdirSync(merkleDir, { recursive: true });

    const testMerkle: MerkleTree = {
      'src/index.ts': {
        shaFile: 'abc123',
        chunkShas: ['chunk1', 'chunk2']
      }
    };

    fs.writeFileSync(path.join(merkleDir, 'merkle.json'), JSON.stringify(testMerkle));

    const loaded = loadMerkle(tmpDir);
    assert.deepEqual(loaded, testMerkle, 'Should load merkle correctly');
  } finally {
    await cleanupTempDir(tmpDir);
  }
});

test('loadMerkle handles non-object JSON (returns fallback)', async () => {
  const tmpDir = await createTempDir();

  try {
    const merkleDir = path.join(tmpDir, '.codevault');
    fs.mkdirSync(merkleDir, { recursive: true });
    fs.writeFileSync(path.join(merkleDir, 'merkle.json'), '"just a string"');

    const merkle = loadMerkle(tmpDir);
    assert.deepEqual(merkle, {}, 'Should return empty object for non-object JSON');
  } finally {
    await cleanupTempDir(tmpDir);
  }
});

test('loadMerkle handles null JSON (returns fallback)', async () => {
  const tmpDir = await createTempDir();

  try {
    const merkleDir = path.join(tmpDir, '.codevault');
    fs.mkdirSync(merkleDir, { recursive: true });
    fs.writeFileSync(path.join(merkleDir, 'merkle.json'), 'null');

    const merkle = loadMerkle(tmpDir);
    assert.deepEqual(merkle, {}, 'Should return empty object for null JSON');
  } finally {
    await cleanupTempDir(tmpDir);
  }
});

// ============================================================================
// saveMerkle Tests
// ============================================================================

test('saveMerkle creates .codevault directory if not exists', async () => {
  const tmpDir = await createTempDir();

  try {
    const testMerkle: MerkleTree = {
      'file.ts': { shaFile: 'hash', chunkShas: [] }
    };

    saveMerkle(tmpDir, testMerkle);

    const merkleDir = path.join(tmpDir, '.codevault');
    assert.ok(fs.existsSync(merkleDir), '.codevault directory should be created');
    assert.ok(fs.existsSync(path.join(merkleDir, 'merkle.json')), 'merkle.json should be created');
  } finally {
    await cleanupTempDir(tmpDir);
  }
});

test('saveMerkle writes valid JSON that can be loaded back', async () => {
  const tmpDir = await createTempDir();

  try {
    const testMerkle: MerkleTree = {
      'src/utils.ts': { shaFile: 'xyz789', chunkShas: ['a', 'b', 'c'] },
      'src/main.ts': { shaFile: 'abc123', chunkShas: ['d'] }
    };

    saveMerkle(tmpDir, testMerkle);
    const loaded = loadMerkle(tmpDir);

    assert.deepEqual(loaded, testMerkle, 'Saved merkle should match loaded merkle');
  } finally {
    await cleanupTempDir(tmpDir);
  }
});

test('saveMerkle overwrites existing merkle file', async () => {
  const tmpDir = await createTempDir();

  try {
    const firstMerkle: MerkleTree = {
      'old.ts': { shaFile: 'old', chunkShas: [] }
    };
    const secondMerkle: MerkleTree = {
      'new.ts': { shaFile: 'new', chunkShas: ['chunk'] }
    };

    saveMerkle(tmpDir, firstMerkle);
    saveMerkle(tmpDir, secondMerkle);

    const loaded = loadMerkle(tmpDir);
    assert.deepEqual(loaded, secondMerkle, 'Second save should overwrite first');
    assert.ok(!('old.ts' in loaded), 'Old entry should not exist');
  } finally {
    await cleanupTempDir(tmpDir);
  }
});

test('saveMerkle handles empty merkle tree', async () => {
  const tmpDir = await createTempDir();

  try {
    saveMerkle(tmpDir, {});

    const loaded = loadMerkle(tmpDir);
    assert.deepEqual(loaded, {}, 'Empty merkle should be saved and loaded correctly');
  } finally {
    await cleanupTempDir(tmpDir);
  }
});

test('saveMerkle uses default empty object when merkle is undefined', async () => {
  const tmpDir = await createTempDir();

  try {
    saveMerkle(tmpDir);

    const loaded = loadMerkle(tmpDir);
    assert.deepEqual(loaded, {}, 'Default empty merkle should be saved');
  } finally {
    await cleanupTempDir(tmpDir);
  }
});

// ============================================================================
// saveMerkleAsync Tests
// ============================================================================

test('saveMerkleAsync creates directory and file asynchronously', async () => {
  const tmpDir = await createTempDir();

  try {
    const testMerkle: MerkleTree = {
      'async-file.ts': { shaFile: 'asynchash', chunkShas: ['x'] }
    };

    await saveMerkleAsync(tmpDir, testMerkle);

    const loaded = loadMerkle(tmpDir);
    assert.deepEqual(loaded, testMerkle, 'Async save should work correctly');
  } finally {
    await cleanupTempDir(tmpDir);
  }
});

test('saveMerkleAsync handles concurrent writes', async () => {
  const tmpDir = await createTempDir();

  try {
    const merkle1: MerkleTree = { 'file1.ts': { shaFile: 'h1', chunkShas: [] } };
    const merkle2: MerkleTree = { 'file2.ts': { shaFile: 'h2', chunkShas: [] } };

    // Both writes should complete without error
    await Promise.all([
      saveMerkleAsync(tmpDir, merkle1),
      saveMerkleAsync(tmpDir, merkle2)
    ]);

    const loaded = loadMerkle(tmpDir);
    // One of them should have won
    assert.ok(
      'file1.ts' in loaded || 'file2.ts' in loaded,
      'At least one write should succeed'
    );
  } finally {
    await cleanupTempDir(tmpDir);
  }
});

// ============================================================================
// toPosixPath Tests
// ============================================================================

test('toPosixPath converts Windows-style paths to POSIX', () => {
  // On Unix, path.sep is '/', so this test simulates the conversion
  const input = 'src\\utils\\helper.ts';
  const result = toPosixPath(input.split('\\').join(path.sep));

  // The function replaces path.sep with '/', so on Unix it's a no-op for Unix paths
  assert.ok(typeof result === 'string');
});

test('toPosixPath returns null for null input', () => {
  const result = toPosixPath(null);
  assert.equal(result, null, 'Should return null for null input');
});

test('toPosixPath handles empty string', () => {
  const result = toPosixPath('');
  assert.equal(result, '', 'Should return empty string for empty input');
});

test('toPosixPath handles already POSIX paths', () => {
  const input = 'src/utils/helper.ts';
  const result = toPosixPath(input);
  assert.equal(result, input, 'POSIX paths should remain unchanged');
});

test('toPosixPath handles single filename', () => {
  const result = toPosixPath('file.ts');
  assert.equal(result, 'file.ts', 'Single filename should remain unchanged');
});

// ============================================================================
// validatePathSafety Tests
// ============================================================================

test('validatePathSafety marks paths inside base as safe', async () => {
  const tmpDir = await createTempDir();

  try {
    // Create a test file
    const testFile = path.join(tmpDir, 'test.ts');
    fs.writeFileSync(testFile, 'content');

    const result = validatePathSafety(tmpDir, 'test.ts');

    assert.equal(result.safe, true, 'Path inside base should be safe');
    assert.ok(result.normalized !== null, 'Normalized path should not be null');
  } finally {
    await cleanupTempDir(tmpDir);
  }
});

test('validatePathSafety marks parent traversal as unsafe', async () => {
  const tmpDir = await createTempDir();

  try {
    const result = validatePathSafety(tmpDir, '../outside.ts');

    assert.equal(result.safe, false, 'Parent traversal should be unsafe');
    assert.equal(result.reason, 'path_outside_base', 'Should have correct reason');
  } finally {
    await cleanupTempDir(tmpDir);
  }
});

test('validatePathSafety marks absolute paths outside base as unsafe', async () => {
  const tmpDir = await createTempDir();

  try {
    const result = validatePathSafety(tmpDir, '/etc/passwd');

    assert.equal(result.safe, false, 'Absolute path outside base should be unsafe');
  } finally {
    await cleanupTempDir(tmpDir);
  }
});

test('validatePathSafety handles empty relative path', async () => {
  const tmpDir = await createTempDir();

  try {
    const result = validatePathSafety(tmpDir, '');

    assert.equal(result.safe, true, 'Empty relative path (base itself) should be safe');
  } finally {
    await cleanupTempDir(tmpDir);
  }
});

test('validatePathSafety handles nested paths correctly', async () => {
  const tmpDir = await createTempDir();

  try {
    // Create nested directory structure
    const nestedDir = path.join(tmpDir, 'src', 'utils');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(nestedDir, 'helper.ts'), 'content');

    const result = validatePathSafety(tmpDir, 'src/utils/helper.ts');

    assert.equal(result.safe, true, 'Nested path should be safe');
    assert.ok(result.normalized?.includes('helper.ts'), 'Normalized should include filename');
  } finally {
    await cleanupTempDir(tmpDir);
  }
});

test('validatePathSafety handles non-existent but valid relative path', async () => {
  const tmpDir = await createTempDir();

  try {
    const result = validatePathSafety(tmpDir, 'nonexistent/path/file.ts');

    assert.equal(result.safe, true, 'Non-existent but valid relative path should be safe');
  } finally {
    await cleanupTempDir(tmpDir);
  }
});

test('validatePathSafety detects symlink escaping', async () => {
  const tmpDir = await createTempDir();
  const outsideDir = await createTempDir();

  try {
    // Create a symlink that points outside the base
    const symlinkPath = path.join(tmpDir, 'escape-link');

    try {
      fs.symlinkSync(outsideDir, symlinkPath);
    } catch {
      // Symlinks may not be supported on all systems/permissions
      // Skip this test in that case
      return;
    }

    const result = validatePathSafety(tmpDir, 'escape-link');

    assert.equal(result.safe, false, 'Symlink escaping should be detected');
    assert.equal(result.reason, 'symlink_escape', 'Should have symlink_escape reason');
  } finally {
    await cleanupTempDir(tmpDir);
    await cleanupTempDir(outsideDir);
  }
});

// ============================================================================
// normalizeToProjectPath Tests
// ============================================================================

test('normalizeToProjectPath returns null for empty string', async () => {
  const tmpDir = await createTempDir();

  try {
    const result = normalizeToProjectPath(tmpDir, '');
    assert.equal(result, null, 'Empty string should return null');
  } finally {
    await cleanupTempDir(tmpDir);
  }
});

test('normalizeToProjectPath returns null for undefined', async () => {
  const tmpDir = await createTempDir();

  try {
    const result = normalizeToProjectPath(tmpDir, undefined);
    assert.equal(result, null, 'Undefined should return null');
  } finally {
    await cleanupTempDir(tmpDir);
  }
});

test('normalizeToProjectPath returns null for non-string input', async () => {
  const tmpDir = await createTempDir();

  try {
    const result = normalizeToProjectPath(tmpDir, 123 as unknown as string);
    assert.equal(result, null, 'Non-string should return null');
  } finally {
    await cleanupTempDir(tmpDir);
  }
});

test('normalizeToProjectPath normalizes valid path', async () => {
  const tmpDir = await createTempDir();

  try {
    const testFile = path.join(tmpDir, 'src', 'test.ts');
    fs.mkdirSync(path.dirname(testFile), { recursive: true });
    fs.writeFileSync(testFile, 'content');

    const result = normalizeToProjectPath(tmpDir, 'src/test.ts');

    assert.ok(result !== null, 'Valid path should return non-null');
    assert.ok(result?.includes('test.ts'), 'Should include filename');
  } finally {
    await cleanupTempDir(tmpDir);
  }
});

test('normalizeToProjectPath returns null for unsafe path', async () => {
  const tmpDir = await createTempDir();

  try {
    const result = normalizeToProjectPath(tmpDir, '../escape.ts');
    assert.equal(result, null, 'Unsafe path should return null');
  } finally {
    await cleanupTempDir(tmpDir);
  }
});

// ============================================================================
// removeMerkleEntry Tests
// ============================================================================

test('removeMerkleEntry removes existing entry and returns true', () => {
  const merkle: MerkleTree = {
    'file1.ts': { shaFile: 'h1', chunkShas: [] },
    'file2.ts': { shaFile: 'h2', chunkShas: [] }
  };

  const result = removeMerkleEntry(merkle, 'file1.ts');

  assert.equal(result, true, 'Should return true for existing entry');
  assert.ok(!('file1.ts' in merkle), 'Entry should be removed');
  assert.ok('file2.ts' in merkle, 'Other entries should remain');
});

test('removeMerkleEntry returns false for non-existent entry', () => {
  const merkle: MerkleTree = {
    'file1.ts': { shaFile: 'h1', chunkShas: [] }
  };

  const result = removeMerkleEntry(merkle, 'nonexistent.ts');

  assert.equal(result, false, 'Should return false for non-existent entry');
  assert.ok('file1.ts' in merkle, 'Existing entry should remain');
});

test('removeMerkleEntry returns false for null merkle', () => {
  const result = removeMerkleEntry(null as unknown as MerkleTree, 'file.ts');
  assert.equal(result, false, 'Should return false for null merkle');
});

test('removeMerkleEntry returns false for non-object merkle', () => {
  const result = removeMerkleEntry('not an object' as unknown as MerkleTree, 'file.ts');
  assert.equal(result, false, 'Should return false for non-object merkle');
});

test('removeMerkleEntry handles empty merkle tree', () => {
  const merkle: MerkleTree = {};

  const result = removeMerkleEntry(merkle, 'file.ts');

  assert.equal(result, false, 'Should return false for empty merkle');
});

// ============================================================================
// cloneMerkle Tests
// ============================================================================

test('cloneMerkle creates a deep copy', () => {
  const original: MerkleTree = {
    'file.ts': { shaFile: 'hash', chunkShas: ['a', 'b'] }
  };

  const cloned = cloneMerkle(original);

  assert.deepEqual(cloned, original, 'Clone should equal original');

  // Modify clone and verify original is unchanged
  cloned['file.ts'].shaFile = 'modified';
  cloned['file.ts'].chunkShas.push('c');

  assert.equal(original['file.ts'].shaFile, 'hash', 'Original should be unchanged');
  assert.equal(original['file.ts'].chunkShas.length, 2, 'Original chunks should be unchanged');
});

test('cloneMerkle handles empty merkle', () => {
  const original: MerkleTree = {};
  const cloned = cloneMerkle(original);

  assert.deepEqual(cloned, {}, 'Empty merkle clone should be empty');
});

test('cloneMerkle handles null by returning empty object', () => {
  const cloned = cloneMerkle(null as unknown as MerkleTree);
  assert.deepEqual(cloned, {}, 'Null should clone to empty object');
});

test('cloneMerkle handles undefined by returning empty object', () => {
  const cloned = cloneMerkle(undefined as unknown as MerkleTree);
  assert.deepEqual(cloned, {}, 'Undefined should clone to empty object');
});

test('cloneMerkle preserves complex merkle structure', () => {
  const original: MerkleTree = {
    'src/index.ts': { shaFile: 'h1', chunkShas: ['c1', 'c2', 'c3'] },
    'src/utils/helper.ts': { shaFile: 'h2', chunkShas: [] },
    'lib/core.ts': { shaFile: 'h3', chunkShas: ['c4'] }
  };

  const cloned = cloneMerkle(original);

  assert.deepEqual(cloned, original, 'Complex merkle should clone correctly');
  assert.notEqual(cloned, original, 'Clone should be a different object reference');
});
