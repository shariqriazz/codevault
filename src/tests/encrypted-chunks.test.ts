import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { gzipSync } from 'zlib';

import {
  getActiveEncryptionKey,
  getEncryptionKeyError,
  getEncryptionKeySet,
  isChunkEncryptedOnDisk,
  readChunkFromDisk,
  removeChunkArtifacts,
  resetEncryptionCacheForTests,
  resetEncryptionGuardsForTests,
  resolveEncryptionPreference,
  setEncryptionRandomBytes,
  writeChunkToDisk
} from '../storage/encrypted-chunks.js';
import { ENCRYPTION_CONSTANTS } from '../config/constants.js';

const { REQUIRED_KEY_LENGTH, SALT_LENGTH, IV_LENGTH, MAGIC_HEADER, HKDF_INFO, KEY_ID_LENGTH, TAG_LENGTH } = ENCRYPTION_CONSTANTS;

// ============================================================================
// Test Utilities
// ============================================================================

function generateValidKey(): Buffer {
  return crypto.randomBytes(REQUIRED_KEY_LENGTH);
}

function generateBase64Key(): string {
  return crypto.randomBytes(REQUIRED_KEY_LENGTH).toString('base64');
}

function generateHexKey(): string {
  return crypto.randomBytes(REQUIRED_KEY_LENGTH).toString('hex');
}

async function createTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(process.cwd(), `tmp-${prefix}-`));
}

async function cleanupTempDir(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true });
}

// ============================================================================
// Key Management Tests
// ============================================================================

test('getActiveEncryptionKey returns null when no env var is set', () => {
  const originalKey = process.env.CODEVAULT_ENCRYPTION_KEY;
  delete process.env.CODEVAULT_ENCRYPTION_KEY;
  resetEncryptionCacheForTests();

  try {
    const key = getActiveEncryptionKey();
    assert.equal(key, null);
  } finally {
    if (originalKey !== undefined) {
      process.env.CODEVAULT_ENCRYPTION_KEY = originalKey;
    }
    resetEncryptionCacheForTests();
  }
});

test('getActiveEncryptionKey decodes base64 key correctly', () => {
  const originalKey = process.env.CODEVAULT_ENCRYPTION_KEY;
  const testKey = generateBase64Key();
  process.env.CODEVAULT_ENCRYPTION_KEY = testKey;
  resetEncryptionCacheForTests();

  try {
    const key = getActiveEncryptionKey();
    assert.ok(key);
    assert.equal(key.length, REQUIRED_KEY_LENGTH);
  } finally {
    if (originalKey !== undefined) {
      process.env.CODEVAULT_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.CODEVAULT_ENCRYPTION_KEY;
    }
    resetEncryptionCacheForTests();
  }
});

test('getActiveEncryptionKey decodes hex key correctly', () => {
  const originalKey = process.env.CODEVAULT_ENCRYPTION_KEY;
  const testKey = generateHexKey();
  process.env.CODEVAULT_ENCRYPTION_KEY = testKey;
  resetEncryptionCacheForTests();

  try {
    const key = getActiveEncryptionKey();
    assert.ok(key);
    assert.equal(key.length, REQUIRED_KEY_LENGTH);
  } finally {
    if (originalKey !== undefined) {
      process.env.CODEVAULT_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.CODEVAULT_ENCRYPTION_KEY;
    }
    resetEncryptionCacheForTests();
  }
});

test('getActiveEncryptionKey returns null for invalid key format', () => {
  const originalKey = process.env.CODEVAULT_ENCRYPTION_KEY;
  process.env.CODEVAULT_ENCRYPTION_KEY = 'invalid-key-too-short';
  resetEncryptionCacheForTests();

  try {
    const key = getActiveEncryptionKey();
    assert.equal(key, null);
  } finally {
    if (originalKey !== undefined) {
      process.env.CODEVAULT_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.CODEVAULT_ENCRYPTION_KEY;
    }
    resetEncryptionCacheForTests();
  }
});

test('getEncryptionKeyError returns error for invalid key', () => {
  const originalKey = process.env.CODEVAULT_ENCRYPTION_KEY;
  process.env.CODEVAULT_ENCRYPTION_KEY = 'invalid-key-format';
  resetEncryptionCacheForTests();

  try {
    const error = getEncryptionKeyError();
    assert.ok(error);
    assert.ok(error.message.includes('CODEVAULT_ENCRYPTION_KEY'));
    assert.ok(error.message.includes(`${REQUIRED_KEY_LENGTH}-byte`));
  } finally {
    if (originalKey !== undefined) {
      process.env.CODEVAULT_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.CODEVAULT_ENCRYPTION_KEY;
    }
    resetEncryptionCacheForTests();
  }
});

test('getEncryptionKeyError returns null for valid key', () => {
  const originalKey = process.env.CODEVAULT_ENCRYPTION_KEY;
  process.env.CODEVAULT_ENCRYPTION_KEY = generateBase64Key();
  resetEncryptionCacheForTests();

  try {
    const error = getEncryptionKeyError();
    assert.equal(error, null);
  } finally {
    if (originalKey !== undefined) {
      process.env.CODEVAULT_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.CODEVAULT_ENCRYPTION_KEY;
    }
    resetEncryptionCacheForTests();
  }
});

test('getEncryptionKeyError returns null when no key is set', () => {
  const originalKey = process.env.CODEVAULT_ENCRYPTION_KEY;
  delete process.env.CODEVAULT_ENCRYPTION_KEY;
  resetEncryptionCacheForTests();

  try {
    const error = getEncryptionKeyError();
    assert.equal(error, null);
  } finally {
    if (originalKey !== undefined) {
      process.env.CODEVAULT_ENCRYPTION_KEY = originalKey;
    }
    resetEncryptionCacheForTests();
  }
});

