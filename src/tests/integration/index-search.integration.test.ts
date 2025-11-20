import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { indexProject } from '../../core/indexer.js';
import { getChunk, searchCode, warmupSearch, clearSearchCaches } from '../../core/search.js';
import { ChangeQueue } from '../../indexer/ChangeQueue.js';
import { Database } from '../../database/db.js';
import { MockEmbeddingProvider } from '../../providers/mock.js';
import { resetEncryptionCacheForTests } from '../../storage/encrypted-chunks.js';
import { createTempRepo, writeRepoFile, type TempRepo } from '../helpers/test-repo.js';

let envSnapshot: NodeJS.ProcessEnv = {};
let repoUnderTest: TempRepo | null = null;

async function writeProviderConfig(root: string, dimensions: number): Promise<void> {
  const config = {
    providers: {
      openai: {
        dimensions
      }
    }
  };

  await writeRepoFile(root, '.codevault/config.json', JSON.stringify(config, null, 2));
}

beforeEach(() => {
  envSnapshot = { ...process.env };
  process.env.CODEVAULT_QUIET = 'true';
});

afterEach(async () => {
  clearSearchCaches();
  resetEncryptionCacheForTests();

  if (repoUnderTest) {
    await repoUnderTest.cleanup();
    repoUnderTest = null;
  }

  // Restore environment variables
  for (const key of Object.keys(process.env)) {
    if (!(key in envSnapshot)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (typeof value === 'undefined') {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

test('indexes and searches end-to-end with the mock provider', async () => {
  repoUnderTest = await createTempRepo({
    'src/index.ts': `
      export function helloWorld(name: string): string {
        return "Hello, " + name;
      }
    `,
    'src/math.ts': `
      export function add(a: number, b: number): number {
        return a + b;
      }
    `
  });

  const provider = new MockEmbeddingProvider();
  await writeProviderConfig(repoUnderTest.root, provider.getDimensions());
  const indexResult = await indexProject({
    repoPath: repoUnderTest.root,
    provider: provider.getName(),
    embeddingProviderOverride: provider,
    encryptMode: 'off'
  });

  assert.equal(indexResult.success, true);
  assert.equal(indexResult.provider, 'mock');
  assert.equal(indexResult.errors.length, 0);
  assert.ok(indexResult.totalChunks > 0);

  await warmupSearch(repoUnderTest.root, provider.getName());
  const searchResult = await searchCode(
    'helloWorld function',
    5,
    provider.getName(),
    repoUnderTest.root
  );

  assert.equal(searchResult.success, true);
  assert.ok(searchResult.results.length > 0);

  const first = searchResult.results[0];
  const chunk = await getChunk(first.sha, repoUnderTest.root);
  assert.equal(chunk.success, true);
  assert.ok(chunk.code && chunk.code.includes('helloWorld'));

  const db = new Database(path.join(repoUnderTest.root, '.codevault/codevault.db'));
  const storedChunks = await db.getChunks(provider.getName(), provider.getDimensions());
  db.close();
  assert.ok(storedChunks.length >= indexResult.totalChunks);
});

test('requires encryption keys and supports rotation via deprecated keys', async () => {
  repoUnderTest = await createTempRepo({
    'src/secure.ts': `
      export function secretValue(): string {
        return "s3cr3t";
      }
    `
  });

  const provider = new MockEmbeddingProvider();
  await writeProviderConfig(repoUnderTest.root, provider.getDimensions());
  const keyV1 = randomBytes(32).toString('base64');
  process.env.CODEVAULT_ENCRYPTION_KEY = keyV1;
  process.env.CODEVAULT_ENCRYPTION_DEPRECATED_KEYS = '';
  resetEncryptionCacheForTests();

  const indexResult = await indexProject({
    repoPath: repoUnderTest.root,
    provider: provider.getName(),
    embeddingProviderOverride: provider,
    encryptMode: 'on'
  });

  assert.equal(indexResult.success, true);
  assert.ok(indexResult.totalChunks > 0);

  delete process.env.CODEVAULT_ENCRYPTION_KEY;
  delete process.env.CODEVAULT_ENCRYPTION_DEPRECATED_KEYS;
  resetEncryptionCacheForTests();
  clearSearchCaches();

  const searchResult = await searchCode(
    'secretValue',
    5,
    provider.getName(),
    repoUnderTest.root
  );
  assert.equal(searchResult.success, true);
  assert.ok(searchResult.warnings && searchResult.warnings.length > 0);
  assert.ok(searchResult.results.length > 0);

  const encryptedChunk = await getChunk(searchResult.results[0].sha, repoUnderTest.root);
  assert.equal(encryptedChunk.success, false);
  assert.ok(encryptedChunk.error && encryptedChunk.error.toLowerCase().includes('encrypted'));

  const keyV2 = randomBytes(32).toString('base64');
  process.env.CODEVAULT_ENCRYPTION_KEY = keyV2;
  process.env.CODEVAULT_ENCRYPTION_DEPRECATED_KEYS = keyV1;
  resetEncryptionCacheForTests();
  clearSearchCaches();

  const rotatedChunk = await getChunk(searchResult.results[0].sha, repoUnderTest.root);
  assert.equal(rotatedChunk.success, true);
  assert.ok(rotatedChunk.code && rotatedChunk.code.includes('secretValue'));
});

test('change queue batches rapid edits without racing flushes', async () => {
  repoUnderTest = await createTempRepo({
    'src/start.ts': 'export const started = true;'
  });

  const provider = new MockEmbeddingProvider(12);
  const batches: Array<{ changed: string[]; deleted: string[] }> = [];
  const changeQueue = new ChangeQueue({
    repoPath: repoUnderTest.root,
    provider: provider.getName(),
    debounceMs: 20,
    providerGetter: async () => provider,
    onBatch: async event => {
      batches.push(event);
    },
    encrypt: 'off'
  });

  await writeRepoFile(repoUnderTest.root, 'src/new-file.ts', 'export function newFile() { return 1; }');
  await writeRepoFile(repoUnderTest.root, 'scripts/task.sh', '#!/usr/bin/env bash\necho "hi"\n');

  changeQueue.enqueue('add', 'src/new-file.ts');
  changeQueue.enqueue('add', 'scripts/task.sh');
  changeQueue.enqueue('change', 'src/start.ts');

  await Promise.all([changeQueue.flush(), changeQueue.flush()]);
  await changeQueue.drain();
  changeQueue.cancel();

  const db = new Database(path.join(repoUnderTest.root, '.codevault/codevault.db'));
  const chunks = await db.getChunks(provider.getName(), provider.getDimensions());
  db.close();

  assert.ok(chunks.length >= 3);
  assert.ok(batches.length >= 1 && batches.length <= 2);

  const pending = changeQueue.getPendingCount();
  assert.equal(pending.changes, 0);
  assert.equal(pending.deletes, 0);
});
