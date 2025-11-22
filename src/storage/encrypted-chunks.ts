import crypto from 'crypto';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'node:util';
import { log } from '../utils/logger.js';
import { ENCRYPTION_CONSTANTS } from '../config/constants.js';

const {
  MAGIC_HEADER,
  SALT_LENGTH,
  IV_LENGTH,
  TAG_LENGTH,
  HKDF_INFO,
  REQUIRED_KEY_LENGTH,
  KEY_ID_LENGTH
} = ENCRYPTION_CONSTANTS;
const MAGIC_HEADER_BUFFER = Buffer.from(MAGIC_HEADER, 'utf8');
const HKDF_INFO_BUFFER = Buffer.from(HKDF_INFO, 'utf8');

const KEY_ENV_VAR = 'CODEVAULT_ENCRYPTION_KEY';
const DEPRECATED_KEYS_ENV_VAR = 'CODEVAULT_ENCRYPTION_DEPRECATED_KEYS';
const CURRENT_ENCRYPTION_VERSION = 2;
const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

type KeyDecodeResult =
  | { key: Buffer; error: null }
  | { key: null; error: Error | null };

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
    if (base64.length === REQUIRED_KEY_LENGTH) {
      return base64;
    }
  } catch (error) {
    log.debug('Failed to decode key as base64, will try hex', {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  try {
    const hex = Buffer.from(trimmed, 'hex');
    if (hex.length === REQUIRED_KEY_LENGTH) {
      return hex;
    }
  } catch (error) {
    log.debug('Failed to decode key as hex', {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return null;
}

export interface EncryptionKeySet {
  primary: Buffer | null;
  deprecated: Buffer[];
}

class EncryptionKeyManager {
  private static instance: EncryptionKeyManager | null = null;
  private primaryKey: Buffer | null = null;
  private deprecatedKeys: Buffer[] = [];
  private primaryError: Error | null = null;
  private lastEnvSignature: string | null = null;
  private lastChecked = 0;
  private readonly refreshIntervalMs = 5000;

  static getInstance(): EncryptionKeyManager {
    if (!this.instance) {
      this.instance = new EncryptionKeyManager();
    }
    return this.instance;
  }

  static resetForTests(): void {
    this.instance = new EncryptionKeyManager();
  }

  getKeySet(): EncryptionKeySet {
    this.refreshKeysIfNeeded();
    return {
      primary: this.primaryKey,
      deprecated: this.deprecatedKeys
    };
  }

  getPrimaryKey(): Buffer | null {
    return this.getKeySet().primary;
  }

  getPrimaryError(): Error | null {
    this.refreshKeysIfNeeded();
    return this.primaryError;
  }

  private refreshKeysIfNeeded(): void {
    const now = Date.now();
    const signature = this.getEnvSignature();
    const shouldRefresh =
      !this.lastEnvSignature ||
      signature !== this.lastEnvSignature ||
      now - this.lastChecked > this.refreshIntervalMs;

    if (!shouldRefresh) {
      return;
    }

    this.lastEnvSignature = signature;
    this.lastChecked = now;
    this.loadKeys();
  }

  private loadKeys(): void {
    const primary = this.decodeWithError(process.env[KEY_ENV_VAR] || '');
    const deprecatedRaw = (process.env[DEPRECATED_KEYS_ENV_VAR] || '')
      .split(',')
      .map(key => key.trim())
      .filter(Boolean);

    this.primaryKey = primary.key;
    this.primaryError = primary.error;

    const decodedDeprecated: Buffer[] = [];
    for (const candidate of deprecatedRaw) {
      const decoded = decodeKey(candidate);
      if (decoded) {
        decodedDeprecated.push(decoded);
      } else {
        log.warn('Failed to decode deprecated encryption key; skipping', {
          env: DEPRECATED_KEYS_ENV_VAR
        });
      }
    }
    this.deprecatedKeys = decodedDeprecated;
  }

  private getEnvSignature(): string {
    return `${process.env[KEY_ENV_VAR] || ''}::${process.env[DEPRECATED_KEYS_ENV_VAR] || ''}`;
  }

  private decodeWithError(raw: string): KeyDecodeResult {
    const normalized = typeof raw === 'string' ? raw.trim() : '';
    if (!normalized) {
      return { key: null, error: null };
    }
    const decoded = decodeKey(normalized);
    if (!decoded) {
      return {
        key: null,
        error: new Error(
          `${KEY_ENV_VAR} must be a ${REQUIRED_KEY_LENGTH}-byte key encoded as base64 or hex.`
        )
      };
    }
    return { key: decoded, error: null };
  }
}

export function resetEncryptionCacheForTests(): void {
  EncryptionKeyManager.resetForTests();
}

export function resetEncryptionGuardsForTests(): void {
  usedNonces.clear();
  randomBytesFn = crypto.randomBytes;
}

export function setEncryptionRandomBytes(randomFn: typeof crypto.randomBytes): void {
  randomBytesFn = randomFn;
}

export function getActiveEncryptionKey(): Buffer | null {
  return EncryptionKeyManager.getInstance().getPrimaryKey();
}

export function getEncryptionKeyError(): Error | null {
  return EncryptionKeyManager.getInstance().getPrimaryError();
}

export function getEncryptionKeySet(): EncryptionKeySet {
  return EncryptionKeyManager.getInstance().getKeySet();
}

const warnedInvalidMode = new Set<string>();
let warnedInvalidKey = false;

function normalizeMode(mode: unknown): string | undefined {
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
  return Buffer.from(
    crypto.hkdfSync('sha256', masterKey, salt, HKDF_INFO_BUFFER, REQUIRED_KEY_LENGTH)
  );
}

function computeKeyId(masterKey: Buffer): Buffer {
  return crypto.createHash('sha256').update(masterKey).digest().subarray(0, KEY_ID_LENGTH);
}

const usedNonces = new Set<string>();
const MAX_IV_GENERATION_ATTEMPTS = 3;
let randomBytesFn: typeof crypto.randomBytes = crypto.randomBytes;

function buildNonceKey(keyId: Buffer, salt: Buffer, iv: Buffer): string {
  return `${keyId.toString('hex')}:${salt.toString('hex')}:${iv.toString('hex')}`;
}

function generateUniqueIv(keyId: Buffer, salt: Buffer): Buffer {
  for (let attempt = 0; attempt < MAX_IV_GENERATION_ATTEMPTS; attempt += 1) {
    const iv = randomBytesFn(IV_LENGTH);
    const nonceKey = buildNonceKey(keyId, salt, iv);
    if (!usedNonces.has(nonceKey)) {
      usedNonces.add(nonceKey);
      return iv;
    }
  }

  throw createEncryptionError(
    'IV reuse detected while encrypting chunk; aborting to protect confidentiality.',
    'ENCRYPTION_IV_REUSE'
  );
}

function encryptBuffer(plaintext: Buffer, masterKey: Buffer): {
  payload: Buffer;
  salt: Buffer;
  iv: Buffer;
  tag: Buffer;
  keyId: Buffer;
} {
  const salt = randomBytesFn(SALT_LENGTH);
  const keyId = computeKeyId(masterKey);
  const iv = generateUniqueIv(keyId, salt);
  const derivedKey = deriveChunkKey(masterKey, salt);

  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const versionByte = Buffer.from([CURRENT_ENCRYPTION_VERSION]);
  const payload = Buffer.concat([MAGIC_HEADER_BUFFER, versionByte, keyId, salt, iv, encrypted, tag]);
  return { payload, salt, iv, tag, keyId };
}

interface DecryptionAttempt {
  version: number;
  offset: number;
  includesKeyId: boolean;
  keyId: Buffer | null;
}

function buildDecryptionAttempts(payload: Buffer): DecryptionAttempt[] {
  const attempts: DecryptionAttempt[] = [];
  const versionCandidate = payload[MAGIC_HEADER_BUFFER.length];
  const keyIdStart = MAGIC_HEADER_BUFFER.length + 1;
  const keyIdEnd = keyIdStart + KEY_ID_LENGTH;

  if (versionCandidate === 2) {
    if (payload.length >= keyIdEnd + SALT_LENGTH + IV_LENGTH + TAG_LENGTH + 1) {
      const keyId = payload.subarray(keyIdStart, keyIdEnd);
      attempts.push({
        version: 2,
        offset: keyIdEnd,
        includesKeyId: true,
        keyId
      });
    }
  } else if (versionCandidate === 1) {
    attempts.push({
      version: 1,
      offset: MAGIC_HEADER_BUFFER.length + 1,
      includesKeyId: false,
      keyId: null
    });
  } else if (versionCandidate > CURRENT_ENCRYPTION_VERSION) {
    attempts.push({
      version: versionCandidate,
      offset: MAGIC_HEADER_BUFFER.length + 1,
      includesKeyId: false,
      keyId: null
    });
  }

  // Always include legacy offset (no version byte) for backward compatibility
  attempts.push({ version: 1, offset: MAGIC_HEADER_BUFFER.length, includesKeyId: false, keyId: null });
  return attempts;
}

function extractPayloadKeyId(payload: Buffer): Buffer | null {
  const header = payload.subarray(0, MAGIC_HEADER_BUFFER.length);
  if (!header.equals(MAGIC_HEADER_BUFFER)) {
    return null;
  }

  const versionCandidate = payload[MAGIC_HEADER_BUFFER.length];
  if (versionCandidate !== 2) {
    return null;
  }

  const keyIdStart = MAGIC_HEADER_BUFFER.length + 1;
  const keyIdEnd = keyIdStart + KEY_ID_LENGTH;
  const minimumLength = keyIdEnd + SALT_LENGTH + IV_LENGTH + TAG_LENGTH + 1;
  if (payload.length < minimumLength) {
    return null;
  }

  return payload.subarray(keyIdStart, keyIdEnd);
}

interface EncryptionError extends Error {
  code: string;
  cause?: unknown;
}

function createEncryptionError(message: string, code: string, cause?: unknown): EncryptionError {
  const error = new Error(message) as EncryptionError;
  error.code = code;
  if (cause) {
    error.cause = cause;
  }
  return error;
}

function decryptBuffer(payload: Buffer, masterKey: Buffer): Buffer {
  const header = payload.subarray(0, MAGIC_HEADER_BUFFER.length);
  if (!header.equals(MAGIC_HEADER_BUFFER)) {
    throw createEncryptionError(
      'Encrypted chunk payload has an unknown header.',
      'ENCRYPTION_FORMAT_UNRECOGNIZED'
    );
  }

  const attempts = buildDecryptionAttempts(payload);
  const errors: EncryptionError[] = [];
  const keyIdForKey = computeKeyId(masterKey);

  for (const attempt of attempts) {
    const { version, offset, includesKeyId, keyId } = attempt;
    if (version > CURRENT_ENCRYPTION_VERSION) {
      errors.push(
        createEncryptionError(
          `Unsupported encryption version ${version}`,
          'ENCRYPTION_VERSION_UNSUPPORTED'
        )
      );
      continue;
    }

    if (includesKeyId && keyId && !keyId.equals(keyIdForKey)) {
      errors.push(
        createEncryptionError(
          'Key identifier in payload does not match provided key.',
          'ENCRYPTION_KEY_ID_MISMATCH'
        )
      );
      continue;
    }

    const minimumLength = offset + SALT_LENGTH + IV_LENGTH + TAG_LENGTH + 1;
    if (!payload || payload.length < minimumLength) {
      errors.push(
        createEncryptionError(
          'Encrypted chunk payload is truncated.',
          'ENCRYPTION_PAYLOAD_INVALID'
        )
      );
      continue;
    }

    const saltStart = offset;
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
      errors.push(createEncryptionError('authentication failed', 'ENCRYPTION_AUTH_FAILED', error));
    }
  }

  const finalError = errors[errors.length - 1] || new Error('Decryption failed');
  throw finalError;
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

export async function writeChunkToDisk({ chunkDir, sha, code, encryption }: WriteChunkOptions): Promise<WriteChunkResult> {
  const { plainPath, encryptedPath } = getChunkPaths(chunkDir, sha);
  const buffer = Buffer.isBuffer(code) ? code : Buffer.from(code, 'utf8');
  const compressed = await gzipAsync(buffer);

  if (encryption && encryption.enabled && encryption.key) {
    const { payload } = encryptBuffer(compressed, encryption.key);
    await fs.writeFile(encryptedPath, payload);
    if (existsSync(plainPath)) {
      await fs.rm(plainPath, { force: true });
    }
    return { encrypted: true, path: encryptedPath };
  }

  await fs.writeFile(plainPath, compressed);
  if (existsSync(encryptedPath)) {
    await fs.rm(encryptedPath, { force: true });
  }
  return { encrypted: false, path: plainPath };
}

export interface ReadChunkOptions {
  chunkDir: string;
  sha: string;
  key?: Buffer | null;
  keySet?: EncryptionKeySet;
}

export interface ReadChunkResult {
  code: string;
  encrypted: boolean;
}

export async function readChunkFromDisk({ chunkDir, sha, key, keySet }: ReadChunkOptions): Promise<ReadChunkResult | null> {
  const { plainPath, encryptedPath } = getChunkPaths(chunkDir, sha);
  const keys = keySet || getEncryptionKeySet();
  const primaryKey = key ?? keys.primary;

  if (existsSync(encryptedPath)) {
    const candidateKeys: Array<{ key: Buffer; keyId: Buffer }> = [];
    if (primaryKey) {
      candidateKeys.push({ key: primaryKey, keyId: computeKeyId(primaryKey) });
    }
    if (keys.deprecated.length > 0) {
      for (const deprecatedKey of keys.deprecated) {
        candidateKeys.push({ key: deprecatedKey, keyId: computeKeyId(deprecatedKey) });
      }
    }

    if (candidateKeys.length === 0) {
      throw createEncryptionError(
        `Chunk ${sha} is encrypted and no CODEVAULT_ENCRYPTION_KEY is configured.`,
        'ENCRYPTION_KEY_REQUIRED'
      );
    }

    const payload = await fs.readFile(encryptedPath);
    const payloadKeyId = extractPayloadKeyId(payload);
    const matchingKeys = payloadKeyId
      ? candidateKeys.filter(entry => entry.keyId.equals(payloadKeyId))
      : candidateKeys;
    const fallbackKeys = payloadKeyId
      ? candidateKeys.filter(entry => !entry.keyId.equals(payloadKeyId))
      : [];

    const orderedKeys = payloadKeyId ? [...matchingKeys, ...fallbackKeys] : candidateKeys;
    let decrypted: Buffer | null = null;
    const errors: EncryptionError[] = [];
    for (const candidate of orderedKeys) {
      try {
        decrypted = decryptBuffer(payload, candidate.key);
        break;
      } catch (error) {
        errors.push(error as EncryptionError);
        continue;
      }
    }

    if (!decrypted) {
      if (payloadKeyId && matchingKeys.length === 0) {
        throw createEncryptionError(
          `Chunk ${sha} was encrypted with key id ${payloadKeyId.toString('hex')} but no matching key is configured.`,
          'ENCRYPTION_KEY_NOT_FOUND'
        );
      }

      const lastError = errors[errors.length - 1];
      if (lastError && lastError.code === 'ENCRYPTION_AUTH_FAILED') {
        throw createEncryptionError(
          `Failed to decrypt chunk ${sha}: authentication failed.`,
          'ENCRYPTION_AUTH_FAILED',
          lastError
        );
      }
      const contextHint = payloadKeyId ? ` (key id ${payloadKeyId.toString('hex')})` : '';
      throw createEncryptionError(
        `Failed to decrypt chunk ${sha}${contextHint}: ${lastError?.message || 'unknown error'}`,
        lastError?.code || 'ENCRYPTION_DECRYPT_FAILED',
        lastError
      );
    }

    try {
      const codeBuffer = await gunzipAsync(decrypted);
      const code = codeBuffer.toString('utf8');
      return { code, encrypted: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw createEncryptionError(
        `Failed to decompress chunk ${sha}: ${errorMsg}`,
        'CHUNK_DECOMPRESSION_FAILED',
        error
      );
    }
  }

  if (existsSync(plainPath)) {
    try {
      const compressed = await fs.readFile(plainPath);
      const codeBuffer = await gunzipAsync(compressed);
      const code = codeBuffer.toString('utf8');
      return { code, encrypted: false };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw createEncryptionError(
        `Failed to read chunk ${sha}: ${errorMsg}`,
        'CHUNK_READ_FAILED',
        error
      );
    }
  }

  return null;
}

export async function removeChunkArtifacts(chunkDir: string, sha: string): Promise<void> {
  const { plainPath, encryptedPath } = getChunkPaths(chunkDir, sha);
  if (existsSync(plainPath)) {
    await fs.rm(plainPath, { force: true });
  }
  if (existsSync(encryptedPath)) {
    await fs.rm(encryptedPath, { force: true });
  }
}

export function isChunkEncryptedOnDisk(chunkDir: string, sha: string): boolean {
  const { encryptedPath } = getChunkPaths(chunkDir, sha);
  return existsSync(encryptedPath);
}
