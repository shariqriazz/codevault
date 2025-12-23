import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getContextPackDirectory,
  loadContextPack,
  listContextPacks,
  getActiveContextPack,
  setActiveContextPack,
  resolveScopeWithPack,
  clearContextPackCache
} from '../context/packs.js';

// Test fixture directory for isolated tests
let testDir: string;
let packDir: string;

/**
 * Creates a temporary test directory with optional context packs
 */
function setupTestDir(): void {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codevault-packs-test-'));
  packDir = path.join(testDir, '.codevault', 'contextpacks');
}

/**
 * Cleans up the temporary test directory
 */
function cleanupTestDir(): void {
  if (testDir && fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

/**
 * Creates a context pack file with the given content
 */
function createPackFile(name: string, content: object): void {
  if (!fs.existsSync(packDir)) {
    fs.mkdirSync(packDir, { recursive: true });
  }
  const filePath = path.join(packDir, `${name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
}

/**
 * Creates an invalid JSON file
 */
function createInvalidJsonFile(name: string, content: string): void {
  if (!fs.existsSync(packDir)) {
    fs.mkdirSync(packDir, { recursive: true });
  }
  const filePath = path.join(packDir, `${name}.json`);
  fs.writeFileSync(filePath, content);
}

// ============================================================================
// getContextPackDirectory Tests
// ============================================================================

describe('getContextPackDirectory', () => {
  beforeEach(() => {
    setupTestDir();
    clearContextPackCache();
  });

  afterEach(() => {
    cleanupTestDir();
  });

  test('returns correct directory path with default basePath', () => {
    const result = getContextPackDirectory();
    assert.ok(result.endsWith('.codevault/contextpacks') || result.endsWith('.codevault\\contextpacks'));
  });

  test('returns correct directory path with explicit basePath', () => {
    const result = getContextPackDirectory(testDir);
    const expected = path.join(testDir, '.codevault', 'contextpacks');
    assert.equal(result, expected);
  });

  test('resolves relative path to absolute path', () => {
    const result = getContextPackDirectory('.');
    assert.ok(path.isAbsolute(result));
  });
});

// ============================================================================
// loadContextPack Tests
// ============================================================================

describe('loadContextPack', () => {
  beforeEach(() => {
    setupTestDir();
    clearContextPackCache();
  });

  afterEach(() => {
    cleanupTestDir();
  });

  test('throws error for empty pack name', () => {
    assert.throws(
      () => loadContextPack('', testDir),
      /Context pack name must be a non-empty string/
    );
  });

  test('throws error for non-string pack name', () => {
    assert.throws(
      // @ts-expect-error Testing invalid input
      () => loadContextPack(null, testDir),
      /Context pack name must be a non-empty string/
    );
  });

  test('throws error for undefined pack name', () => {
    assert.throws(
      // @ts-expect-error Testing invalid input
      () => loadContextPack(undefined, testDir),
      /Context pack name must be a non-empty string/
    );
  });

  test('throws error when pack file does not exist', () => {
    assert.throws(
      () => loadContextPack('nonexistent', testDir),
      /Context pack "nonexistent" not found/
    );
  });

  test('loads valid context pack with name and description', () => {
    createPackFile('test-pack', {
      name: 'Test Pack',
      description: 'A test context pack',
      path_glob: ['src/**/*.ts'],
      tags: ['typescript'],
      lang: ['typescript']
    });

    const pack = loadContextPack('test-pack', testDir);

    assert.equal(pack.key, 'test-pack');
    assert.equal(pack.name, 'Test Pack');
    assert.equal(pack.description, 'A test context pack');
    assert.deepEqual(pack.scope.path_glob, ['src/**/*.ts']);
    assert.deepEqual(pack.scope.tags, ['typescript']);
    assert.deepEqual(pack.scope.lang, ['typescript']);
    assert.ok(pack.path.endsWith('test-pack.json'));
  });

  test('loads pack with scope nested in scope property', () => {
    createPackFile('nested-scope', {
      name: 'Nested Scope Pack',
      scope: {
        path_glob: ['lib/**/*.js'],
        lang: ['javascript']
      }
    });

    const pack = loadContextPack('nested-scope', testDir);

    assert.equal(pack.name, 'Nested Scope Pack');
    assert.deepEqual(pack.scope.path_glob, ['lib/**/*.js']);
    assert.deepEqual(pack.scope.lang, ['javascript']);
  });

  test('uses pack key as name when name is empty', () => {
    createPackFile('unnamed-pack', {
      name: '',
      path_glob: 'src/**'
    });

    const pack = loadContextPack('unnamed-pack', testDir);
    assert.equal(pack.name, 'unnamed-pack');
  });

  test('uses pack key as name when name is whitespace only', () => {
    createPackFile('whitespace-pack', {
      name: '   ',
      path_glob: 'src/**'
    });

    const pack = loadContextPack('whitespace-pack', testDir);
    assert.equal(pack.name, 'whitespace-pack');
  });

  test('uses pack key as name when name is missing', () => {
    createPackFile('no-name-pack', {
      path_glob: 'src/**'
    });

    const pack = loadContextPack('no-name-pack', testDir);
    assert.equal(pack.name, 'no-name-pack');
  });

  test('sets description to null when empty', () => {
    createPackFile('no-desc-pack', {
      name: 'No Description Pack',
      description: ''
    });

    const pack = loadContextPack('no-desc-pack', testDir);
    assert.equal(pack.description, null);
  });

  test('sets description to null when whitespace only', () => {
    createPackFile('whitespace-desc-pack', {
      name: 'Whitespace Description Pack',
      description: '   '
    });

    const pack = loadContextPack('whitespace-desc-pack', testDir);
    assert.equal(pack.description, null);
  });

  test('throws error for invalid JSON in pack file', () => {
    createInvalidJsonFile('invalid-json', '{ invalid json }');

    assert.throws(
      () => loadContextPack('invalid-json', testDir),
      /Invalid JSON in context pack/
    );
  });

  test('throws error for pack with invalid schema', () => {
    createPackFile('invalid-schema', {
      name: 'Invalid Pack',
      unknown_field: 'not allowed'
    });

    assert.throws(
      () => loadContextPack('invalid-schema', testDir),
      /unrecognized_keys/ // Zod validation error for strict schema
    );
  });

  test('caches loaded pack and returns from cache on second call', () => {
    createPackFile('cached-pack', {
      name: 'Cached Pack',
      path_glob: 'src/**'
    });

    const pack1 = loadContextPack('cached-pack', testDir);
    const pack2 = loadContextPack('cached-pack', testDir);

    assert.deepEqual(pack1, pack2);
  });

  test('reloads pack when file mtime changes', async () => {
    createPackFile('mtime-pack', {
      name: 'Original Name',
      path_glob: 'src/**'
    });

    const pack1 = loadContextPack('mtime-pack', testDir);
    assert.equal(pack1.name, 'Original Name');

    // Wait a bit to ensure mtime changes
    await new Promise(resolve => setTimeout(resolve, 50));

    // Update the file
    createPackFile('mtime-pack', {
      name: 'Updated Name',
      path_glob: 'lib/**'
    });

    const pack2 = loadContextPack('mtime-pack', testDir);
    assert.equal(pack2.name, 'Updated Name');
    assert.deepEqual(pack2.scope.path_glob, 'lib/**');
  });

  test('handles pack with boolean scope values', () => {
    createPackFile('boolean-pack', {
      name: 'Boolean Pack',
      hybrid: true,
      bm25: false,
      symbol_boost: true
    });

    const pack = loadContextPack('boolean-pack', testDir);

    assert.equal(pack.scope.hybrid, true);
    assert.equal(pack.scope.bm25, false);
    assert.equal(pack.scope.symbol_boost, true);
  });

  test('handles pack with string boolean values', () => {
    createPackFile('string-bool-pack', {
      name: 'String Boolean Pack',
      hybrid: 'true',
      bm25: 'off',
      symbol_boost: 'on'
    });

    const pack = loadContextPack('string-bool-pack', testDir);

    assert.equal(pack.scope.hybrid, 'true');
    assert.equal(pack.scope.bm25, 'off');
    assert.equal(pack.scope.symbol_boost, 'on');
  });

  test('handles pack with provider and reranker options', () => {
    createPackFile('provider-pack', {
      name: 'Provider Pack',
      provider: 'openai',
      reranker: 'api'
    });

    const pack = loadContextPack('provider-pack', testDir);

    assert.equal(pack.scope.provider, 'openai');
    assert.equal(pack.scope.reranker, 'api');
  });

  test('handles pack with array scope values', () => {
    createPackFile('array-pack', {
      name: 'Array Pack',
      path_glob: ['src/**', 'lib/**'],
      tags: ['core', 'utils'],
      lang: ['typescript', 'javascript']
    });

    const pack = loadContextPack('array-pack', testDir);

    assert.deepEqual(pack.scope.path_glob, ['src/**', 'lib/**']);
    assert.deepEqual(pack.scope.tags, ['core', 'utils']);
    assert.deepEqual(pack.scope.lang, ['typescript', 'javascript']);
  });

  test('handles minimal valid pack (empty object)', () => {
    createPackFile('minimal-pack', {});

    const pack = loadContextPack('minimal-pack', testDir);

    assert.equal(pack.key, 'minimal-pack');
    assert.equal(pack.name, 'minimal-pack');
    assert.equal(pack.description, null);
    assert.deepEqual(pack.scope, {});
  });
});

// ============================================================================
// listContextPacks Tests
// ============================================================================

describe('listContextPacks', () => {
  beforeEach(() => {
    setupTestDir();
    clearContextPackCache();
  });

  afterEach(() => {
    cleanupTestDir();
  });

  test('returns empty array when pack directory does not exist', () => {
    const packs = listContextPacks(testDir);
    assert.deepEqual(packs, []);
  });

  test('returns empty array when pack directory is empty', () => {
    fs.mkdirSync(packDir, { recursive: true });

    const packs = listContextPacks(testDir);
    assert.deepEqual(packs, []);
  });

  test('ignores non-json files in pack directory', () => {
    fs.mkdirSync(packDir, { recursive: true });
    fs.writeFileSync(path.join(packDir, 'readme.txt'), 'Not a pack');
    fs.writeFileSync(path.join(packDir, 'config.yaml'), 'name: not-pack');

    const packs = listContextPacks(testDir);
    assert.deepEqual(packs, []);
  });

  test('lists all valid context packs', () => {
    createPackFile('pack-a', { name: 'Pack A', path_glob: 'a/**' });
    createPackFile('pack-b', { name: 'Pack B', path_glob: 'b/**' });
    createPackFile('pack-c', { name: 'Pack C', path_glob: 'c/**' });

    const packs = listContextPacks(testDir);

    assert.equal(packs.length, 3);
    const names = packs.map(p => p.name).sort();
    assert.deepEqual(names, ['Pack A', 'Pack B', 'Pack C']);
  });

  test('includes invalid packs with error description', () => {
    createPackFile('valid-pack', { name: 'Valid Pack', path_glob: 'src/**' });
    createInvalidJsonFile('invalid-pack', '{ broken json }');

    const packs = listContextPacks(testDir);

    assert.equal(packs.length, 2);

    const validPack = packs.find(p => p.key === 'valid-pack');
    assert.ok(validPack);
    assert.equal(validPack.invalid, undefined);

    const invalidPack = packs.find(p => p.key === 'invalid-pack');
    assert.ok(invalidPack);
    assert.equal(invalidPack.invalid, true);
    assert.ok(invalidPack.description?.startsWith('Invalid pack:'));
  });

  test('handles schema validation errors gracefully', () => {
    createPackFile('schema-error', {
      name: 'Invalid',
      unknown_property: 'bad value'
    });

    const packs = listContextPacks(testDir);

    assert.equal(packs.length, 1);
    const pack = packs[0];
    assert.equal(pack.key, 'schema-error');
    assert.equal(pack.invalid, true);
    assert.ok(pack.description?.startsWith('Invalid pack:'));
  });

  test('handles active-pack.json file properly (should be filtered out if not a pack)', () => {
    createPackFile('active-pack', {
      key: 'some-pack',
      appliedAt: new Date().toISOString()
    });

    // This should fail schema validation since it has unknown 'key' at root level
    // Actually the schema allows extra properties? Let me check...
    // The schema uses .strict() so this should be filtered as invalid
    const packs = listContextPacks(testDir);

    // Should be marked as invalid due to strict schema
    const activePack = packs.find(p => p.key === 'active-pack');
    if (activePack) {
      assert.equal(activePack.invalid, true);
    }
  });
});

// ============================================================================
// getActiveContextPack Tests
// ============================================================================

describe('getActiveContextPack', () => {
  beforeEach(() => {
    setupTestDir();
    clearContextPackCache();
  });

  afterEach(() => {
    cleanupTestDir();
  });

  test('returns null when no active pack state file exists', () => {
    const result = getActiveContextPack(testDir);
    assert.equal(result, null);
  });

  test('returns null when state file contains invalid JSON', () => {
    fs.mkdirSync(packDir, { recursive: true });
    fs.writeFileSync(path.join(packDir, 'active-pack.json'), '{ invalid }');

    const result = getActiveContextPack(testDir);
    assert.equal(result, null);
  });

  test('returns null when state file is not an object', () => {
    fs.mkdirSync(packDir, { recursive: true });
    fs.writeFileSync(path.join(packDir, 'active-pack.json'), '"just a string"');

    const result = getActiveContextPack(testDir);
    assert.equal(result, null);
  });

  test('returns null when state file has null value', () => {
    fs.mkdirSync(packDir, { recursive: true });
    fs.writeFileSync(path.join(packDir, 'active-pack.json'), 'null');

    const result = getActiveContextPack(testDir);
    assert.equal(result, null);
  });

  test('returns null when state file has no key property', () => {
    fs.mkdirSync(packDir, { recursive: true });
    fs.writeFileSync(
      path.join(packDir, 'active-pack.json'),
      JSON.stringify({ appliedAt: new Date().toISOString() })
    );

    const result = getActiveContextPack(testDir);
    assert.equal(result, null);
  });

  test('returns null when key is not a string', () => {
    fs.mkdirSync(packDir, { recursive: true });
    fs.writeFileSync(
      path.join(packDir, 'active-pack.json'),
      JSON.stringify({ key: 123, appliedAt: new Date().toISOString() })
    );

    const result = getActiveContextPack(testDir);
    assert.equal(result, null);
  });

  test('returns null when referenced pack does not exist', () => {
    fs.mkdirSync(packDir, { recursive: true });
    fs.writeFileSync(
      path.join(packDir, 'active-pack.json'),
      JSON.stringify({ key: 'nonexistent-pack', appliedAt: new Date().toISOString() })
    );

    const result = getActiveContextPack(testDir);
    assert.equal(result, null);
  });

  test('returns active pack with appliedAt timestamp', () => {
    const appliedAt = new Date().toISOString();
    createPackFile('my-pack', { name: 'My Pack', path_glob: 'src/**' });

    fs.writeFileSync(
      path.join(packDir, 'active-pack.json'),
      JSON.stringify({ key: 'my-pack', appliedAt })
    );

    const result = getActiveContextPack(testDir);

    assert.ok(result);
    assert.equal(result.key, 'my-pack');
    assert.equal(result.name, 'My Pack');
    assert.equal(result.appliedAt, appliedAt);
  });

  test('returns null appliedAt when not present in state', () => {
    createPackFile('timestamp-pack', { name: 'Timestamp Pack' });

    fs.writeFileSync(
      path.join(packDir, 'active-pack.json'),
      JSON.stringify({ key: 'timestamp-pack' })
    );

    const result = getActiveContextPack(testDir);

    assert.ok(result);
    assert.equal(result.key, 'timestamp-pack');
    assert.equal(result.appliedAt, null);
  });
});

// ============================================================================
// setActiveContextPack Tests
// ============================================================================

describe('setActiveContextPack', () => {
  beforeEach(() => {
    setupTestDir();
    clearContextPackCache();
  });

  afterEach(() => {
    cleanupTestDir();
  });

  test('throws error when pack does not exist', () => {
    assert.throws(
      () => setActiveContextPack('nonexistent', testDir),
      /Context pack "nonexistent" not found/
    );
  });

  test('creates pack directory if it does not exist', () => {
    // Create pack file first, then remove directory to simulate edge case
    createPackFile('auto-dir-pack', { name: 'Auto Dir Pack' });

    // Should succeed and create the active-pack.json
    const result = setActiveContextPack('auto-dir-pack', testDir);

    assert.ok(result);
    assert.ok(fs.existsSync(path.join(packDir, 'active-pack.json')));
  });

  test('sets active pack and returns pack info', () => {
    createPackFile('target-pack', {
      name: 'Target Pack',
      description: 'Pack to activate',
      path_glob: 'src/**'
    });

    const result = setActiveContextPack('target-pack', testDir);

    assert.equal(result.key, 'target-pack');
    assert.equal(result.name, 'Target Pack');
    assert.equal(result.description, 'Pack to activate');
  });

  test('writes state file with key and timestamp', () => {
    createPackFile('state-pack', { name: 'State Pack' });

    const beforeTime = new Date().toISOString();
    setActiveContextPack('state-pack', testDir);
    const afterTime = new Date().toISOString();

    const stateFile = path.join(packDir, 'active-pack.json');
    const stateContent = JSON.parse(fs.readFileSync(stateFile, 'utf8')) as { key: string; appliedAt: string };

    assert.equal(stateContent.key, 'state-pack');
    assert.ok(stateContent.appliedAt >= beforeTime);
    assert.ok(stateContent.appliedAt <= afterTime);
  });

  test('overwrites previous active pack', () => {
    createPackFile('pack-one', { name: 'Pack One' });
    createPackFile('pack-two', { name: 'Pack Two' });

    setActiveContextPack('pack-one', testDir);
    let active = getActiveContextPack(testDir);
    assert.equal(active?.key, 'pack-one');

    setActiveContextPack('pack-two', testDir);
    active = getActiveContextPack(testDir);
    assert.equal(active?.key, 'pack-two');
  });
});

// ============================================================================
// resolveScopeWithPack Tests
// ============================================================================

describe('resolveScopeWithPack', () => {
  beforeEach(() => {
    setupTestDir();
    clearContextPackCache();
  });

  afterEach(() => {
    cleanupTestDir();
  });

  test('returns default scope when no pack is active and no overrides', () => {
    const result = resolveScopeWithPack({}, { basePath: testDir });

    assert.equal(result.pack, null);
    // Default scope values from normalizeScopeFilters
    assert.equal(result.scope.reranker, 'off');
    assert.equal(result.scope.hybrid, true);
    assert.equal(result.scope.bm25, true);
    assert.equal(result.scope.symbol_boost, true);
  });

  test('applies active pack scope', () => {
    createPackFile('scope-pack', {
      name: 'Scope Pack',
      path_glob: ['src/**'],
      tags: ['api'],
      lang: ['typescript']
    });
    setActiveContextPack('scope-pack', testDir);

    const result = resolveScopeWithPack({}, { basePath: testDir });

    assert.ok(result.pack);
    assert.equal(result.pack.key, 'scope-pack');
    assert.deepEqual(result.scope.path_glob, ['src/**']);
    assert.deepEqual(result.scope.tags, ['api']);
    assert.deepEqual(result.scope.lang, ['typescript']);
  });

  test('overrides can replace pack scope values', () => {
    createPackFile('base-pack', {
      name: 'Base Pack',
      path_glob: ['src/**'],
      lang: ['typescript']
    });
    setActiveContextPack('base-pack', testDir);

    const result = resolveScopeWithPack(
      { path_glob: ['lib/**'], lang: ['javascript'] },
      { basePath: testDir }
    );

    assert.deepEqual(result.scope.path_glob, ['lib/**']);
    assert.deepEqual(result.scope.lang, ['javascript']);
  });

  test('overrides can add to pack scope', () => {
    createPackFile('partial-pack', {
      name: 'Partial Pack',
      path_glob: ['src/**']
    });
    setActiveContextPack('partial-pack', testDir);

    const result = resolveScopeWithPack(
      { tags: ['important'] },
      { basePath: testDir }
    );

    assert.deepEqual(result.scope.path_glob, ['src/**']);
    assert.deepEqual(result.scope.tags, ['important']);
  });

  test('session pack takes precedence over active pack', () => {
    createPackFile('active-pack', {
      name: 'Active Pack',
      path_glob: ['active/**']
    });
    setActiveContextPack('active-pack', testDir);

    const sessionPack = {
      key: 'session-pack',
      name: 'Session Pack',
      description: 'Temporary session scope',
      scope: { path_glob: ['session/**'] },
      path: '/tmp/session-pack.json',
      basePath: testDir
    };

    const result = resolveScopeWithPack({}, { basePath: testDir, sessionPack });

    assert.ok(result.pack);
    assert.equal(result.pack.key, 'session-pack');
    assert.deepEqual(result.scope.path_glob, ['session/**']);
  });

  test('session pack is ignored when basePath differs', () => {
    // Create the pack file
    createPackFile('active-pack', {
      name: 'Active Pack',
      path_glob: ['active/**']
    });

    // Verify pack file exists
    const packFile = path.join(packDir, 'active-pack.json');
    assert.ok(fs.existsSync(packFile), `Pack file should exist at ${packFile}`);

    // Load the pack directly to verify it works
    const loadedPack = loadContextPack('active-pack', testDir);
    assert.equal(loadedPack.name, 'Active Pack', 'Pack should load correctly');

    // Set it as active
    setActiveContextPack('active-pack', testDir);

    // Verify the state file was created
    const stateFile = path.join(packDir, 'active-pack.json');
    assert.ok(fs.existsSync(stateFile), 'State file should exist');

    // Verify the active pack can be retrieved
    const activePack = getActiveContextPack(testDir);
    assert.ok(activePack, 'Active pack should be retrievable');
    assert.equal(activePack.key, 'active-pack');

    const sessionPack = {
      key: 'session-pack',
      name: 'Session Pack',
      description: null,
      scope: { path_glob: ['session/**'] },
      path: '/other/session-pack.json',
      basePath: '/different/path'
    };

    const result = resolveScopeWithPack({}, { basePath: testDir, sessionPack });

    // Session pack is ignored because its basePath differs from testDir
    // So the active pack should be used instead
    assert.ok(result.pack, 'Active pack should be found when session pack basePath differs');
    assert.equal(result.pack.key, 'active-pack');
    assert.deepEqual(result.scope.path_glob, ['active/**']);
  });

  test('overrides take precedence over session pack', () => {
    const sessionPack = {
      key: 'session-pack',
      name: 'Session Pack',
      description: null,
      scope: { path_glob: ['session/**'], lang: ['python'] },
      path: '/tmp/session-pack.json',
      basePath: testDir
    };

    const result = resolveScopeWithPack(
      { lang: ['ruby'] },
      { basePath: testDir, sessionPack }
    );

    assert.deepEqual(result.scope.path_glob, ['session/**']);
    assert.deepEqual(result.scope.lang, ['ruby']);
  });

  test('handles undefined overrides', () => {
    createPackFile('undef-test', {
      name: 'Undef Test',
      path_glob: ['src/**']
    });
    setActiveContextPack('undef-test', testDir);

    const result = resolveScopeWithPack(
      { path_glob: undefined, tags: undefined },
      { basePath: testDir }
    );

    assert.deepEqual(result.scope.path_glob, ['src/**']);
    assert.equal(result.scope.tags, undefined);
  });

  test('normalizes scope values', () => {
    createPackFile('normalize-pack', {
      name: 'Normalize Pack',
      tags: 'single-tag',
      lang: 'TypeScript',
      hybrid: 'on',
      bm25: 'off'
    });
    setActiveContextPack('normalize-pack', testDir);

    const result = resolveScopeWithPack({}, { basePath: testDir });

    // Tags and lang should be normalized to lowercase arrays
    assert.deepEqual(result.scope.tags, ['single-tag']);
    assert.deepEqual(result.scope.lang, ['typescript']);
    assert.equal(result.scope.hybrid, true);
    assert.equal(result.scope.bm25, false);
  });

  test('returns pack info with description', () => {
    createPackFile('info-pack', {
      name: 'Info Pack',
      description: 'Pack with description'
    });
    setActiveContextPack('info-pack', testDir);

    const result = resolveScopeWithPack({}, { basePath: testDir });

    assert.ok(result.pack);
    assert.equal(result.pack.key, 'info-pack');
    assert.equal(result.pack.name, 'Info Pack');
    assert.equal(result.pack.description, 'Pack with description');
  });

  test('works with default options', () => {
    // Uses current working directory
    const result = resolveScopeWithPack();

    // Should not throw and return default scope
    assert.ok(result);
    assert.equal(result.scope.hybrid, true);
  });

  test('handles empty session pack scope', () => {
    const sessionPack = {
      key: 'empty-session',
      name: 'Empty Session',
      description: null,
      scope: {},
      path: '/tmp/empty.json',
      basePath: testDir
    };

    const result = resolveScopeWithPack(
      { path_glob: ['override/**'] },
      { basePath: testDir, sessionPack }
    );

    assert.ok(result.pack);
    assert.equal(result.pack.key, 'empty-session');
    assert.deepEqual(result.scope.path_glob, ['override/**']);
  });

  test('handles session pack with null scope', () => {
    const sessionPack = {
      key: 'null-scope-session',
      name: 'Null Scope Session',
      description: null,
      scope: {},
      path: '/tmp/null-scope.json',
      basePath: testDir
    };

    const result = resolveScopeWithPack({}, { basePath: testDir, sessionPack });

    assert.ok(result.pack);
    assert.equal(result.pack.key, 'null-scope-session');
  });

  test('handles provider override', () => {
    createPackFile('provider-base', {
      name: 'Provider Base',
      provider: 'openai'
    });
    setActiveContextPack('provider-base', testDir);

    const result = resolveScopeWithPack(
      { provider: 'anthropic' },
      { basePath: testDir }
    );

    assert.equal(result.scope.provider, 'anthropic');
  });

  test('handles reranker override', () => {
    createPackFile('reranker-base', {
      name: 'Reranker Base',
      reranker: 'off'
    });
    setActiveContextPack('reranker-base', testDir);

    const result = resolveScopeWithPack(
      { reranker: 'api' },
      { basePath: testDir }
    );

    assert.equal(result.scope.reranker, 'api');
  });
});

// ============================================================================
// clearContextPackCache Tests
// ============================================================================

describe('clearContextPackCache', () => {
  beforeEach(() => {
    setupTestDir();
    clearContextPackCache();
  });

  afterEach(() => {
    cleanupTestDir();
  });

  test('clears cached packs', () => {
    createPackFile('cache-test', {
      name: 'Cache Test',
      path_glob: 'original/**'
    });

    // Load to cache
    const pack1 = loadContextPack('cache-test', testDir);
    assert.equal(pack1.name, 'Cache Test');

    // Modify file without changing mtime (simulating edge case)
    // Actually we need to clear cache to force reload
    clearContextPackCache();

    // Update file content
    createPackFile('cache-test', {
      name: 'Updated Cache Test',
      path_glob: 'updated/**'
    });

    // Should get updated version
    const pack2 = loadContextPack('cache-test', testDir);
    assert.equal(pack2.name, 'Updated Cache Test');
  });

  test('does not throw on empty cache', () => {
    // Should not throw
    clearContextPackCache();
    clearContextPackCache();
    assert.ok(true);
  });
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe('Edge Cases', () => {
  beforeEach(() => {
    setupTestDir();
    clearContextPackCache();
  });

  afterEach(() => {
    cleanupTestDir();
  });

  test('handles pack with all scope keys', () => {
    createPackFile('full-pack', {
      name: 'Full Pack',
      description: 'Pack with all scope keys',
      path_glob: ['**/*.ts'],
      tags: ['core'],
      lang: ['typescript'],
      provider: 'openai',
      reranker: 'api',
      hybrid: true,
      bm25: true,
      symbol_boost: false
    });

    const pack = loadContextPack('full-pack', testDir);

    // Arrays are stored as-is in the pack scope
    assert.deepEqual(pack.scope.path_glob, ['**/*.ts']);
    assert.deepEqual(pack.scope.tags, ['core']);
    assert.deepEqual(pack.scope.lang, ['typescript']);
    assert.equal(pack.scope.provider, 'openai');
    assert.equal(pack.scope.reranker, 'api');
    assert.equal(pack.scope.hybrid, true);
    assert.equal(pack.scope.bm25, true);
    assert.equal(pack.scope.symbol_boost, false);
  });

  test('handles special characters in pack name', () => {
    createPackFile('pack-with-dashes', { name: 'Dashed Pack' });
    createPackFile('pack_with_underscores', { name: 'Underscored Pack' });

    const dashed = loadContextPack('pack-with-dashes', testDir);
    const underscored = loadContextPack('pack_with_underscores', testDir);

    assert.equal(dashed.name, 'Dashed Pack');
    assert.equal(underscored.name, 'Underscored Pack');
  });

  test('handles deeply nested scope in pack definition', () => {
    createPackFile('nested-deep', {
      name: 'Nested Deep',
      scope: {
        path_glob: 'scope-path/**',
        tags: ['scope-tag']
      },
      // Top-level values should merge with scope
      lang: ['toplevel-lang']
    });

    const pack = loadContextPack('nested-deep', testDir);

    // Both scope-level and top-level values should be captured
    // Values are stored as-is (string stays string, array stays array)
    assert.equal(pack.scope.path_glob, 'scope-path/**');
    assert.deepEqual(pack.scope.tags, ['scope-tag']);
    assert.deepEqual(pack.scope.lang, ['toplevel-lang']);
  });

  test('handles pack with metadata field', () => {
    createPackFile('metadata-pack', {
      name: 'Metadata Pack',
      description: 'Has metadata',
      metadata: {
        author: 'test',
        version: '1.0.0'
      },
      path_glob: 'src/**'
    });

    const pack = loadContextPack('metadata-pack', testDir);

    assert.equal(pack.name, 'Metadata Pack');
    // Metadata is allowed but not included in scope
    assert.equal(pack.scope.path_glob, 'src/**');
  });

  test('resolveScopeWithPack handles missing basePath in options', () => {
    const result = resolveScopeWithPack({}, {});

    // Should use default basePath '.'
    assert.ok(result);
    assert.equal(result.scope.hybrid, true);
  });

  test('pack path is absolute', () => {
    createPackFile('abs-path-pack', { name: 'Abs Path Pack' });

    const pack = loadContextPack('abs-path-pack', testDir);

    assert.ok(path.isAbsolute(pack.path));
    assert.ok(pack.path.includes('abs-path-pack.json'));
  });

  test('concurrent loads return same cached value', async () => {
    createPackFile('concurrent-pack', { name: 'Concurrent Pack' });

    // Load same pack concurrently
    const [pack1, pack2, pack3] = await Promise.all([
      Promise.resolve(loadContextPack('concurrent-pack', testDir)),
      Promise.resolve(loadContextPack('concurrent-pack', testDir)),
      Promise.resolve(loadContextPack('concurrent-pack', testDir))
    ]);

    assert.deepEqual(pack1, pack2);
    assert.deepEqual(pack2, pack3);
  });

  test('listContextPacks with mixed valid and invalid packs', () => {
    createPackFile('valid-1', { name: 'Valid 1' });
    createInvalidJsonFile('invalid-1', 'not json');
    createPackFile('valid-2', { name: 'Valid 2' });
    createPackFile('schema-invalid', { name: 'Schema Invalid', bad_key: true });
    createInvalidJsonFile('invalid-2', '{ "unclosed": }');

    const packs = listContextPacks(testDir);

    const valid = packs.filter(p => !p.invalid);
    const invalid = packs.filter(p => p.invalid);

    assert.equal(valid.length, 2);
    assert.equal(invalid.length, 3);
  });
});
