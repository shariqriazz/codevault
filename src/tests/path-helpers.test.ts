import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { resolveProjectRoot, withQuietLogs } from '../utils/path-helpers.js';

// ============================================================================
// resolveProjectRoot Tests - Basic Input Handling
// ============================================================================

test('resolveProjectRoot returns cwd when input is undefined', () => {
  const result = resolveProjectRoot();
  // Should resolve to current working directory
  assert.ok(result.length > 0);
  assert.ok(path.isAbsolute(result));
});

test('resolveProjectRoot returns cwd when input is empty object', () => {
  const result = resolveProjectRoot({});
  assert.ok(result.length > 0);
  assert.ok(path.isAbsolute(result));
});

test('resolveProjectRoot uses project property when provided', () => {
  const cwd = process.cwd();
  const result = resolveProjectRoot({ project: '.' });
  assert.ok(result.startsWith(cwd) || result === cwd);
});

test('resolveProjectRoot uses directory property when project not provided', () => {
  const cwd = process.cwd();
  const result = resolveProjectRoot({ directory: '.' });
  assert.ok(result.startsWith(cwd) || result === cwd);
});

test('resolveProjectRoot uses path property when others not provided', () => {
  const cwd = process.cwd();
  const result = resolveProjectRoot({ path: '.' });
  assert.ok(result.startsWith(cwd) || result === cwd);
});

test('resolveProjectRoot prioritizes project over directory and path', () => {
  const cwd = process.cwd();
  const result = resolveProjectRoot({
    project: '.',
    directory: '..',
    path: '../..'
  });
  // Should use project (.) which resolves to cwd
  assert.ok(result === cwd || result.endsWith(path.basename(cwd)));
});

test('resolveProjectRoot prioritizes directory over path', () => {
  const cwd = process.cwd();
  const result = resolveProjectRoot({
    directory: '.',
    path: '..'
  });
  // Should use directory (.) which resolves to cwd
  assert.ok(result === cwd || result.endsWith(path.basename(cwd)));
});

// ============================================================================
// resolveProjectRoot Tests - Path Trimming and Normalization
// ============================================================================

test('resolveProjectRoot trims whitespace from paths', () => {
  const cwd = process.cwd();
  const result = resolveProjectRoot({ project: '  .  ' });
  assert.ok(result === cwd || result.endsWith(path.basename(cwd)));
});

test('resolveProjectRoot handles empty string as default', () => {
  const cwd = process.cwd();
  const result = resolveProjectRoot({ project: '' });
  assert.ok(result === cwd || result.endsWith(path.basename(cwd)));
});

test('resolveProjectRoot handles whitespace-only string as default', () => {
  const cwd = process.cwd();
  const result = resolveProjectRoot({ project: '   ' });
  assert.ok(result === cwd || result.endsWith(path.basename(cwd)));
});

// ============================================================================
// resolveProjectRoot Tests - Valid Subdirectory Paths
// ============================================================================

test('resolveProjectRoot resolves valid subdirectory', () => {
  const cwd = process.cwd();
  // Use a known subdirectory that exists in this project
  const srcPath = path.join(cwd, 'src');
  if (fs.existsSync(srcPath)) {
    const result = resolveProjectRoot({ project: 'src' });
    assert.ok(result.endsWith('src'));
    assert.ok(path.isAbsolute(result));
  }
});

test('resolveProjectRoot resolves nested valid subdirectory', () => {
  const cwd = process.cwd();
  const utilsPath = path.join(cwd, 'src', 'utils');
  if (fs.existsSync(utilsPath)) {
    const result = resolveProjectRoot({ project: 'src/utils' });
    assert.ok(result.endsWith('utils'));
    assert.ok(path.isAbsolute(result));
  }
});

// ============================================================================
// resolveProjectRoot Tests - Path Validation (Security)
// ============================================================================

test('resolveProjectRoot throws on path traversal outside project', () => {
  assert.throws(
    () => resolveProjectRoot({ project: '../../../outside-project' }),
    (error: Error & { code?: string }) => {
      return error.code === 'PATH_VALIDATION_FAILED' ||
             error.message.includes('outside the project root');
    }
  );
});

test('resolveProjectRoot throws on absolute path outside project', () => {
  // Use a path that is definitely outside the project
  const outsidePath = os.tmpdir();
  assert.throws(
    () => resolveProjectRoot({ project: outsidePath }),
    (error: Error & { code?: string }) => {
      return error.code === 'PATH_VALIDATION_FAILED' ||
             error.message.includes('outside the project root');
    }
  );
});

