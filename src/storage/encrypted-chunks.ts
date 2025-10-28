import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const KEY_ENV_VAR = 'CODEVAULT_ENCRYPTION_KEY';
const MAGIC_HEADER = Buffer.from('CVAULTE1', 'utf8');
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HKDF_INFO = Buffer.from('codevault-chunk-v1', 'utf8');

let cachedNormalizedKey: string | null = null;
let cachedKeyBuffer: Buffer | null = null;
let cachedKeyError: Error | null = null;

function decodeKey(raw: string): Buffer | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }

  try {
    const base64 = Buffer.from(trimmed, 'base64');
    if (base64.length === 32) {
      return base64;
    }
  } catch (error) {
    // Ignore decoding errors
  }

  try {
    const hex = Buffer.from(trimmed, 'hex');
    if (hex.length === 32) {
      return hex;
    }
  } catch (error) {
    // Ignore decoding errors
  }

  return null;
}

export function resetEncryptionCacheForTests(): void {
  cachedNormalizedKey = null;
  cachedKeyBuffer = null;
  cachedKeyError = null;
}

export function getActiveEncryptionKey(): Buffer | null {
  const raw = process.env[KEY_ENV_VAR];
  const normalized = typeof raw === 'string' ? raw.trim() : '';

  // FIX: Always check if env var changed to support runtime updates
  if (normalized === cachedNormalizedKey && cachedKeyBuffer) {
    return cachedKeyBuffer;
  }

  // Invalidate cache when environment variable changes
  cachedNormalizedKey = normalized;
  cachedKeyError = null;
  cachedKeyBuffer = null;

  if (!normalized) {
    return null;
  }

  const decoded = decodeKey(normalized);
  if (!decoded) {
    cachedKeyError = new Error(`${KEY_ENV_VAR} must be a 32-byte key encoded as base64 or hex.`);
    return null;
  }

  cachedKeyBuffer = decoded;
  return cachedKeyBuffer;
}

export function getEncryptionKeyError(): Error | null {
  return cachedKeyError;
}

const warnedInvalidMode = new Set<string>();
let warnedInvalidKey = false;

function normalizeMode(mode: any): string | undefined {
  if (typeof mode !== 'string') {
    return undefined;
  }
  return mode.trim().toLowerCase();
}

interface Logger {
  warn?: (message: string) => void;
}

export interface EncryptionPreference {
  enabled: boolean;
  key: Buffer | null;
  reason: string;
}

export function resolveEncryptionPreference({ mode, logger = console }: { mode?: string; logger?: Logger } = {}): EncryptionPreference {
  const normalizedMode = normalizeMode(mode);

  if (normalizedMode && normalizedMode !== 'on' && normalizedMode !== 'off' && !warnedInvalidMode.has(normalizedMode)) {
    if (logger && typeof logger.warn === 'function') {
      logger.warn(`Unknown --encrypt mode "${mode}". Expected "on" or "off". Falling back to environment configuration.`);
    }
    warnedInvalidMode.add(normalizedMode);
  }

  if (normalizedMode === 'off') {
    return { enabled: false, key: null, reason: 'flag_off' };
  }

  const key = getActiveEncryptionKey();
  if (!key) {
    const keyError = getEncryptionKeyError();
    if (normalizedMode === 'on') {
      throw keyError || new Error('CODEVAULT_ENCRYPTION_KEY is not configured but encryption was requested (--encrypt on).');
    }
    if (keyError && !warnedInvalidKey && logger && typeof logger.warn === 'function') {
      logger.warn(`${keyError.message} Encryption disabled.`);
      warnedInvalidKey = true;
    }
    return { enabled: false, key: null, reason: keyError ? 'invalid_key' : 'missing_key' };
  }

  return { enabled: true, key, reason: 'enabled' };
}

function deriveChunkKey(masterKey: Buffer, salt: Buffer): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', masterKey, salt, HKDF_INFO, 32));
}

function encryptBuffer(plaintext: Buffer, masterKey: Buffer): { payload: Buffer; salt: Buffer; iv: Buffer; tag: Buffer } {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const derivedKey = deriveChunkKey(masterKey, salt);

  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload = Buffer.concat([MAGIC_HEADER, salt, iv, encrypted, tag]);
  return { payload, salt, iv, tag };
}

