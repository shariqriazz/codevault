import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { gzipSync } from 'zlib';

import {
  readChunkFromDisk,
  resetEncryptionCacheForTests,
  resetEncryptionGuardsForTests,
  setEncryptionRandomBytes,
  writeChunkToDisk
} from '../storage/encrypted-chunks.js';
import { ENCRYPTION_CONSTANTS } from '../config/constants.js';

const { REQUIRED_KEY_LENGTH, SALT_LENGTH, IV_LENGTH, MAGIC_HEADER, HKDF_INFO, KEY_ID_LENGTH } = ENCRYPTION_CONSTANTS;

test('decrypt prefers matching key id first and still falls back to other keys', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await fs.mkdtemp(path.join(process.cwd(), 'tmp-encrypted-'));
  const sha = 'enc-sha-1';
  const activeKey = crypto.randomBytes(REQUIRED_KEY_LENGTH);
  const fallbackKey = crypto.randomBytes(REQUIRED_KEY_LENGTH);

  try {
    await writeChunkToDisk({
      chunkDir,
      sha,
      code: 'encrypted payload',
      encryption: { enabled: true, key: activeKey, reason: 'test' }
    });

    const payload = await fs.readFile(path.join(chunkDir, `${sha}.gz.enc`));
    const headerLength = Buffer.from(MAGIC_HEADER, 'utf8').length;
    const storedKeyId = payload.subarray(headerLength + 1, headerLength + 1 + KEY_ID_LENGTH);
    const expectedKeyId = crypto.createHash('sha256').update(activeKey).digest().subarray(0, KEY_ID_LENGTH);
    assert.ok(storedKeyId.equals(expectedKeyId));

    const result = await readChunkFromDisk({
      chunkDir,
      sha,
      keySet: { primary: fallbackKey, deprecated: [activeKey] }
    });

    assert.ok(result);
    assert.equal(result?.code, 'encrypted payload');
    assert.equal(result?.encrypted, true);
  } finally {
    await fs.rm(chunkDir, { recursive: true, force: true });
  }
});

test('detects IV reuse attempts for the same key', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await fs.mkdtemp(path.join(process.cwd(), 'tmp-nonce-'));
  const shaOne = 'nonce-1';
  const shaTwo = 'nonce-2';
  const key = crypto.randomBytes(REQUIRED_KEY_LENGTH);

  // Stub randomBytes to return the same salt/iv pairs to force reuse
  const stubRandomBytes = (
    size: number,
    callback?: (err: Error | null, buf: Buffer) => void
  ): Buffer => {
    const buffer = Buffer.alloc(size, 0x11);
    if (callback) {
      callback(null, buffer);
    }
    return buffer;
  };

  setEncryptionRandomBytes(stubRandomBytes as unknown as typeof crypto.randomBytes);

  try {
    await writeChunkToDisk({
      chunkDir,
      sha: shaOne,
      code: 'first',
      encryption: { enabled: true, key, reason: 'test' }
    });

    await assert.rejects(
      () =>
        writeChunkToDisk({
          chunkDir,
          sha: shaTwo,
          code: 'second',
          encryption: { enabled: true, key, reason: 'test' }
        }),
      (error: unknown) => {
        const typed = error as { code?: string };
        return typed.code === 'ENCRYPTION_IV_REUSE';
      }
    );
  } finally {
    resetEncryptionGuardsForTests();
    await fs.rm(chunkDir, { recursive: true, force: true });
  }
});

test('remains backward compatible with version 1 payloads', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await fs.mkdtemp(path.join(process.cwd(), 'tmp-legacy-'));
  const sha = 'legacy-sha';
  const key = crypto.randomBytes(REQUIRED_KEY_LENGTH);
  const salt = Buffer.alloc(SALT_LENGTH, 0x01);
  const iv = Buffer.alloc(IV_LENGTH, 0x02);
  const compressed = gzipSync(Buffer.from('legacy data', 'utf8'));
  const hkdfInfo = Buffer.from(HKDF_INFO, 'utf8');
  const derivedKey: Buffer = crypto.hkdfSync('sha256', key, salt, hkdfInfo, REQUIRED_KEY_LENGTH) as unknown as Buffer;
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const tag = cipher.getAuthTag();
  const header = Buffer.from(MAGIC_HEADER, 'utf8');
  const payload = Buffer.concat([header, Buffer.from([1]), salt, iv, ciphertext, tag]);
  const encryptedPath = path.join(chunkDir, `${sha}.gz.enc`);

  try {
    await fs.writeFile(encryptedPath, payload);
    const result = await readChunkFromDisk({ chunkDir, sha, keySet: { primary: key, deprecated: [] } });

    assert.ok(result);
    assert.equal(result?.code, 'legacy data');
    assert.equal(result?.encrypted, true);
  } finally {
    await fs.rm(chunkDir, { recursive: true, force: true });
  }
});
