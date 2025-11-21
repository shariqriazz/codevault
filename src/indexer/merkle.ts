import fs from 'fs';
import path from 'path';
import xxhashFactory, { type XXHashAPI } from 'xxhash-wasm';
import fsPromises from 'fs/promises';

const MERKLE_DIR = '.codevault';
const MERKLE_FILENAME = 'merkle.json';

let hasherPromise: Promise<XXHashAPI['h64']> | null = null;

async function getHasher(): Promise<XXHashAPI['h64']> {
  if (!hasherPromise) {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    hasherPromise = xxhashFactory().then(factory => factory.h64);
  }
  return hasherPromise;
}

function ensureObject<T extends object>(value: unknown, fallback: T = {} as T): T {
  return value && typeof value === 'object' ? (value as T) : fallback;
}

export async function computeFastHash(input: string | Buffer): Promise<string> {
  const hasher = await getHasher();
  let normalized: string;
  if (typeof input === 'string') {
    normalized = input;
  } else if (Buffer.isBuffer(input)) {
    normalized = input.toString('utf8');
  } else {
    normalized = String(input ?? '');
  }

  const result = hasher(normalized);
  return typeof result === 'bigint' ? result.toString() : String(result);
}

export interface MerkleEntry {
  shaFile: string;
  chunkShas: string[];
}

export type MerkleTree = Record<string, MerkleEntry>;

export function loadMerkle(basePath = '.'): MerkleTree {
  const absolute = path.resolve(basePath);
  const merklePath = path.join(absolute, MERKLE_DIR, MERKLE_FILENAME);

  if (!fs.existsSync(merklePath)) {
    return {};
  }

  try {
    const data = fs.readFileSync(merklePath, 'utf8');
    return ensureObject(JSON.parse(data));
  } catch {
    return {};
  }
}

export function saveMerkle(basePath = '.', merkle: MerkleTree = {}): void {
  const absolute = path.resolve(basePath);
  const dirPath = path.join(absolute, MERKLE_DIR);
  const merklePath = path.join(dirPath, MERKLE_FILENAME);

  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(merklePath, JSON.stringify(merkle, null, 2));
}

export async function saveMerkleAsync(basePath = '.', merkle: MerkleTree = {}): Promise<void> {
  const absolute = path.resolve(basePath);
  const dirPath = path.join(absolute, MERKLE_DIR);
  const merklePath = path.join(dirPath, MERKLE_FILENAME);

  await fsPromises.mkdir(dirPath, { recursive: true });
  await fsPromises.writeFile(merklePath, JSON.stringify(merkle, null, 2));
}

export function toPosixPath(relativePath: string | null): string | null {
  if (typeof relativePath !== 'string') {
    return null;
  }
  return relativePath.split(path.sep).join('/');
}

export function validatePathSafety(
  basePath: string,
  targetPath: string
): { safe: boolean; normalized: string | null; reason?: string } {
  try {
    const absBase = fs.realpathSync(basePath);
    const absTarget = path.resolve(absBase, targetPath);
    const relative = path.relative(absBase, absTarget);

    if (relative === '') {
      return { safe: true, normalized: toPosixPath(relative) };
    }

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return { safe: false, normalized: null, reason: 'path_outside_base' };
    }

    try {
      const realTarget = fs.realpathSync(absTarget);
      const realRelative = path.relative(absBase, realTarget);
      if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
        return { safe: false, normalized: null, reason: 'symlink_escape' };
      }
      return { safe: true, normalized: toPosixPath(realRelative) };
    } catch {
      // Target may not exist yet; rely on original relative path
      return { safe: true, normalized: toPosixPath(relative) };
    }
  } catch (error) {
    return {
      safe: false,
      normalized: null,
      reason: (error as Error).message
    };
  }
}

export function normalizeToProjectPath(basePath = '.', filePath?: string): string | null {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return null;
  }

  const result = validatePathSafety(basePath, filePath);
  return result.safe ? result.normalized : null;
}

export function removeMerkleEntry(merkle: MerkleTree, relativePath: string): boolean {
  if (!merkle || typeof merkle !== 'object') {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(merkle, relativePath)) {
    delete merkle[relativePath];
    return true;
  }

  return false;
}

export function cloneMerkle(merkle: MerkleTree): MerkleTree {
  return JSON.parse(JSON.stringify(ensureObject(merkle))) as MerkleTree;
}