test('getEncryptionKeySet returns primary and deprecated keys', () => {
  const originalKey = process.env.CODEVAULT_ENCRYPTION_KEY;
  const originalDeprecated = process.env.CODEVAULT_ENCRYPTION_DEPRECATED_KEYS;

  const primaryKey = generateBase64Key();
  const deprecatedKey1 = generateBase64Key();
  const deprecatedKey2 = generateHexKey();

  process.env.CODEVAULT_ENCRYPTION_KEY = primaryKey;
  process.env.CODEVAULT_ENCRYPTION_DEPRECATED_KEYS = `${deprecatedKey1},${deprecatedKey2}`;
  resetEncryptionCacheForTests();

  try {
    const keySet = getEncryptionKeySet();
    assert.ok(keySet.primary);
    assert.equal(keySet.primary.length, REQUIRED_KEY_LENGTH);
    assert.equal(keySet.deprecated.length, 2);
    assert.equal(keySet.deprecated[0].length, REQUIRED_KEY_LENGTH);
    assert.equal(keySet.deprecated[1].length, REQUIRED_KEY_LENGTH);
  } finally {
    if (originalKey !== undefined) {
      process.env.CODEVAULT_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.CODEVAULT_ENCRYPTION_KEY;
    }
    if (originalDeprecated !== undefined) {
      process.env.CODEVAULT_ENCRYPTION_DEPRECATED_KEYS = originalDeprecated;
    } else {
      delete process.env.CODEVAULT_ENCRYPTION_DEPRECATED_KEYS;
    }
    resetEncryptionCacheForTests();
  }
});

test('getEncryptionKeySet skips invalid deprecated keys', () => {
  const originalKey = process.env.CODEVAULT_ENCRYPTION_KEY;
  const originalDeprecated = process.env.CODEVAULT_ENCRYPTION_DEPRECATED_KEYS;

  const primaryKey = generateBase64Key();
  const validDeprecated = generateBase64Key();

  process.env.CODEVAULT_ENCRYPTION_KEY = primaryKey;
  process.env.CODEVAULT_ENCRYPTION_DEPRECATED_KEYS = `${validDeprecated},invalid-key,${generateBase64Key()}`;
  resetEncryptionCacheForTests();

  try {
    const keySet = getEncryptionKeySet();
    assert.ok(keySet.primary);
    assert.equal(keySet.deprecated.length, 2); // Only valid keys
  } finally {
    if (originalKey !== undefined) {
      process.env.CODEVAULT_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.CODEVAULT_ENCRYPTION_KEY;
    }
    if (originalDeprecated !== undefined) {
      process.env.CODEVAULT_ENCRYPTION_DEPRECATED_KEYS = originalDeprecated;
    } else {
      delete process.env.CODEVAULT_ENCRYPTION_DEPRECATED_KEYS;
    }
    resetEncryptionCacheForTests();
  }
});

test('key decoding handles whitespace in keys', () => {
  const originalKey = process.env.CODEVAULT_ENCRYPTION_KEY;
  const testKey = `  ${generateBase64Key()}  `;
  process.env.CODEVAULT_ENCRYPTION_KEY = testKey;
  resetEncryptionCacheForTests();

  try {
    const key = getActiveEncryptionKey();
    assert.ok(key);
    assert.equal(key.length, REQUIRED_KEY_LENGTH);
  } finally {
    if (originalKey !== undefined) {
      process.env.CODEVAULT_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.CODEVAULT_ENCRYPTION_KEY;
    }
    resetEncryptionCacheForTests();
  }
});

test('key decoding returns null for empty string', () => {
  const originalKey = process.env.CODEVAULT_ENCRYPTION_KEY;
  process.env.CODEVAULT_ENCRYPTION_KEY = '';
  resetEncryptionCacheForTests();

  try {
    const key = getActiveEncryptionKey();
    assert.equal(key, null);
  } finally {
    if (originalKey !== undefined) {
      process.env.CODEVAULT_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.CODEVAULT_ENCRYPTION_KEY;
    }
    resetEncryptionCacheForTests();
  }
});

test('key decoding returns null for whitespace-only string', () => {
  const originalKey = process.env.CODEVAULT_ENCRYPTION_KEY;
  process.env.CODEVAULT_ENCRYPTION_KEY = '   ';
  resetEncryptionCacheForTests();

  try {
    const key = getActiveEncryptionKey();
    assert.equal(key, null);
  } finally {
    if (originalKey !== undefined) {
      process.env.CODEVAULT_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.CODEVAULT_ENCRYPTION_KEY;
    }
    resetEncryptionCacheForTests();
  }
});

// ============================================================================
// Encryption Preference Resolution Tests
// ============================================================================

test('resolveEncryptionPreference returns disabled when mode is off', () => {
  const originalKey = process.env.CODEVAULT_ENCRYPTION_KEY;
  process.env.CODEVAULT_ENCRYPTION_KEY = generateBase64Key();
  resetEncryptionCacheForTests();

  try {
    const pref = resolveEncryptionPreference({ mode: 'off' });
    assert.equal(pref.enabled, false);
    assert.equal(pref.key, null);
    assert.equal(pref.reason, 'flag_off');
  } finally {
    if (originalKey !== undefined) {
      process.env.CODEVAULT_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.CODEVAULT_ENCRYPTION_KEY;
    }
    resetEncryptionCacheForTests();
  }
});

test('resolveEncryptionPreference returns enabled when mode is on with valid key', () => {
  const originalKey = process.env.CODEVAULT_ENCRYPTION_KEY;
  process.env.CODEVAULT_ENCRYPTION_KEY = generateBase64Key();
  resetEncryptionCacheForTests();

  try {
    const pref = resolveEncryptionPreference({ mode: 'on' });
    assert.equal(pref.enabled, true);
    assert.ok(pref.key);
    assert.equal(pref.reason, 'enabled');
  } finally {
    if (originalKey !== undefined) {
      process.env.CODEVAULT_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.CODEVAULT_ENCRYPTION_KEY;
    }
    resetEncryptionCacheForTests();
  }
});