function decryptBuffer(payload: Buffer, masterKey: Buffer): Buffer {
  const minimumLength = MAGIC_HEADER.length + SALT_LENGTH + IV_LENGTH + TAG_LENGTH + 1;
  if (!payload || payload.length < minimumLength) {
    const error: any = new Error('Encrypted chunk payload is truncated.');
    error.code = 'ENCRYPTION_PAYLOAD_INVALID';
    throw error;
  }

  const header = payload.subarray(0, MAGIC_HEADER.length);
  if (!header.equals(MAGIC_HEADER)) {
    const error: any = new Error('Encrypted chunk payload has an unknown header.');
    error.code = 'ENCRYPTION_FORMAT_UNRECOGNIZED';
    throw error;
  }

  const saltStart = MAGIC_HEADER.length;
  const ivStart = saltStart + SALT_LENGTH;
  const cipherStart = ivStart + IV_LENGTH;
  const cipherEnd = payload.length - TAG_LENGTH;

  const salt = payload.subarray(saltStart, saltStart + SALT_LENGTH);
  const iv = payload.subarray(ivStart, ivStart + IV_LENGTH);
  const ciphertext = payload.subarray(cipherStart, cipherEnd);
  const tag = payload.subarray(cipherEnd);

  const derivedKey = deriveChunkKey(masterKey, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (error) {
    const authError: any = new Error('authentication failed');
    authError.code = 'ENCRYPTION_AUTH_FAILED';
    authError.cause = error;
    throw authError;
  }
}

function getChunkPaths(chunkDir: string, sha: string): { plainPath: string; encryptedPath: string } {
  const plainPath = path.join(chunkDir, `${sha}.gz`);
  const encryptedPath = path.join(chunkDir, `${sha}.gz.enc`);
  return { plainPath, encryptedPath };
}

export interface WriteChunkOptions {
  chunkDir: string;
  sha: string;
  code: string | Buffer;
  encryption?: EncryptionPreference;
}

export interface WriteChunkResult {
  encrypted: boolean;
  path: string;
}

export function writeChunkToDisk({ chunkDir, sha, code, encryption }: WriteChunkOptions): WriteChunkResult {
  const { plainPath, encryptedPath } = getChunkPaths(chunkDir, sha);
  const buffer = Buffer.isBuffer(code) ? code : Buffer.from(code, 'utf8');
  const compressed = zlib.gzipSync(buffer);

  if (encryption && encryption.enabled && encryption.key) {
    const { payload } = encryptBuffer(compressed, encryption.key);
    fs.writeFileSync(encryptedPath, payload);
    if (fs.existsSync(plainPath)) {
      fs.rmSync(plainPath, { force: true });
    }
    return { encrypted: true, path: encryptedPath };
  }

  fs.writeFileSync(plainPath, compressed);
  if (fs.existsSync(encryptedPath)) {
    fs.rmSync(encryptedPath, { force: true });
  }
  return { encrypted: false, path: plainPath };
}

export interface ReadChunkOptions {
  chunkDir: string;
  sha: string;
  key?: Buffer | null;
}

export interface ReadChunkResult {
  code: string;
  encrypted: boolean;
}

export function readChunkFromDisk({ chunkDir, sha, key = getActiveEncryptionKey() }: ReadChunkOptions): ReadChunkResult | null {
  const { plainPath, encryptedPath } = getChunkPaths(chunkDir, sha);

  if (fs.existsSync(encryptedPath)) {
    if (!key) {
      const error: any = new Error(`Chunk ${sha} is encrypted and no CODEVAULT_ENCRYPTION_KEY is configured.`);
      error.code = 'ENCRYPTION_KEY_REQUIRED';
      throw error;
    }

    const payload = fs.readFileSync(encryptedPath);
    let decrypted: Buffer;
    try {
      decrypted = decryptBuffer(payload, key);
    } catch (error: any) {
      if (error.code === 'ENCRYPTION_AUTH_FAILED') {
        const authError: any = new Error(`Failed to decrypt chunk ${sha}: authentication failed.`);
        authError.code = 'ENCRYPTION_AUTH_FAILED';
        authError.cause = error;
        throw authError;
      }
      error.message = `Failed to decrypt chunk ${sha}: ${error.message}`;
      throw error;
    }

    try {
      const code = zlib.gunzipSync(decrypted).toString('utf8');
      return { code, encrypted: true };
    } catch (error: any) {
      const decompressionError: any = new Error(`Failed to decompress chunk ${sha}: ${error.message}`);
      decompressionError.code = 'CHUNK_DECOMPRESSION_FAILED';
      decompressionError.cause = error;
      throw decompressionError;
    }
  }

  if (fs.existsSync(plainPath)) {
    try {
      const compressed = fs.readFileSync(plainPath);
      const code = zlib.gunzipSync(compressed).toString('utf8');
      return { code, encrypted: false };
    } catch (error: any) {
      const readError: any = new Error(`Failed to read chunk ${sha}: ${error.message}`);
      readError.code = 'CHUNK_READ_FAILED';
      readError.cause = error;
      throw readError;
    }
  }

  return null;
}

export function removeChunkArtifacts(chunkDir: string, sha: string): void {
  const { plainPath, encryptedPath } = getChunkPaths(chunkDir, sha);
  if (fs.existsSync(plainPath)) {
    fs.rmSync(plainPath, { force: true });
  }
  if (fs.existsSync(encryptedPath)) {
    fs.rmSync(encryptedPath, { force: true });
  }
}

export function isChunkEncryptedOnDisk(chunkDir: string, sha: string): boolean {
  const { encryptedPath } = getChunkPaths(chunkDir, sha);
  return fs.existsSync(encryptedPath);
}