test('resolveProjectRoot error has PATH_VALIDATION_FAILED code', () => {
  try {
    resolveProjectRoot({ project: '../../../outside-project' });
    assert.fail('Should have thrown');
  } catch (error) {
    const typedError = error as Error & { code?: string };
    assert.equal(typedError.code, 'PATH_VALIDATION_FAILED');
  }
});

// ============================================================================
// resolveProjectRoot Tests - Non-existent Paths
// ============================================================================

test('resolveProjectRoot handles non-existent but safe path', () => {
  // A path that doesn't exist but is within project root
  const nonExistentPath = 'this-directory-does-not-exist-xyz123';
  const result = resolveProjectRoot({ project: nonExistentPath });
  assert.ok(result.endsWith(nonExistentPath));
  assert.ok(path.isAbsolute(result));
});

// ============================================================================
// withQuietLogs Tests - Basic Functionality
// ============================================================================

test('withQuietLogs sets CODEVAULT_QUIET to true during execution', async () => {
  const originalQuiet = process.env.CODEVAULT_QUIET;

  let quietDuringExecution: string | undefined;
  await withQuietLogs(async () => {
    quietDuringExecution = process.env.CODEVAULT_QUIET;
    return 'result';
  });

  assert.equal(quietDuringExecution, 'true');

  // Verify original is restored
  assert.equal(process.env.CODEVAULT_QUIET, originalQuiet);
});

test('withQuietLogs returns function result', async () => {
  const result = await withQuietLogs(async () => {
    return 42;
  });

  assert.equal(result, 42);
});

test('withQuietLogs returns complex object result', async () => {
  const result = await withQuietLogs(async () => {
    return { key: 'value', nested: { data: [1, 2, 3] } };
  });

  assert.deepEqual(result, { key: 'value', nested: { data: [1, 2, 3] } });
});

test('withQuietLogs restores CODEVAULT_QUIET on success', async () => {
  const originalQuiet = process.env.CODEVAULT_QUIET;

  await withQuietLogs(async () => 'done');

  assert.equal(process.env.CODEVAULT_QUIET, originalQuiet);
});

test('withQuietLogs restores CODEVAULT_QUIET on error', async () => {
  const originalQuiet = process.env.CODEVAULT_QUIET;

  await assert.rejects(
    withQuietLogs(async () => {
      throw new Error('Function failed');
    }),
    { message: 'Function failed' }
  );

  assert.equal(process.env.CODEVAULT_QUIET, originalQuiet);
});

test('withQuietLogs preserves existing CODEVAULT_QUIET value', async () => {
  process.env.CODEVAULT_QUIET = 'false';

  await withQuietLogs(async () => 'done');

  assert.equal(process.env.CODEVAULT_QUIET, 'false');

  delete process.env.CODEVAULT_QUIET;
});

test('withQuietLogs deletes CODEVAULT_QUIET if originally undefined', async () => {
  const originalQuiet = process.env.CODEVAULT_QUIET;
  delete process.env.CODEVAULT_QUIET;

  await withQuietLogs(async () => 'done');

  assert.equal(process.env.CODEVAULT_QUIET, undefined);

  // Restore
  if (originalQuiet !== undefined) {
    process.env.CODEVAULT_QUIET = originalQuiet;
  }
});

// ============================================================================
// withQuietLogs Tests - cacheModelProfile Option
// ============================================================================

test('withQuietLogs sets CODEVAULT_MODEL_PROFILE_CACHED when option enabled', async () => {
  const originalCache = process.env.CODEVAULT_MODEL_PROFILE_CACHED;

  let cacheDuringExecution: string | undefined;
  await withQuietLogs(async () => {
    cacheDuringExecution = process.env.CODEVAULT_MODEL_PROFILE_CACHED;
    return 'result';
  }, { cacheModelProfile: true });

  assert.equal(cacheDuringExecution, 'true');

  // Verify original is restored
  assert.equal(process.env.CODEVAULT_MODEL_PROFILE_CACHED, originalCache);
});

test('withQuietLogs does not set CODEVAULT_MODEL_PROFILE_CACHED without option', async () => {
  const originalCache = process.env.CODEVAULT_MODEL_PROFILE_CACHED;
  delete process.env.CODEVAULT_MODEL_PROFILE_CACHED;

  let cacheDuringExecution: string | undefined;
  await withQuietLogs(async () => {
    cacheDuringExecution = process.env.CODEVAULT_MODEL_PROFILE_CACHED;
    return 'result';
  });

  assert.equal(cacheDuringExecution, undefined);

  // Restore
  if (originalCache !== undefined) {
    process.env.CODEVAULT_MODEL_PROFILE_CACHED = originalCache;
  }
});