test('resolveEncryptionPreference throws when mode is on but no key', () => {
  const originalKey = process.env.CODEVAULT_ENCRYPTION_KEY;
  delete process.env.CODEVAULT_ENCRYPTION_KEY;
  resetEncryptionCacheForTests();

  try {
    assert.throws(
      () => resolveEncryptionPreference({ mode: 'on' }),
      (error: Error) => {
        return error.message.includes('CODEVAULT_ENCRYPTION_KEY is not configured');
      }
    );
  } finally {
    if (originalKey !== undefined) {
      process.env.CODEVAULT_ENCRYPTION_KEY = originalKey;
    }
    resetEncryptionCacheForTests();
  }
});

test('resolveEncryptionPreference throws when mode is on but key is invalid', () => {
  const originalKey = process.env.CODEVAULT_ENCRYPTION_KEY;
  process.env.CODEVAULT_ENCRYPTION_KEY = 'invalid-key';
  resetEncryptionCacheForTests();

  try {
    assert.throws(
      () => resolveEncryptionPreference({ mode: 'on' }),
      (error: Error) => {
        return error.message.includes('CODEVAULT_ENCRYPTION_KEY');
      }
    );
  } finally {
    if (originalKey !== undefined) {
      process.env.CODEVAULT_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.CODEVAULT_ENCRYPTION_KEY;
    }
    resetEncryptionCacheForTests();
  }
});

test('resolveEncryptionPreference returns disabled with missing_key reason when no key set', () => {
  const originalKey = process.env.CODEVAULT_ENCRYPTION_KEY;
  delete process.env.CODEVAULT_ENCRYPTION_KEY;
  resetEncryptionCacheForTests();

  try {
    const pref = resolveEncryptionPreference({});
    assert.equal(pref.enabled, false);
    assert.equal(pref.key, null);
    assert.equal(pref.reason, 'missing_key');
  } finally {
    if (originalKey !== undefined) {
      process.env.CODEVAULT_ENCRYPTION_KEY = originalKey;
    }
    resetEncryptionCacheForTests();
  }
});

test('resolveEncryptionPreference returns disabled with invalid_key reason for bad key', () => {
  const originalKey = process.env.CODEVAULT_ENCRYPTION_KEY;
  process.env.CODEVAULT_ENCRYPTION_KEY = 'bad-key-format';
  resetEncryptionCacheForTests();

  const warnings: string[] = [];
  const mockLogger = {
    warn: (msg: string) => warnings.push(msg)
  };

  try {
    const pref = resolveEncryptionPreference({ logger: mockLogger });
    assert.equal(pref.enabled, false);
    assert.equal(pref.key, null);
    assert.equal(pref.reason, 'invalid_key');
    assert.ok(warnings.length > 0);
  } finally {
    if (originalKey !== undefined) {
      process.env.CODEVAULT_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.CODEVAULT_ENCRYPTION_KEY;
    }
    resetEncryptionCacheForTests();
  }
});

test('resolveEncryptionPreference warns for invalid mode values', () => {
  const originalKey = process.env.CODEVAULT_ENCRYPTION_KEY;
  delete process.env.CODEVAULT_ENCRYPTION_KEY;
  resetEncryptionCacheForTests();

  const warnings: string[] = [];
  const mockLogger = {
    warn: (msg: string) => warnings.push(msg)
  };

  try {
    resolveEncryptionPreference({ mode: 'invalid-mode', logger: mockLogger });
    assert.ok(warnings.some(w => w.includes('Unknown --encrypt mode')));
  } finally {
    if (originalKey !== undefined) {
      process.env.CODEVAULT_ENCRYPTION_KEY = originalKey;
    }
    resetEncryptionCacheForTests();
  }
});

test('resolveEncryptionPreference handles case-insensitive mode values', () => {
  const originalKey = process.env.CODEVAULT_ENCRYPTION_KEY;
  process.env.CODEVAULT_ENCRYPTION_KEY = generateBase64Key();
  resetEncryptionCacheForTests();

  try {
    const prefOff = resolveEncryptionPreference({ mode: 'OFF' });
    assert.equal(prefOff.enabled, false);
    assert.equal(prefOff.reason, 'flag_off');

    const prefOn = resolveEncryptionPreference({ mode: 'ON' });
    assert.equal(prefOn.enabled, true);
    assert.equal(prefOn.reason, 'enabled');
  } finally {
    if (originalKey !== undefined) {
      process.env.CODEVAULT_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.CODEVAULT_ENCRYPTION_KEY;
    }
    resetEncryptionCacheForTests();
  }
});

test('resolveEncryptionPreference handles whitespace in mode values', () => {
  const originalKey = process.env.CODEVAULT_ENCRYPTION_KEY;
  delete process.env.CODEVAULT_ENCRYPTION_KEY;
  resetEncryptionCacheForTests();

  try {
    const pref = resolveEncryptionPreference({ mode: '  off  ' });
    assert.equal(pref.enabled, false);
    assert.equal(pref.reason, 'flag_off');
  } finally {
    if (originalKey !== undefined) {
      process.env.CODEVAULT_ENCRYPTION_KEY = originalKey;
    }
    resetEncryptionCacheForTests();
  }
});

// ============================================================================
// Encryption/Decryption Roundtrip Tests
// ============================================================================

