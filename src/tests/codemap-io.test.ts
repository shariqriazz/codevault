import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  resolveCodemapPath,
  readCodemap,
  writeCodemap,
  writeCodemapAsync,
  readCodemapAsync,
  type Codemap
} from '../codemap/io.js';
import {
  normalizeChunkMetadata,
  normalizeCodemapRecord,
  DEFAULT_PATH_WEIGHT,
  DEFAULT_SUCCESS_RATE,
  type CodemapChunk
} from '../types/codemap.js';
import { attachSymbolGraphToCodemap } from '../symbols/graph.js';

// ============================================================================
// Test Utilities
// ============================================================================

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codemap-test-'));
}

function cleanup(tempDir: string): void {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// ============================================================================
// resolveCodemapPath Tests
// ============================================================================

test('resolveCodemapPath returns default filename in current directory', () => {
  const result = resolveCodemapPath();
  assert.ok(result.endsWith('codevault.codemap.json'), 'should end with codevault.codemap.json');
  assert.ok(path.isAbsolute(result), 'should return absolute path');
});

test('resolveCodemapPath resolves relative to provided basePath', () => {
  const result = resolveCodemapPath('/some/project');
  assert.equal(result, path.resolve('/some/project', 'codevault.codemap.json'));
});

test('resolveCodemapPath handles trailing slash in basePath', () => {
  const result = resolveCodemapPath('/some/project/');
  assert.ok(result.includes('codevault.codemap.json'));
});

test('resolveCodemapPath handles empty string basePath as current directory', () => {
  const result = resolveCodemapPath('');
  assert.ok(result.endsWith('codevault.codemap.json'));
});

// ============================================================================
// readCodemap Tests (Synchronous)
// ============================================================================

test('readCodemap returns empty object when file does not exist', () => {
  const tempDir = createTempDir();
  try {
    const nonExistent = path.join(tempDir, 'nonexistent.json');
    const result = readCodemap(nonExistent);
    assert.deepEqual(result, {});
  } finally {
    cleanup(tempDir);
  }
});

test('readCodemap parses valid JSON file', () => {
  const tempDir = createTempDir();
  try {
    const filePath = path.join(tempDir, 'codemap.json');
    const testData: Codemap = {
      'chunk1': {
        file: 'src/example.ts',
        sha: 'abc123',
        symbol: 'testFunc',
        lang: 'typescript',
        symbol_neighbors: []
      }
    };
    fs.writeFileSync(filePath, JSON.stringify(testData));

    const result = readCodemap(filePath);
    assert.equal(result.chunk1.file, 'src/example.ts');
    assert.equal(result.chunk1.sha, 'abc123');
    assert.equal(result.chunk1.symbol, 'testFunc');
  } finally {
    cleanup(tempDir);
  }
});

test('readCodemap returns empty object on malformed JSON', () => {
  const tempDir = createTempDir();
  try {
    const filePath = path.join(tempDir, 'malformed.json');
    fs.writeFileSync(filePath, '{ invalid json }');

    const result = readCodemap(filePath);
    assert.deepEqual(result, {});
  } finally {
    cleanup(tempDir);
  }
});

test('readCodemap normalizes data during read', () => {
  const tempDir = createTempDir();
  try {
    const filePath = path.join(tempDir, 'normalize.json');
    const rawData = {
      'chunk1': {
        file: 'src/test.ts',
        sha: 'xyz789',
        path_weight: -5,          // Should be clamped to 0
        success_rate: 2.0,        // Should be clamped to 1
        variableCount: 'invalid', // Should default to 0
        synonyms: ['valid', 123]  // Non-string should be filtered
      }
    };
    fs.writeFileSync(filePath, JSON.stringify(rawData));

    const result = readCodemap(filePath);
    assert.equal(result.chunk1.path_weight, 0);
    assert.equal(result.chunk1.success_rate, 1);
    assert.equal(result.chunk1.variableCount, 0);
    assert.deepEqual(result.chunk1.synonyms, ['valid']);
  } finally {
    cleanup(tempDir);
  }
});

test('readCodemap uses default path when no argument provided', () => {
  // This test verifies the function doesn't throw when called without args
  // The file likely won't exist, so we expect empty object
  const result = readCodemap();
  assert.ok(typeof result === 'object');
});

// ============================================================================
// writeCodemap Tests (Synchronous)
// ============================================================================

test('writeCodemap creates file with normalized data', () => {
  const tempDir = createTempDir();
  try {
    const filePath = path.join(tempDir, 'output.json');
    const testData: Codemap = {
      'chunk1': {
        file: 'src/example.ts',
        sha: 'abc123',
        symbol: 'myFunc',
        symbol_neighbors: []
      }
    };

    const result = writeCodemap(filePath, testData);

    assert.ok(fs.existsSync(filePath));
    assert.equal(result.chunk1.file, 'src/example.ts');
    assert.equal(result.chunk1.sha, 'abc123');

    const written = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Codemap;
    assert.equal(written.chunk1.file, 'src/example.ts');
  } finally {
    cleanup(tempDir);
  }
});

test('writeCodemap creates nested directories if needed', () => {
  const tempDir = createTempDir();
  try {
    const nestedPath = path.join(tempDir, 'deep', 'nested', 'dir', 'codemap.json');
    const testData: Codemap = {
      'chunk1': { file: 'test.ts', sha: 'hash1', symbol_neighbors: [] }
    };

    writeCodemap(nestedPath, testData);
    assert.ok(fs.existsSync(nestedPath));
  } finally {
    cleanup(tempDir);
  }
});

test('writeCodemap overwrites existing file', () => {
  const tempDir = createTempDir();
  try {
    const filePath = path.join(tempDir, 'overwrite.json');
    fs.writeFileSync(filePath, '{"old": "data"}');

    const newData: Codemap = {
      'new_chunk': { file: 'new.ts', sha: 'newhash', symbol_neighbors: [] }
    };

    writeCodemap(filePath, newData);

    const written = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Codemap;
    assert.ok('new_chunk' in written);
    assert.ok(!('old' in written));
  } finally {
    cleanup(tempDir);
  }
});

test('writeCodemap handles null/undefined codemap gracefully', () => {
  const tempDir = createTempDir();
  try {
    const filePath = path.join(tempDir, 'null.json');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = writeCodemap(filePath, null as any);
    assert.deepEqual(result, {});

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result2 = writeCodemap(filePath, undefined as any);
    assert.deepEqual(result2, {});
  } finally {
    cleanup(tempDir);
  }
});

test('writeCodemap uses default path when undefined filePath provided', () => {
  // Note: This will write to current directory, so we need to be careful
  const testData: Codemap = {
    'chunk1': { file: 'test.ts', sha: 'hash1', symbol_neighbors: [] }
  };

  // The function should not throw
  const result = writeCodemap(undefined, testData);
  assert.ok(typeof result === 'object');

  // Cleanup the file created in current directory
  const defaultPath = resolveCodemapPath('.');
  if (fs.existsSync(defaultPath)) {
    fs.unlinkSync(defaultPath);
  }
});

// ============================================================================
// readCodemapAsync Tests
// ============================================================================

test('readCodemapAsync returns empty object when file does not exist', async () => {
  const tempDir = createTempDir();
  try {
    const nonExistent = path.join(tempDir, 'nonexistent.json');
    const result = await readCodemapAsync(nonExistent);
    assert.deepEqual(result, {});
  } finally {
    cleanup(tempDir);
  }
});

test('readCodemapAsync parses valid JSON file', async () => {
  const tempDir = createTempDir();
  try {
    const filePath = path.join(tempDir, 'async-read.json');
    const testData: Codemap = {
      'async_chunk': {
        file: 'async.ts',
        sha: 'asynchash',
        symbol: 'asyncFunc',
        symbol_neighbors: []
      }
    };
    fs.writeFileSync(filePath, JSON.stringify(testData));

    const result = await readCodemapAsync(filePath);
    assert.equal(result.async_chunk.file, 'async.ts');
    assert.equal(result.async_chunk.symbol, 'asyncFunc');
  } finally {
    cleanup(tempDir);
  }
});

test('readCodemapAsync returns empty object on malformed JSON', async () => {
  const tempDir = createTempDir();
  try {
    const filePath = path.join(tempDir, 'async-malformed.json');
    fs.writeFileSync(filePath, 'not valid json {{{');

    const result = await readCodemapAsync(filePath);
    assert.deepEqual(result, {});
  } finally {
    cleanup(tempDir);
  }
});

test('readCodemapAsync normalizes data during read', async () => {
  const tempDir = createTempDir();
  try {
    const filePath = path.join(tempDir, 'async-normalize.json');
    const rawData = {
      'chunk1': {
        file: 'test.ts',
        sha: 'hash',
        success_rate: -0.5  // Should be clamped to 0
      }
    };
    fs.writeFileSync(filePath, JSON.stringify(rawData));

    const result = await readCodemapAsync(filePath);
    assert.equal(result.chunk1.success_rate, 0);
  } finally {
    cleanup(tempDir);
  }
});

// ============================================================================
// writeCodemapAsync Tests
// ============================================================================

test('writeCodemapAsync creates file with normalized data', async () => {
  const tempDir = createTempDir();
  try {
    const filePath = path.join(tempDir, 'async-write.json');
    const testData: Codemap = {
      'async_chunk': {
        file: 'async.ts',
        sha: 'asynchash',
        symbol: 'myAsyncFunc',
        symbol_neighbors: []
      }
    };

    const result = await writeCodemapAsync(filePath, testData);

    assert.ok(fs.existsSync(filePath));
    assert.equal(result.async_chunk.file, 'async.ts');
  } finally {
    cleanup(tempDir);
  }
});

test('writeCodemapAsync creates nested directories', async () => {
  const tempDir = createTempDir();
  try {
    const nestedPath = path.join(tempDir, 'async', 'nested', 'path', 'codemap.json');
    const testData: Codemap = {
      'chunk1': { file: 'test.ts', sha: 'hash1', symbol_neighbors: [] }
    };

    await writeCodemapAsync(nestedPath, testData);
    assert.ok(fs.existsSync(nestedPath));
  } finally {
    cleanup(tempDir);
  }
});

test('writeCodemapAsync handles null codemap', async () => {
  const tempDir = createTempDir();
  try {
    const filePath = path.join(tempDir, 'async-null.json');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await writeCodemapAsync(filePath, null as any);
    assert.deepEqual(result, {});
  } finally {
    cleanup(tempDir);
  }
});

// ============================================================================
// normalizeChunkMetadata Tests
// ============================================================================

test('normalizeChunkMetadata handles minimal valid input', () => {
  const raw = {
    file: 'test.ts',
    sha: 'abc123'
  };

  const result = normalizeChunkMetadata(raw);

  assert.equal(result.file, 'test.ts');
  assert.equal(result.sha, 'abc123');
  assert.equal(result.lang, 'unknown');
  assert.equal(result.symbol, null);
  assert.equal(result.path_weight, DEFAULT_PATH_WEIGHT);
  assert.equal(result.success_rate, DEFAULT_SUCCESS_RATE);
  assert.equal(result.encrypted, false);
  assert.deepEqual(result.symbol_neighbors, []);
});

test('normalizeChunkMetadata handles empty/invalid file and sha', () => {
  const raw = {
    file: '',
    sha: null
  };

  const result = normalizeChunkMetadata(raw);

  assert.equal(result.file, 'unknown');
  assert.equal(result.sha, 'unknown');
});

test('normalizeChunkMetadata clamps path_weight to non-negative', () => {
  const result1 = normalizeChunkMetadata({ file: 'a', sha: 'b', path_weight: -10 });
  assert.equal(result1.path_weight, 0);

  const result2 = normalizeChunkMetadata({ file: 'a', sha: 'b', path_weight: 5.5 });
  assert.equal(result2.path_weight, 5.5);
});

test('normalizeChunkMetadata clamps success_rate to 0-1 range', () => {
  const result1 = normalizeChunkMetadata({ file: 'a', sha: 'b', success_rate: -0.5 });
  assert.equal(result1.success_rate, 0);

  const result2 = normalizeChunkMetadata({ file: 'a', sha: 'b', success_rate: 2.0 });
  assert.equal(result2.success_rate, 1);

  const result3 = normalizeChunkMetadata({ file: 'a', sha: 'b', success_rate: 0.75 });
  assert.equal(result3.success_rate, 0.75);
});

test('normalizeChunkMetadata handles NaN success_rate', () => {
  const result = normalizeChunkMetadata({ file: 'a', sha: 'b', success_rate: NaN });
  assert.equal(result.success_rate, DEFAULT_SUCCESS_RATE);
});

test('normalizeChunkMetadata sanitizes variableCount', () => {
  const result1 = normalizeChunkMetadata({ file: 'a', sha: 'b', variableCount: -5 });
  assert.equal(result1.variableCount, 0);

  const result2 = normalizeChunkMetadata({ file: 'a', sha: 'b', variableCount: 3.7 });
  assert.equal(result2.variableCount, 4);

  const result3 = normalizeChunkMetadata({ file: 'a', sha: 'b', variableCount: 'invalid' });
  assert.equal(result3.variableCount, 0);

  const result4 = normalizeChunkMetadata({ file: 'a', sha: 'b', variableCount: Infinity });
  assert.equal(result4.variableCount, 0);
});

test('normalizeChunkMetadata sanitizes string arrays (synonyms, symbol_calls, etc.)', () => {
  const raw = {
    file: 'test.ts',
    sha: 'hash',
    synonyms: ['valid', 123, null, '', '  trimmed  ', 'duplicate', 'duplicate'],
    symbol_calls: ['funcA', 'funcB', 42],
    symbol_parameters: ['param1', 'param2']
  };

  const result = normalizeChunkMetadata(raw);

  assert.deepEqual(result.synonyms, ['valid', 'trimmed', 'duplicate']);
  assert.deepEqual(result.symbol_calls, ['funcA', 'funcB']);
  assert.deepEqual(result.symbol_parameters, ['param1', 'param2']);
});

test('normalizeChunkMetadata handles symbol_neighbors deduplication', () => {
  const raw = {
    file: 'test.ts',
    sha: 'hash',
    symbol_neighbors: ['neighbor1', 'neighbor1', 'neighbor2', '  neighbor3  ']
  };

  const result = normalizeChunkMetadata(raw);
  assert.deepEqual(result.symbol_neighbors, ['neighbor1', 'neighbor2', 'neighbor3']);
});

test('normalizeChunkMetadata handles last_used_at date parsing', () => {
  const validDate = '2024-01-15T10:30:00.000Z';
  const result1 = normalizeChunkMetadata({ file: 'a', sha: 'b', last_used_at: validDate });
  assert.equal(result1.last_used_at, validDate);

  const result2 = normalizeChunkMetadata({ file: 'a', sha: 'b', last_used_at: 'invalid-date' });
  assert.equal(result2.last_used_at, undefined);

  const result3 = normalizeChunkMetadata({ file: 'a', sha: 'b', last_used_at: null });
  assert.equal(result3.last_used_at, undefined);
});

test('normalizeChunkMetadata handles symbol_signature', () => {
  const result1 = normalizeChunkMetadata({ file: 'a', sha: 'b', symbol_signature: 'myFunc(a, b)' });
  assert.equal(result1.symbol_signature, 'myFunc(a, b)');

  const result2 = normalizeChunkMetadata({ file: 'a', sha: 'b', symbol_signature: '   ' });
  assert.equal(result2.symbol_signature, undefined);

  const result3 = normalizeChunkMetadata({ file: 'a', sha: 'b', symbol_signature: 123 });
  assert.equal(result3.symbol_signature, undefined);
});

test('normalizeChunkMetadata handles symbol_return', () => {
  const result1 = normalizeChunkMetadata({ file: 'a', sha: 'b', symbol_return: 'Promise<void>' });
  assert.equal(result1.symbol_return, 'Promise<void>');

  const result2 = normalizeChunkMetadata({ file: 'a', sha: 'b', symbol_return: '' });
  assert.equal(result2.symbol_return, undefined);
});

test('normalizeChunkMetadata preserves boolean fields', () => {
  const raw = {
    file: 'test.ts',
    sha: 'hash',
    hasCodevaultTags: true,
    hasIntent: true,
    hasDocumentation: true,
    encrypted: true
  };

  const result = normalizeChunkMetadata(raw);
  assert.equal(result.hasCodevaultTags, true);
  assert.equal(result.hasIntent, true);
  assert.equal(result.hasDocumentation, true);
  assert.equal(result.encrypted, true);
});

test('normalizeChunkMetadata defaults boolean fields to false', () => {
  const result = normalizeChunkMetadata({ file: 'a', sha: 'b' });
  assert.equal(result.hasCodevaultTags, false);
  assert.equal(result.hasIntent, false);
  assert.equal(result.hasDocumentation, false);
  assert.equal(result.encrypted, false);
});

test('normalizeChunkMetadata handles provider and dimensions', () => {
  const result1 = normalizeChunkMetadata({
    file: 'a',
    sha: 'b',
    provider: 'openai',
    dimensions: 1536
  });
  assert.equal(result1.provider, 'openai');
  assert.equal(result1.dimensions, 1536);

  const result2 = normalizeChunkMetadata({
    file: 'a',
    sha: 'b',
    provider: '',
    dimensions: NaN
  });
  assert.equal(result2.provider, undefined);
  assert.equal(result2.dimensions, undefined);
});

test('normalizeChunkMetadata preserves extra fields (passthrough)', () => {
  const raw = {
    file: 'test.ts',
    sha: 'hash',
    customField: 'customValue',
    anotherCustom: 42
  };

  const result = normalizeChunkMetadata(raw);
  assert.equal((result as Record<string, unknown>).customField, 'customValue');
  assert.equal((result as Record<string, unknown>).anotherCustom, 42);
});

test('normalizeChunkMetadata merges with previous chunk data', () => {
  const previous: CodemapChunk = {
    file: 'old.ts',
    sha: 'oldhash',
    symbol: 'oldSymbol',
    lang: 'typescript',
    path_weight: 2.0,
    success_rate: 0.8,
    symbol_neighbors: ['neighbor1']
  };

  const incoming = {
    sha: 'newhash',
    symbol: 'newSymbol'
  };

  const result = normalizeChunkMetadata(incoming, previous);

  assert.equal(result.file, 'old.ts');        // From previous
  assert.equal(result.sha, 'newhash');        // Overwritten
  assert.equal(result.symbol, 'newSymbol');   // Overwritten
  assert.equal(result.lang, 'typescript');    // From previous
  assert.equal(result.path_weight, 2.0);      // From previous
});

test('normalizeChunkMetadata handles null/undefined input', () => {
  const result1 = normalizeChunkMetadata(null);
  assert.equal(result1.file, 'unknown');
  assert.equal(result1.sha, 'unknown');

  const result2 = normalizeChunkMetadata(undefined);
  assert.equal(result2.file, 'unknown');
  assert.equal(result2.sha, 'unknown');
});

// ============================================================================
// normalizeCodemapRecord Tests
// ============================================================================

test('normalizeCodemapRecord handles empty input', () => {
  assert.deepEqual(normalizeCodemapRecord(null), {});
  assert.deepEqual(normalizeCodemapRecord(undefined), {});
  assert.deepEqual(normalizeCodemapRecord({}), {});
  assert.deepEqual(normalizeCodemapRecord('string'), {});
  assert.deepEqual(normalizeCodemapRecord(123), {});
});

test('normalizeCodemapRecord normalizes all chunks', () => {
  const raw = {
    'chunk1': { file: 'a.ts', sha: 'hash1', path_weight: -1 },
    'chunk2': { file: 'b.ts', sha: 'hash2', success_rate: 5 }
  };

  const result = normalizeCodemapRecord(raw);

  assert.equal(result.chunk1.path_weight, 0);
  assert.equal(result.chunk2.success_rate, 1);
});

test('normalizeCodemapRecord sorts chunks alphabetically by key', () => {
  const raw = {
    'z_chunk': { file: 'z.ts', sha: 'z' },
    'a_chunk': { file: 'a.ts', sha: 'a' },
    'm_chunk': { file: 'm.ts', sha: 'm' }
  };

  const result = normalizeCodemapRecord(raw);
  const keys = Object.keys(result);

  assert.deepEqual(keys, ['a_chunk', 'm_chunk', 'z_chunk']);
});

test('normalizeCodemapRecord filters out empty string keys', () => {
  const raw = {
    '': { file: 'empty.ts', sha: 'empty' },
    'valid': { file: 'valid.ts', sha: 'valid' }
  };

  const result = normalizeCodemapRecord(raw);

  assert.ok(!('' in result));
  assert.ok('valid' in result);
});

// ============================================================================
// attachSymbolGraphToCodemap Tests
// ============================================================================

test('attachSymbolGraphToCodemap handles null/undefined input', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assert.equal(attachSymbolGraphToCodemap(null as any), null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assert.equal(attachSymbolGraphToCodemap(undefined as any), undefined);
});

test('attachSymbolGraphToCodemap handles empty codemap', () => {
  const result = attachSymbolGraphToCodemap({});
  assert.deepEqual(result, {});
});

test('attachSymbolGraphToCodemap builds call targets from symbol_calls', () => {
  const codemap: Codemap = {
    'chunk1': {
      file: 'src/main.ts',
      sha: 'sha1',
      symbol: 'main',
      symbol_calls: ['helper'],
      symbol_neighbors: []
    },
    'chunk2': {
      file: 'src/utils.ts',
      sha: 'sha2',
      symbol: 'helper',
      symbol_calls: [],
      symbol_neighbors: []
    }
  };

  const result = attachSymbolGraphToCodemap(codemap);

  // chunk1 calls helper (chunk2)
  assert.deepEqual(result.chunk1.symbol_call_targets, ['sha2']);
  // chunk2 is called by chunk1
  assert.deepEqual(result.chunk2.symbol_callers, ['sha1']);
  // Both should have neighbors
  assert.ok(result.chunk1.symbol_neighbors?.includes('sha2'));
  assert.ok(result.chunk2.symbol_neighbors?.includes('sha1'));
});

test('attachSymbolGraphToCodemap handles case-insensitive symbol matching', () => {
  const codemap: Codemap = {
    'chunk1': {
      file: 'main.ts',
      sha: 'sha1',
      symbol: 'caller',
      symbol_calls: ['ProcessData'],  // Mixed case call
      symbol_neighbors: []
    },
    'chunk2': {
      file: 'utils.ts',
      sha: 'sha2',
      symbol: 'processData',          // camelCase definition
      symbol_calls: [],
      symbol_neighbors: []
    }
  };

  const result = attachSymbolGraphToCodemap(codemap);

  // Should match despite case difference
  assert.deepEqual(result.chunk1.symbol_call_targets, ['sha2']);
});

test('attachSymbolGraphToCodemap prefers same-file candidates', () => {
  const codemap: Codemap = {
    'chunk1': {
      file: 'src/main.ts',
      sha: 'sha1',
      symbol: 'caller',
      symbol_calls: ['helper'],
      symbol_neighbors: []
    },
    'chunk2': {
      file: 'src/main.ts',      // Same file as caller
      sha: 'sha2',
      symbol: 'helper',
      symbol_calls: [],
      symbol_neighbors: []
    },
    'chunk3': {
      file: 'src/other.ts',     // Different file
      sha: 'sha3',
      symbol: 'helper',         // Same symbol name
      symbol_calls: [],
      symbol_neighbors: []
    }
  };

  const result = attachSymbolGraphToCodemap(codemap);

  // Should prefer chunk2 (same file) over chunk3
  assert.deepEqual(result.chunk1.symbol_call_targets, ['sha2']);
});

test('attachSymbolGraphToCodemap ignores self-references', () => {
  const codemap: Codemap = {
    'chunk1': {
      file: 'main.ts',
      sha: 'sha1',
      symbol: 'recursive',
      symbol_calls: ['recursive'],  // Calls itself
      symbol_neighbors: []
    }
  };

  const result = attachSymbolGraphToCodemap(codemap);

  // Should not include self-reference
  assert.deepEqual(result.chunk1.symbol_call_targets, []);
  assert.deepEqual(result.chunk1.symbol_callers, []);
});

test('attachSymbolGraphToCodemap handles chunks without symbols', () => {
  const codemap: Codemap = {
    'chunk1': {
      file: 'main.ts',
      sha: 'sha1',
      symbol: null,
      symbol_calls: ['helper'],
      symbol_neighbors: []
    },
    'chunk2': {
      file: 'utils.ts',
      sha: 'sha2',
      symbol: 'helper',
      symbol_calls: [],
      symbol_neighbors: []
    }
  };

  const result = attachSymbolGraphToCodemap(codemap);

  // chunk1 can still call chunk2
  assert.deepEqual(result.chunk1.symbol_call_targets, ['sha2']);
});

test('attachSymbolGraphToCodemap handles missing symbol_calls array', () => {
  const codemap: Codemap = {
    'chunk1': {
      file: 'main.ts',
      sha: 'sha1',
      symbol: 'main',
      symbol_neighbors: []
      // symbol_calls is missing
    }
  };

  const result = attachSymbolGraphToCodemap(codemap);

  assert.deepEqual(result.chunk1.symbol_call_targets, []);
  assert.deepEqual(result.chunk1.symbol_callers, []);
});

test('attachSymbolGraphToCodemap handles complex call graph', () => {
  const codemap: Codemap = {
    'a': {
      file: 'a.ts',
      sha: 'sha_a',
      symbol: 'funcA',
      symbol_calls: ['funcB', 'funcC'],
      symbol_neighbors: []
    },
    'b': {
      file: 'b.ts',
      sha: 'sha_b',
      symbol: 'funcB',
      symbol_calls: ['funcC'],
      symbol_neighbors: []
    },
    'c': {
      file: 'c.ts',
      sha: 'sha_c',
      symbol: 'funcC',
      symbol_calls: [],
      symbol_neighbors: []
    }
  };

  const result = attachSymbolGraphToCodemap(codemap);

  // A calls B and C
  assert.ok(result.a.symbol_call_targets?.includes('sha_b'));
  assert.ok(result.a.symbol_call_targets?.includes('sha_c'));

  // B calls C
  assert.deepEqual(result.b.symbol_call_targets, ['sha_c']);

  // C is called by A and B
  assert.ok(result.c.symbol_callers?.includes('sha_a'));
  assert.ok(result.c.symbol_callers?.includes('sha_b'));

  // Neighbors include both incoming and outgoing
  assert.ok(result.c.symbol_neighbors?.includes('sha_a'));
  assert.ok(result.c.symbol_neighbors?.includes('sha_b'));
});

test('attachSymbolGraphToCodemap ignores empty symbol calls', () => {
  const codemap: Codemap = {
    'chunk1': {
      file: 'main.ts',
      sha: 'sha1',
      symbol: 'main',
      symbol_calls: ['', '  ', 'validCall'],
      symbol_neighbors: []
    },
    'chunk2': {
      file: 'utils.ts',
      sha: 'sha2',
      symbol: 'validCall',
      symbol_calls: [],
      symbol_neighbors: []
    }
  };

  const result = attachSymbolGraphToCodemap(codemap);

  // Should only resolve the valid call
  assert.deepEqual(result.chunk1.symbol_call_targets, ['sha2']);
});

test('attachSymbolGraphToCodemap handles unresolved calls gracefully', () => {
  const codemap: Codemap = {
    'chunk1': {
      file: 'main.ts',
      sha: 'sha1',
      symbol: 'main',
      symbol_calls: ['nonExistentFunc', 'anotherMissing'],
      symbol_neighbors: []
    }
  };

  const result = attachSymbolGraphToCodemap(codemap);

  // Unresolved calls should result in empty arrays
  assert.deepEqual(result.chunk1.symbol_call_targets, []);
  assert.deepEqual(result.chunk1.symbol_callers, []);
  assert.deepEqual(result.chunk1.symbol_neighbors, []);
});

// ============================================================================
// Round-trip Tests (Serialization/Deserialization)
// ============================================================================

test('round-trip: write and read codemap preserves data', async () => {
  const tempDir = createTempDir();
  try {
    const filePath = path.join(tempDir, 'roundtrip.json');
    const original: Codemap = {
      'chunk1': {
        file: 'src/main.ts',
        sha: 'abc123def456',
        symbol: 'processData',
        lang: 'typescript',
        chunkType: 'function',
        provider: 'openai',
        dimensions: 1536,
        hasCodevaultTags: true,
        hasIntent: false,
        hasDocumentation: true,
        variableCount: 5,
        synonyms: ['process', 'handle', 'transform'],
        path_weight: 1.5,
        success_rate: 0.85,
        encrypted: false,
        symbol_signature: 'processData(input: string): Promise<Result>',
        symbol_parameters: ['input'],
        symbol_return: 'Promise<Result>',
        symbol_calls: ['validate', 'transform', 'save'],
        symbol_call_targets: ['sha_validate', 'sha_transform', 'sha_save'],
        symbol_callers: ['sha_main'],
        symbol_neighbors: ['sha_validate', 'sha_transform', 'sha_save', 'sha_main']
      }
    };

    writeCodemap(filePath, original);
    const loaded = readCodemap(filePath);

    assert.equal(loaded.chunk1.file, original.chunk1.file);
    assert.equal(loaded.chunk1.sha, original.chunk1.sha);
    assert.equal(loaded.chunk1.symbol, original.chunk1.symbol);
    assert.equal(loaded.chunk1.lang, original.chunk1.lang);
    assert.equal(loaded.chunk1.provider, original.chunk1.provider);
    assert.equal(loaded.chunk1.dimensions, original.chunk1.dimensions);
    assert.equal(loaded.chunk1.path_weight, original.chunk1.path_weight);
    assert.equal(loaded.chunk1.success_rate, original.chunk1.success_rate);
    assert.deepEqual(loaded.chunk1.synonyms, original.chunk1.synonyms);
    assert.deepEqual(loaded.chunk1.symbol_parameters, original.chunk1.symbol_parameters);
    assert.deepEqual(loaded.chunk1.symbol_calls, original.chunk1.symbol_calls);
  } finally {
    cleanup(tempDir);
  }
});

test('round-trip async: write and read codemap preserves data', async () => {
  const tempDir = createTempDir();
  try {
    const filePath = path.join(tempDir, 'roundtrip-async.json');
    const original: Codemap = {
      'async_chunk': {
        file: 'async.ts',
        sha: 'asynchash123',
        symbol: 'asyncFunc',
        symbol_neighbors: ['neighbor1', 'neighbor2']
      }
    };

    await writeCodemapAsync(filePath, original);
    const loaded = await readCodemapAsync(filePath);

    assert.equal(loaded.async_chunk.file, original.async_chunk.file);
    assert.equal(loaded.async_chunk.sha, original.async_chunk.sha);
    assert.deepEqual(loaded.async_chunk.symbol_neighbors, original.async_chunk.symbol_neighbors);
  } finally {
    cleanup(tempDir);
  }
});

// ============================================================================
// Cross-file Reference Tests
// ============================================================================

test('cross-file references: complete workflow', () => {
  const codemap: Codemap = {
    'user_service': {
      file: 'src/services/user.ts',
      sha: 'sha_user',
      symbol: 'UserService',
      symbol_calls: ['validateUser', 'saveToDatabase', 'sendNotification'],
      symbol_neighbors: []
    },
    'validator': {
      file: 'src/utils/validator.ts',
      sha: 'sha_validator',
      symbol: 'validateUser',
      symbol_calls: [],
      symbol_neighbors: []
    },
    'database': {
      file: 'src/database/db.ts',
      sha: 'sha_db',
      symbol: 'saveToDatabase',
      symbol_calls: ['connect', 'query'],
      symbol_neighbors: []
    },
    'notifier': {
      file: 'src/services/notification.ts',
      sha: 'sha_notifier',
      symbol: 'sendNotification',
      symbol_calls: ['validateUser'],  // Also calls validator
      symbol_neighbors: []
    }
  };

  const result = attachSymbolGraphToCodemap(codemap);

  // UserService should call all three
  assert.ok(result.user_service.symbol_call_targets?.includes('sha_validator'));
  assert.ok(result.user_service.symbol_call_targets?.includes('sha_db'));
  assert.ok(result.user_service.symbol_call_targets?.includes('sha_notifier'));

  // Validator is called by UserService and Notifier
  assert.ok(result.validator.symbol_callers?.includes('sha_user'));
  assert.ok(result.validator.symbol_callers?.includes('sha_notifier'));

  // Validator's neighbors should include both callers
  assert.ok(result.validator.symbol_neighbors?.includes('sha_user'));
  assert.ok(result.validator.symbol_neighbors?.includes('sha_notifier'));
});

test('cross-file references: bidirectional relationships', () => {
  const codemap: Codemap = {
    'module_a': {
      file: 'a.ts',
      sha: 'sha_a',
      symbol: 'moduleA',
      symbol_calls: ['moduleB'],
      symbol_neighbors: []
    },
    'module_b': {
      file: 'b.ts',
      sha: 'sha_b',
      symbol: 'moduleB',
      symbol_calls: ['moduleA'],  // Calls back to A
      symbol_neighbors: []
    }
  };

  const result = attachSymbolGraphToCodemap(codemap);

  // A calls B
  assert.deepEqual(result.module_a.symbol_call_targets, ['sha_b']);
  // B calls A
  assert.deepEqual(result.module_b.symbol_call_targets, ['sha_a']);

  // A is called by B
  assert.deepEqual(result.module_a.symbol_callers, ['sha_b']);
  // B is called by A
  assert.deepEqual(result.module_b.symbol_callers, ['sha_a']);

  // Neighbors should be bidirectional
  assert.deepEqual(result.module_a.symbol_neighbors, ['sha_b']);
  assert.deepEqual(result.module_b.symbol_neighbors, ['sha_a']);
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

test('edge case: codemap with invalid entries is handled gracefully', () => {
  const codemap = {
    'valid': {
      file: 'valid.ts',
      sha: 'valid_sha',
      symbol: 'validFunc',
      symbol_calls: [],
      symbol_neighbors: []
    },
    'invalid1': null,
    'invalid2': 'not an object',
    'invalid3': { noSha: true }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = attachSymbolGraphToCodemap(codemap as any);

  // Valid entry should still work
  assert.equal(result.valid.file, 'valid.ts');
});

test('edge case: very long symbol names', () => {
  const longSymbol = 'a'.repeat(1000);
  const codemap: Codemap = {
    'chunk1': {
      file: 'test.ts',
      sha: 'sha1',
      symbol: longSymbol,
      symbol_calls: [longSymbol],  // Self-reference should be ignored
      symbol_neighbors: []
    }
  };

  const result = attachSymbolGraphToCodemap(codemap);
  assert.equal(result.chunk1.symbol, longSymbol);
  assert.deepEqual(result.chunk1.symbol_call_targets, []);
});

test('edge case: unicode in symbol names', () => {
  const codemap: Codemap = {
    'chunk1': {
      file: 'test.ts',
      sha: 'sha1',
      symbol: 'process_data',
      symbol_calls: ['helper_func'],
      symbol_neighbors: []
    },
    'chunk2': {
      file: 'test.ts',
      sha: 'sha2',
      symbol: 'helper_func',
      symbol_calls: [],
      symbol_neighbors: []
    }
  };

  const result = attachSymbolGraphToCodemap(codemap);
  assert.deepEqual(result.chunk1.symbol_call_targets, ['sha2']);
});

test('edge case: special characters in file paths', () => {
  const result = normalizeChunkMetadata({
    file: 'src/components/my-component (copy).tsx',
    sha: 'hash123'
  });

  assert.equal(result.file, 'src/components/my-component (copy).tsx');
});

test('edge case: whitespace-only symbol', () => {
  const result = normalizeChunkMetadata({
    file: 'test.ts',
    sha: 'hash',
    symbol: '   '
  });

  assert.equal(result.symbol, null);
});

test('edge case: large codemap performance', () => {
  const largeCodemap: Codemap = {};

  // Create 100 chunks
  for (let i = 0; i < 100; i++) {
    largeCodemap[`chunk_${i}`] = {
      file: `src/file_${i}.ts`,
      sha: `sha_${i}`,
      symbol: `func_${i}`,
      symbol_calls: i > 0 ? [`func_${i - 1}`] : [],
      symbol_neighbors: []
    };
  }

  const startTime = Date.now();
  const result = attachSymbolGraphToCodemap(largeCodemap);
  const duration = Date.now() - startTime;

  // Should complete in reasonable time (less than 1 second)
  assert.ok(duration < 1000, `Large codemap took ${duration}ms`);

  // Verify chain is built correctly
  assert.deepEqual(result.chunk_1.symbol_call_targets, ['sha_0']);
  assert.deepEqual(result.chunk_99.symbol_call_targets, ['sha_98']);
});