test('withQuietLogs restores CODEVAULT_MODEL_PROFILE_CACHED on success', async () => {
  process.env.CODEVAULT_MODEL_PROFILE_CACHED = 'false';

  await withQuietLogs(async () => 'done', { cacheModelProfile: true });

  assert.equal(process.env.CODEVAULT_MODEL_PROFILE_CACHED, 'false');

  delete process.env.CODEVAULT_MODEL_PROFILE_CACHED;
});

test('withQuietLogs restores CODEVAULT_MODEL_PROFILE_CACHED on error', async () => {
  process.env.CODEVAULT_MODEL_PROFILE_CACHED = 'false';

  await assert.rejects(
    withQuietLogs(async () => {
      throw new Error('Function failed');
    }, { cacheModelProfile: true }),
    { message: 'Function failed' }
  );

  assert.equal(process.env.CODEVAULT_MODEL_PROFILE_CACHED, 'false');

  delete process.env.CODEVAULT_MODEL_PROFILE_CACHED;
});

test('withQuietLogs deletes CODEVAULT_MODEL_PROFILE_CACHED if originally undefined', async () => {
  const originalCache = process.env.CODEVAULT_MODEL_PROFILE_CACHED;
  delete process.env.CODEVAULT_MODEL_PROFILE_CACHED;

  await withQuietLogs(async () => 'done', { cacheModelProfile: true });

  assert.equal(process.env.CODEVAULT_MODEL_PROFILE_CACHED, undefined);

  // Restore
  if (originalCache !== undefined) {
    process.env.CODEVAULT_MODEL_PROFILE_CACHED = originalCache;
  }
});

// ============================================================================
// withQuietLogs Tests - Async Behavior
// ============================================================================

test('withQuietLogs handles async delays', async () => {
  const start = Date.now();

  await withQuietLogs(async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
    return 'delayed';
  });

  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 45, `Expected >= 45ms but got ${elapsed}ms`);
});

test('withQuietLogs handles multiple concurrent calls', async () => {
  const results = await Promise.all([
    withQuietLogs(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      return 1;
    }),
    withQuietLogs(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return 2;
    }),
    withQuietLogs(async () => {
      await new Promise(resolve => setTimeout(resolve, 30));
      return 3;
    }),
  ]);

  assert.deepEqual(results, [1, 2, 3]);
});

// ============================================================================
// withQuietLogs Tests - Edge Cases
// ============================================================================

test('withQuietLogs handles undefined return value', async () => {
  const result = await withQuietLogs(async () => {
    return undefined;
  });

  assert.equal(result, undefined);
});

test('withQuietLogs handles null return value', async () => {
  const result = await withQuietLogs(async () => {
    return null;
  });

  assert.equal(result, null);
});

test('withQuietLogs handles void function', async () => {
  let sideEffect = false;
  await withQuietLogs(async () => {
    sideEffect = true;
  });

  assert.equal(sideEffect, true);
});

test('withQuietLogs handles function that throws non-Error', async () => {
  await assert.rejects(
    withQuietLogs(async () => {
      throw 'string error';
    })
  );
});

test('withQuietLogs handles empty options object', async () => {
  const result = await withQuietLogs(async () => 42, {});
  assert.equal(result, 42);
});

test('withQuietLogs handles cacheModelProfile false explicitly', async () => {
  const originalCache = process.env.CODEVAULT_MODEL_PROFILE_CACHED;
  delete process.env.CODEVAULT_MODEL_PROFILE_CACHED;

  let cacheDuringExecution: string | undefined;
  await withQuietLogs(async () => {
    cacheDuringExecution = process.env.CODEVAULT_MODEL_PROFILE_CACHED;
    return 'result';
  }, { cacheModelProfile: false });

  // Should not be set when explicitly false
  assert.equal(cacheDuringExecution, undefined);

  // Restore
  if (originalCache !== undefined) {
    process.env.CODEVAULT_MODEL_PROFILE_CACHED = originalCache;
  }
});

// ============================================================================
// Cross-Platform Path Tests
// ============================================================================

test('resolveProjectRoot produces absolute paths', () => {
  const result = resolveProjectRoot({ project: '.' });
  assert.ok(path.isAbsolute(result));
});

test('resolveProjectRoot normalizes path separators', () => {
  const result = resolveProjectRoot({ project: '.' });
  // Result should not contain mixed separators
  assert.ok(!result.includes('//'));
});

test('resolveProjectRoot handles current directory consistently', () => {
  const result1 = resolveProjectRoot({ project: '.' });
  const result2 = resolveProjectRoot({ directory: '.' });
  const result3 = resolveProjectRoot({ path: '.' });

  assert.equal(result1, result2);
  assert.equal(result2, result3);
});