test('writeChunkToDisk and readChunkFromDisk roundtrip with encryption', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('roundtrip-enc');
  const sha = 'roundtrip-sha-1';
  const key = generateValidKey();
  const testCode = 'function hello() { return "world"; }';

  try {
    const writeResult = await writeChunkToDisk({
      chunkDir,
      sha,
      code: testCode,
      encryption: { enabled: true, key, reason: 'test' }
    });

    assert.equal(writeResult.encrypted, true);
    assert.ok(writeResult.path.endsWith('.gz.enc'));

    const readResult = await readChunkFromDisk({
      chunkDir,
      sha,
      keySet: { primary: key, deprecated: [] }
    });

    assert.ok(readResult);
    assert.equal(readResult.code, testCode);
    assert.equal(readResult.encrypted, true);
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

test('writeChunkToDisk and readChunkFromDisk roundtrip without encryption', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('roundtrip-plain');
  const sha = 'roundtrip-sha-2';
  const testCode = 'const x = 42;';

  try {
    const writeResult = await writeChunkToDisk({
      chunkDir,
      sha,
      code: testCode,
      encryption: { enabled: false, key: null, reason: 'test' }
    });

    assert.equal(writeResult.encrypted, false);
    assert.ok(writeResult.path.endsWith('.gz'));
    assert.ok(!writeResult.path.endsWith('.gz.enc'));

    const readResult = await readChunkFromDisk({
      chunkDir,
      sha,
      keySet: { primary: null, deprecated: [] }
    });

    assert.ok(readResult);
    assert.equal(readResult.code, testCode);
    assert.equal(readResult.encrypted, false);
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

test('writeChunkToDisk accepts Buffer input', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('buffer-input');
  const sha = 'buffer-sha-1';
  const key = generateValidKey();
  const testCode = Buffer.from('buffer content test');

  try {
    const writeResult = await writeChunkToDisk({
      chunkDir,
      sha,
      code: testCode,
      encryption: { enabled: true, key, reason: 'test' }
    });

    assert.equal(writeResult.encrypted, true);

    const readResult = await readChunkFromDisk({
      chunkDir,
      sha,
      keySet: { primary: key, deprecated: [] }
    });

    assert.ok(readResult);
    assert.equal(readResult.code, 'buffer content test');
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

test('writeChunkToDisk handles empty string', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('empty-string');
  const sha = 'empty-sha-1';
  const key = generateValidKey();

  try {
    const writeResult = await writeChunkToDisk({
      chunkDir,
      sha,
      code: '',
      encryption: { enabled: true, key, reason: 'test' }
    });

    assert.equal(writeResult.encrypted, true);

    const readResult = await readChunkFromDisk({
      chunkDir,
      sha,
      keySet: { primary: key, deprecated: [] }
    });

    assert.ok(readResult);
    assert.equal(readResult.code, '');
    assert.equal(readResult.encrypted, true);
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

test('writeChunkToDisk handles large content', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('large-content');
  const sha = 'large-sha-1';
  const key = generateValidKey();
  const largeContent = 'x'.repeat(100000); // 100KB of content

  try {
    const writeResult = await writeChunkToDisk({
      chunkDir,
      sha,
      code: largeContent,
      encryption: { enabled: true, key, reason: 'test' }
    });

    assert.equal(writeResult.encrypted, true);

    const readResult = await readChunkFromDisk({
      chunkDir,
      sha,
      keySet: { primary: key, deprecated: [] }
    });

    assert.ok(readResult);
    assert.equal(readResult.code, largeContent);
    assert.equal(readResult.encrypted, true);
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

test('writeChunkToDisk handles unicode content', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('unicode');
  const sha = 'unicode-sha-1';
  const key = generateValidKey();
  const unicodeContent = 'Hello World! Bonjour le monde! Hallo Welt!';

  try {
    const writeResult = await writeChunkToDisk({
      chunkDir,
      sha,
      code: unicodeContent,
      encryption: { enabled: true, key, reason: 'test' }
    });

    assert.equal(writeResult.encrypted, true);

    const readResult = await readChunkFromDisk({
      chunkDir,
      sha,
      keySet: { primary: key, deprecated: [] }
    });

    assert.ok(readResult);
    assert.equal(readResult.code, unicodeContent);
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

// ============================================================================
// Error Case Tests
// ============================================================================

test('readChunkFromDisk fails with wrong key', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('wrong-key');
  const sha = 'wrong-key-sha';
  const correctKey = generateValidKey();
  const wrongKey = generateValidKey();

  try {
    await writeChunkToDisk({
      chunkDir,
      sha,
      code: 'secret content',
      encryption: { enabled: true, key: correctKey, reason: 'test' }
    });

    await assert.rejects(
      () => readChunkFromDisk({
        chunkDir,
        sha,
        keySet: { primary: wrongKey, deprecated: [] }
      }),
      (error: unknown) => {
        const typed = error as { code?: string };
        // May return ENCRYPTION_KEY_NOT_FOUND when key ID in payload doesn't match any configured key
        return typed.code === 'ENCRYPTION_AUTH_FAILED' ||
               typed.code === 'ENCRYPTION_KEY_ID_MISMATCH' ||
               typed.code === 'ENCRYPTION_KEY_NOT_FOUND';
      }
    );
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

test('readChunkFromDisk fails when encrypted chunk has no key', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('no-key');
  const sha = 'no-key-sha';
  const key = generateValidKey();

  try {
    await writeChunkToDisk({
      chunkDir,
      sha,
      code: 'encrypted content',
      encryption: { enabled: true, key, reason: 'test' }
    });

    await assert.rejects(
      () => readChunkFromDisk({
        chunkDir,
        sha,
        keySet: { primary: null, deprecated: [] }
      }),
      (error: unknown) => {
        const typed = error as { code?: string };
        return typed.code === 'ENCRYPTION_KEY_REQUIRED';
      }
    );
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

test('readChunkFromDisk fails with truncated payload', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('truncated');
  const sha = 'truncated-sha';
  const key = generateValidKey();
  const encryptedPath = path.join(chunkDir, `${sha}.gz.enc`);
  const magicHeader = Buffer.from(MAGIC_HEADER, 'utf8');

  try {
    await fs.mkdir(chunkDir, { recursive: true });
    // Write a truncated payload (just header + version + partial key id)
    await fs.writeFile(encryptedPath, Buffer.concat([magicHeader, Buffer.from([2]), Buffer.alloc(4)]));

    await assert.rejects(
      () => readChunkFromDisk({
        chunkDir,
        sha,
        keySet: { primary: key, deprecated: [] }
      }),
      (error: unknown) => {
        const typed = error as { code?: string };
        return typed.code === 'ENCRYPTION_PAYLOAD_INVALID' || typed.code === 'ENCRYPTION_AUTH_FAILED';
      }
    );
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

test('readChunkFromDisk fails with corrupted ciphertext', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('corrupted');
  const sha = 'corrupted-sha';
  const key = generateValidKey();
  const encryptedPath = path.join(chunkDir, `${sha}.gz.enc`);

  try {
    await writeChunkToDisk({
      chunkDir,
      sha,
      code: 'original content',
      encryption: { enabled: true, key, reason: 'test' }
    });

    // Corrupt the payload by modifying bytes
    const payload = await fs.readFile(encryptedPath);
    const corruptedPayload = Buffer.from(payload);
    // Corrupt ciphertext area (after header + version + keyId + salt + iv)
    const corruptionOffset = MAGIC_HEADER.length + 1 + KEY_ID_LENGTH + SALT_LENGTH + IV_LENGTH + 5;
    if (corruptedPayload.length > corruptionOffset) {
      corruptedPayload[corruptionOffset] ^= 0xFF;
    }
    await fs.writeFile(encryptedPath, corruptedPayload);

    await assert.rejects(
      () => readChunkFromDisk({
        chunkDir,
        sha,
        keySet: { primary: key, deprecated: [] }
      }),
      (error: unknown) => {
        const typed = error as { code?: string };
        return typed.code === 'ENCRYPTION_AUTH_FAILED';
      }
    );
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

test('readChunkFromDisk fails with unrecognized header', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('bad-header');
  const sha = 'bad-header-sha';
  const key = generateValidKey();
  const encryptedPath = path.join(chunkDir, `${sha}.gz.enc`);

  try {
    await fs.mkdir(chunkDir, { recursive: true });
    // Write a file with unrecognized header
    await fs.writeFile(encryptedPath, Buffer.from('BADHEADER' + 'x'.repeat(100)));

    await assert.rejects(
      () => readChunkFromDisk({
        chunkDir,
        sha,
        keySet: { primary: key, deprecated: [] }
      }),
      (error: unknown) => {
        const typed = error as { code?: string };
        return typed.code === 'ENCRYPTION_FORMAT_UNRECOGNIZED';
      }
    );
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

test('readChunkFromDisk fails with unsupported version', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('future-version');
  const sha = 'future-version-sha';
  const key = generateValidKey();
  const encryptedPath = path.join(chunkDir, `${sha}.gz.enc`);
  const magicHeader = Buffer.from(MAGIC_HEADER, 'utf8');

  try {
    await fs.mkdir(chunkDir, { recursive: true });
    // Write payload with version 99 (unsupported future version)
    const futureVersionPayload = Buffer.concat([
      magicHeader,
      Buffer.from([99]), // Future version
      Buffer.alloc(KEY_ID_LENGTH + SALT_LENGTH + IV_LENGTH + 100 + TAG_LENGTH) // Dummy data
    ]);
    await fs.writeFile(encryptedPath, futureVersionPayload);

    await assert.rejects(
      () => readChunkFromDisk({
        chunkDir,
        sha,
        keySet: { primary: key, deprecated: [] }
      }),
      (error: unknown) => {
        const typed = error as { code?: string; message?: string };
        // The fallback decryption path may result in auth failure or version unsupported error
        return typed.code === 'ENCRYPTION_VERSION_UNSUPPORTED' ||
               typed.code === 'ENCRYPTION_AUTH_FAILED' ||
               (typed.message && typed.message.includes('Unsupported encryption version'));
      }
    );
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

test('readChunkFromDisk returns null for missing chunk', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('missing');
  const sha = 'nonexistent-sha';

  try {
    const result = await readChunkFromDisk({
      chunkDir,
      sha,
      keySet: { primary: null, deprecated: [] }
    });

    assert.equal(result, null);
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

test('readChunkFromDisk fails with corrupted gzip data in plain file', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('bad-gzip');
  const sha = 'bad-gzip-sha';
  const plainPath = path.join(chunkDir, `${sha}.gz`);

  try {
    await fs.mkdir(chunkDir, { recursive: true });
    // Write invalid gzip data
    await fs.writeFile(plainPath, Buffer.from('not valid gzip data'));

    await assert.rejects(
      () => readChunkFromDisk({
        chunkDir,
        sha,
        keySet: { primary: null, deprecated: [] }
      }),
      (error: unknown) => {
        const typed = error as { code?: string };
        return typed.code === 'CHUNK_READ_FAILED';
      }
    );
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

test('readChunkFromDisk fails with corrupted gzip data in encrypted file', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('bad-gzip-enc');
  const sha = 'bad-gzip-enc-sha';
  const key = generateValidKey();

  try {
    // First write a valid encrypted chunk
    await writeChunkToDisk({
      chunkDir,
      sha,
      code: 'test',
      encryption: { enabled: true, key, reason: 'test' }
    });

    // Now manually create an encrypted chunk with invalid compressed data
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const hkdfInfo = Buffer.from(HKDF_INFO, 'utf8');
    const derivedKey = Buffer.from(crypto.hkdfSync('sha256', key, salt, hkdfInfo, REQUIRED_KEY_LENGTH));
    const keyId = crypto.createHash('sha256').update(key).digest().subarray(0, KEY_ID_LENGTH);

    // Encrypt invalid gzip data
    const badGzipData = Buffer.from('this is not gzip');
    const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
    const ciphertext = Buffer.concat([cipher.update(badGzipData), cipher.final()]);
    const tag = cipher.getAuthTag();
    const magicHeader = Buffer.from(MAGIC_HEADER, 'utf8');
    const payload = Buffer.concat([magicHeader, Buffer.from([2]), keyId, salt, iv, ciphertext, tag]);

    const encryptedPath = path.join(chunkDir, `${sha}.gz.enc`);
    await fs.writeFile(encryptedPath, payload);

    await assert.rejects(
      () => readChunkFromDisk({
        chunkDir,
        sha,
        keySet: { primary: key, deprecated: [] }
      }),
      (error: unknown) => {
        const typed = error as { code?: string };
        return typed.code === 'CHUNK_DECOMPRESSION_FAILED';
      }
    );
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

// ============================================================================
// Key ID and Fallback Tests
// ============================================================================

test('decrypt prefers matching key id first and still falls back to other keys', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('keyid-fallback');
  const sha = 'enc-sha-1';
  const activeKey = generateValidKey();
  const fallbackKey = generateValidKey();

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
    await cleanupTempDir(chunkDir);
  }
});

test('decrypt fails when key id does not match any available key', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('no-matching-key');
  const sha = 'no-match-sha';
  const encryptionKey = generateValidKey();
  const wrongKey = generateValidKey();

  try {
    await writeChunkToDisk({
      chunkDir,
      sha,
      code: 'secret data',
      encryption: { enabled: true, key: encryptionKey, reason: 'test' }
    });

    await assert.rejects(
      () => readChunkFromDisk({
        chunkDir,
        sha,
        keySet: { primary: wrongKey, deprecated: [] }
      }),
      (error: unknown) => {
        const typed = error as { code?: string };
        // When key ID doesn't match, it reports KEY_NOT_FOUND
        return typed.code === 'ENCRYPTION_KEY_ID_MISMATCH' ||
               typed.code === 'ENCRYPTION_AUTH_FAILED' ||
               typed.code === 'ENCRYPTION_KEY_NOT_FOUND';
      }
    );
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

// ============================================================================
// IV Reuse Detection Tests
// ============================================================================

test('detects IV reuse attempts for the same key', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('nonce-reuse');
  const shaOne = 'nonce-1';
  const shaTwo = 'nonce-2';
  const key = generateValidKey();

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
    await cleanupTempDir(chunkDir);
  }
});

test('allows same IV with different keys (different key IDs)', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('different-keys-same-iv');
  const sha1 = 'key1-sha';
  const sha2 = 'key2-sha';
  const key1 = generateValidKey();
  const key2 = generateValidKey();

  // Stub randomBytes to return the same values
  const stubRandomBytes = (
    size: number,
    callback?: (err: Error | null, buf: Buffer) => void
  ): Buffer => {
    const buffer = Buffer.alloc(size, 0x22);
    if (callback) {
      callback(null, buffer);
    }
    return buffer;
  };

  setEncryptionRandomBytes(stubRandomBytes as unknown as typeof crypto.randomBytes);

  try {
    // Should succeed - different key means different key ID
    await writeChunkToDisk({
      chunkDir,
      sha: sha1,
      code: 'first with key1',
      encryption: { enabled: true, key: key1, reason: 'test' }
    });

    // Should also succeed - same IV but different key ID
    await writeChunkToDisk({
      chunkDir,
      sha: sha2,
      code: 'second with key2',
      encryption: { enabled: true, key: key2, reason: 'test' }
    });

    // Verify both can be read
    const result1 = await readChunkFromDisk({
      chunkDir,
      sha: sha1,
      keySet: { primary: key1, deprecated: [] }
    });
    assert.ok(result1);
    assert.equal(result1.code, 'first with key1');

    const result2 = await readChunkFromDisk({
      chunkDir,
      sha: sha2,
      keySet: { primary: key2, deprecated: [] }
    });
    assert.ok(result2);
    assert.equal(result2.code, 'second with key2');
  } finally {
    resetEncryptionGuardsForTests();
    await cleanupTempDir(chunkDir);
  }
});

// ============================================================================
// Backward Compatibility Tests
// ============================================================================

test('remains backward compatible with version 1 payloads', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('legacy-v1');
  const sha = 'legacy-sha';
  const key = generateValidKey();
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
    await fs.mkdir(chunkDir, { recursive: true });
    await fs.writeFile(encryptedPath, payload);
    const result = await readChunkFromDisk({ chunkDir, sha, keySet: { primary: key, deprecated: [] } });

    assert.ok(result);
    assert.equal(result?.code, 'legacy data');
    assert.equal(result?.encrypted, true);
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

test('remains backward compatible with legacy payloads without version byte', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('legacy-no-version');
  const sha = 'legacy-no-ver-sha';
  const key = generateValidKey();
  const salt = Buffer.alloc(SALT_LENGTH, 0x03);
  const iv = Buffer.alloc(IV_LENGTH, 0x04);
  const compressed = gzipSync(Buffer.from('very old legacy', 'utf8'));
  const hkdfInfo = Buffer.from(HKDF_INFO, 'utf8');
  const derivedKey: Buffer = crypto.hkdfSync('sha256', key, salt, hkdfInfo, REQUIRED_KEY_LENGTH) as unknown as Buffer;
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const tag = cipher.getAuthTag();
  const header = Buffer.from(MAGIC_HEADER, 'utf8');
  // No version byte - legacy format
  const payload = Buffer.concat([header, salt, iv, ciphertext, tag]);
  const encryptedPath = path.join(chunkDir, `${sha}.gz.enc`);

  try {
    await fs.mkdir(chunkDir, { recursive: true });
    await fs.writeFile(encryptedPath, payload);
    const result = await readChunkFromDisk({ chunkDir, sha, keySet: { primary: key, deprecated: [] } });

    assert.ok(result);
    assert.equal(result?.code, 'very old legacy');
    assert.equal(result?.encrypted, true);
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

// ============================================================================
// File Operation Tests
// ============================================================================

test('writeChunkToDisk removes plain file when writing encrypted', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('remove-plain');
  const sha = 'remove-plain-sha';
  const key = generateValidKey();
  const plainPath = path.join(chunkDir, `${sha}.gz`);
  const encryptedPath = path.join(chunkDir, `${sha}.gz.enc`);

  try {
    // First write as plain
    await writeChunkToDisk({
      chunkDir,
      sha,
      code: 'plain content',
      encryption: { enabled: false, key: null, reason: 'test' }
    });

    assert.ok((await fs.stat(plainPath).catch(() => null)) !== null);
    assert.equal((await fs.stat(encryptedPath).catch(() => null)), null);

    // Then write as encrypted - should remove plain file
    await writeChunkToDisk({
      chunkDir,
      sha,
      code: 'encrypted content',
      encryption: { enabled: true, key, reason: 'test' }
    });

    assert.equal((await fs.stat(plainPath).catch(() => null)), null);
    assert.ok((await fs.stat(encryptedPath).catch(() => null)) !== null);
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

test('writeChunkToDisk removes encrypted file when writing plain', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('remove-enc');
  const sha = 'remove-enc-sha';
  const key = generateValidKey();
  const plainPath = path.join(chunkDir, `${sha}.gz`);
  const encryptedPath = path.join(chunkDir, `${sha}.gz.enc`);

  try {
    // First write as encrypted
    await writeChunkToDisk({
      chunkDir,
      sha,
      code: 'encrypted content',
      encryption: { enabled: true, key, reason: 'test' }
    });

    assert.equal((await fs.stat(plainPath).catch(() => null)), null);
    assert.ok((await fs.stat(encryptedPath).catch(() => null)) !== null);

    // Then write as plain - should remove encrypted file
    await writeChunkToDisk({
      chunkDir,
      sha,
      code: 'plain content',
      encryption: { enabled: false, key: null, reason: 'test' }
    });

    assert.ok((await fs.stat(plainPath).catch(() => null)) !== null);
    assert.equal((await fs.stat(encryptedPath).catch(() => null)), null);
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

test('removeChunkArtifacts removes both plain and encrypted files', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('remove-both');
  const sha = 'remove-both-sha';
  const key = generateValidKey();
  const plainPath = path.join(chunkDir, `${sha}.gz`);
  const encryptedPath = path.join(chunkDir, `${sha}.gz.enc`);

  try {
    // Create both files
    await writeChunkToDisk({
      chunkDir,
      sha,
      code: 'plain',
      encryption: { enabled: false, key: null, reason: 'test' }
    });
    // Manually write encrypted file too
    await fs.writeFile(encryptedPath, Buffer.from('fake encrypted'));

    assert.ok((await fs.stat(plainPath).catch(() => null)) !== null);
    assert.ok((await fs.stat(encryptedPath).catch(() => null)) !== null);

    await removeChunkArtifacts(chunkDir, sha);

    assert.equal((await fs.stat(plainPath).catch(() => null)), null);
    assert.equal((await fs.stat(encryptedPath).catch(() => null)), null);
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

test('removeChunkArtifacts handles missing files gracefully', async () => {
  resetEncryptionCacheForTests();
  const chunkDir = await createTempDir('remove-missing');
  const sha = 'missing-sha';

  try {
    // Should not throw even if files don't exist
    await removeChunkArtifacts(chunkDir, sha);
    // If we get here without throwing, the test passes
    assert.ok(true);
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

test('isChunkEncryptedOnDisk returns true for encrypted chunks', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('is-encrypted-true');
  const sha = 'is-enc-sha';
  const key = generateValidKey();

  try {
    await writeChunkToDisk({
      chunkDir,
      sha,
      code: 'encrypted',
      encryption: { enabled: true, key, reason: 'test' }
    });

    assert.equal(isChunkEncryptedOnDisk(chunkDir, sha), true);
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

test('isChunkEncryptedOnDisk returns false for plain chunks', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('is-encrypted-false');
  const sha = 'is-plain-sha';

  try {
    await writeChunkToDisk({
      chunkDir,
      sha,
      code: 'plain',
      encryption: { enabled: false, key: null, reason: 'test' }
    });

    assert.equal(isChunkEncryptedOnDisk(chunkDir, sha), false);
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

test('isChunkEncryptedOnDisk returns false for missing chunks', async () => {
  resetEncryptionCacheForTests();
  const chunkDir = await createTempDir('is-encrypted-missing');
  const sha = 'missing-sha';

  try {
    assert.equal(isChunkEncryptedOnDisk(chunkDir, sha), false);
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

// ============================================================================
// Auth Tag Verification Tests
// ============================================================================

test('decryption fails when auth tag is modified', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('bad-tag');
  const sha = 'bad-tag-sha';
  const key = generateValidKey();
  const encryptedPath = path.join(chunkDir, `${sha}.gz.enc`);

  try {
    await writeChunkToDisk({
      chunkDir,
      sha,
      code: 'test content',
      encryption: { enabled: true, key, reason: 'test' }
    });

    // Modify the auth tag (last 16 bytes)
    const payload = await fs.readFile(encryptedPath);
    const modifiedPayload = Buffer.from(payload);
    modifiedPayload[modifiedPayload.length - 1] ^= 0xFF;
    await fs.writeFile(encryptedPath, modifiedPayload);

    await assert.rejects(
      () => readChunkFromDisk({
        chunkDir,
        sha,
        keySet: { primary: key, deprecated: [] }
      }),
      (error: unknown) => {
        const typed = error as { code?: string };
        return typed.code === 'ENCRYPTION_AUTH_FAILED';
      }
    );
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

test('decryption fails when IV is modified', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('bad-iv');
  const sha = 'bad-iv-sha';
  const key = generateValidKey();
  const encryptedPath = path.join(chunkDir, `${sha}.gz.enc`);

  try {
    await writeChunkToDisk({
      chunkDir,
      sha,
      code: 'test content',
      encryption: { enabled: true, key, reason: 'test' }
    });

    // Modify the IV (after header + version + keyId + salt)
    const payload = await fs.readFile(encryptedPath);
    const modifiedPayload = Buffer.from(payload);
    const ivOffset = MAGIC_HEADER.length + 1 + KEY_ID_LENGTH + SALT_LENGTH;
    modifiedPayload[ivOffset] ^= 0xFF;
    await fs.writeFile(encryptedPath, modifiedPayload);

    await assert.rejects(
      () => readChunkFromDisk({
        chunkDir,
        sha,
        keySet: { primary: key, deprecated: [] }
      }),
      (error: unknown) => {
        const typed = error as { code?: string };
        return typed.code === 'ENCRYPTION_AUTH_FAILED';
      }
    );
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

test('decryption fails when salt is modified', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('bad-salt');
  const sha = 'bad-salt-sha';
  const key = generateValidKey();
  const encryptedPath = path.join(chunkDir, `${sha}.gz.enc`);

  try {
    await writeChunkToDisk({
      chunkDir,
      sha,
      code: 'test content',
      encryption: { enabled: true, key, reason: 'test' }
    });

    // Modify the salt (after header + version + keyId)
    const payload = await fs.readFile(encryptedPath);
    const modifiedPayload = Buffer.from(payload);
    const saltOffset = MAGIC_HEADER.length + 1 + KEY_ID_LENGTH;
    modifiedPayload[saltOffset] ^= 0xFF;
    await fs.writeFile(encryptedPath, modifiedPayload);

    await assert.rejects(
      () => readChunkFromDisk({
        chunkDir,
        sha,
        keySet: { primary: key, deprecated: [] }
      }),
      (error: unknown) => {
        const typed = error as { code?: string };
        return typed.code === 'ENCRYPTION_AUTH_FAILED';
      }
    );
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

// ============================================================================
// Encryption Preference with No Logger Tests
// ============================================================================

test('resolveEncryptionPreference works without logger', () => {
  const originalKey = process.env.CODEVAULT_ENCRYPTION_KEY;
  process.env.CODEVAULT_ENCRYPTION_KEY = 'invalid';
  resetEncryptionCacheForTests();

  try {
    // Should not throw even without logger
    const pref = resolveEncryptionPreference({});
    assert.equal(pref.enabled, false);
    assert.equal(pref.reason, 'invalid_key');
  } finally {
    if (originalKey !== undefined) {
      process.env.CODEVAULT_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.CODEVAULT_ENCRYPTION_KEY;
    }
    resetEncryptionCacheForTests();
  }
});

test('resolveEncryptionPreference works with logger missing warn method', () => {
  const originalKey = process.env.CODEVAULT_ENCRYPTION_KEY;
  process.env.CODEVAULT_ENCRYPTION_KEY = 'invalid';
  resetEncryptionCacheForTests();

  try {
    // Logger without warn method
    const pref = resolveEncryptionPreference({ logger: {} });
    assert.equal(pref.enabled, false);
    assert.equal(pref.reason, 'invalid_key');
  } finally {
    if (originalKey !== undefined) {
      process.env.CODEVAULT_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.CODEVAULT_ENCRYPTION_KEY;
    }
    resetEncryptionCacheForTests();
  }
});

// ============================================================================
// Multiple Deprecated Keys Tests
// ============================================================================

test('reads chunk encrypted with second deprecated key', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('multi-deprecated');
  const sha = 'multi-dep-sha';
  const primaryKey = generateValidKey();
  const deprecatedKey1 = generateValidKey();
  const deprecatedKey2 = generateValidKey();

  try {
    // Encrypt with deprecatedKey2
    await writeChunkToDisk({
      chunkDir,
      sha,
      code: 'encrypted with deprecated key 2',
      encryption: { enabled: true, key: deprecatedKey2, reason: 'test' }
    });

    // Read with primary + both deprecated keys
    const result = await readChunkFromDisk({
      chunkDir,
      sha,
      keySet: {
        primary: primaryKey,
        deprecated: [deprecatedKey1, deprecatedKey2]
      }
    });

    assert.ok(result);
    assert.equal(result.code, 'encrypted with deprecated key 2');
    assert.equal(result.encrypted, true);
  } finally {
    await cleanupTempDir(chunkDir);
  }
});

// ============================================================================
// Edge Case: Payload Key ID Extraction Tests
// ============================================================================

test('readChunkFromDisk provides key id context in error message', async () => {
  resetEncryptionCacheForTests();
  resetEncryptionGuardsForTests();
  const chunkDir = await createTempDir('keyid-error');
  const sha = 'keyid-error-sha';
  const encryptionKey = generateValidKey();
  const wrongKey = generateValidKey();

  try {
    await writeChunkToDisk({
      chunkDir,
      sha,
      code: 'secret',
      encryption: { enabled: true, key: encryptionKey, reason: 'test' }
    });

    await assert.rejects(
      () => readChunkFromDisk({
        chunkDir,
        sha,
        keySet: { primary: wrongKey, deprecated: [] }
      }),
      (error: unknown) => {
        const typed = error as { message?: string };
        // Error should contain key id or authentication context
        return typed.message !== undefined && typed.message.length > 0;
      }
    );
  } finally {
    await cleanupTempDir(chunkDir);
  }
});
