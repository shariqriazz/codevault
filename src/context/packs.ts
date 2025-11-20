import fs from 'fs';
import path from 'path';
import { ContextPackSchema, extractScopeFromPackDefinition, type ContextPackScope } from '../types/context-pack.js';
import { normalizeScopeFilters } from '../search/scope.js';
import type { ScopeFilters } from '../types/search.js';

const CONTEXT_PACK_DIR = '.codevault/contextpacks';
const ACTIVE_STATE_FILENAME = 'active-pack.json';
const PACK_SCOPE_KEYS = ['path_glob', 'tags', 'lang', 'provider', 'reranker', 'hybrid', 'bm25', 'symbol_boost'];

export interface PackInfo {
  key: string;
  name: string;
  description: string | null;
  scope: Partial<ContextPackScope>;
  path: string;
  invalid?: boolean;
}

interface SessionPack extends PackInfo {
  basePath: string;
}

const packCache = new Map<string, { pack: PackInfo; mtimeMs: number }>();

function resolveBasePath(basePath = '.'): string {
  return path.resolve(basePath || '.');
}

function getPackDir(basePath = '.'): string {
  return path.join(resolveBasePath(basePath), CONTEXT_PACK_DIR);
}

function getStatePath(basePath = '.'): string {
  return path.join(getPackDir(basePath), ACTIVE_STATE_FILENAME);
}

function ensurePackDir(basePath = '.'): string {
  const dir = getPackDir(basePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function buildCacheKey(filePath: string): string {
  return path.resolve(filePath);
}

function readJsonFile(filePath: string): unknown {
  const content = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON in context pack ${path.basename(filePath)}: ${(error as Error).message}`);
  }
}

function toContextPackObject(key: string, filePath: string, data: unknown): PackInfo {
  const parsed = ContextPackSchema.parse(data);
  const rawScope = extractScopeFromPackDefinition(parsed);
  const packName = typeof parsed.name === 'string' && parsed.name.trim().length > 0
    ? parsed.name.trim()
    : key;

  const description = typeof parsed.description === 'string' && parsed.description.trim().length > 0
    ? parsed.description.trim()
    : undefined;

  const scopeDefinition: Partial<ContextPackScope> = {};
  for (const scopeKey of PACK_SCOPE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(rawScope, scopeKey)) {
      const value = rawScope[scopeKey] as unknown;
      if (typeof value !== 'undefined') {
        (scopeDefinition as Record<string, unknown>)[scopeKey] = value;
      }
    }
  }

  return {
    key,
    name: packName,
    description: description || null,
    scope: scopeDefinition,
    path: filePath
  };
}

export function getContextPackDirectory(basePath = '.'): string {
  return getPackDir(basePath);
}

export function loadContextPack(name: string, basePath = '.'): PackInfo {
  if (!name || typeof name !== 'string') {
    throw new Error('Context pack name must be a non-empty string');
  }

  const packDir = getPackDir(basePath);
  const fileName = `${name}.json`;
  const filePath = path.join(packDir, fileName);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Context pack "${name}" not found in ${packDir}`);
  }

  const stats = fs.statSync(filePath);
  const cacheKey = buildCacheKey(filePath);
  const cached = packCache.get(cacheKey);

  if (cached && cached.mtimeMs === stats.mtimeMs) {
    return cached.pack;
  }

  const rawData = readJsonFile(filePath);
  const pack = toContextPackObject(name, filePath, rawData);

  packCache.set(cacheKey, { pack, mtimeMs: stats.mtimeMs });
  return pack;
}

export function listContextPacks(basePath = '.'): PackInfo[] {
  const packDir = getPackDir(basePath);
  if (!fs.existsSync(packDir)) {
    return [];
  }

  const files = fs.readdirSync(packDir).filter(file => file.endsWith('.json'));
  const packs: PackInfo[] = [];

  for (const file of files) {
    const key = path.basename(file, '.json');
    try {
      const pack = loadContextPack(key, basePath);
      packs.push(pack);
    } catch (error) {
      packs.push({
        key,
        name: key,
        description: `Invalid pack: ${(error as Error).message}`,
        scope: {},
        path: path.join(packDir, file),
        invalid: true
      });
    }
  }

  return packs;
}

export function getActiveContextPack(basePath = '.'): (PackInfo & { appliedAt: string | null }) | null {
  const statePath = getStatePath(basePath);
  if (!fs.existsSync(statePath)) {
    return null;
  }

  try {
    const rawState = readJsonFile(statePath);
    if (!rawState || typeof rawState !== 'object') {
      return null;
    }

    const stateObj = rawState as Record<string, unknown>;
    const key = typeof stateObj.key === 'string' ? stateObj.key : null;
    if (!key) {
      return null;
    }

    const pack = loadContextPack(key, basePath);
    const appliedAt = typeof stateObj.appliedAt === 'string' ? stateObj.appliedAt : null;
    return {
      ...pack,
      appliedAt
    };
  } catch {
    return null;
  }
}

export function setActiveContextPack(name: string, basePath = '.'): PackInfo {
  const pack = loadContextPack(name, basePath);
  const dir = ensurePackDir(basePath);
  const statePath = path.join(dir, ACTIVE_STATE_FILENAME);
  const state = {
    key: pack.key,
    appliedAt: new Date().toISOString()
  };

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  return pack;
}

export function resolveScopeWithPack(
  overrides: Partial<ContextPackScope> = {},
  options: { basePath?: string; sessionPack?: SessionPack | null } = {}
): { scope: ScopeFilters; pack: { key: string; name: string; description: string | null } | null } {
  const basePath = options.basePath || '.';
  const sessionPack = options.sessionPack || null;

  let basePack: PackInfo | null = null;
  const resolvedBasePath = resolveBasePath(basePath);

  if (sessionPack && sessionPack.scope) {
    if (!sessionPack.basePath || resolveBasePath(sessionPack.basePath) === resolvedBasePath) {
      basePack = sessionPack;
    }
  }

  if (!basePack) {
    basePack = getActiveContextPack(basePath);
  }

  const combined: Partial<ContextPackScope> = {};

  if (basePack && basePack.scope) {
    for (const key of PACK_SCOPE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(basePack.scope, key)) {
        const value = basePack.scope[key as keyof ContextPackScope];
        if (typeof value !== 'undefined') {
          (combined as Record<string, unknown>)[key] = value;
        }
      }
    }
  }

  for (const key of PACK_SCOPE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      const value = overrides[key as keyof ContextPackScope];
      if (typeof value !== 'undefined') {
        (combined as Record<string, unknown>)[key] = value;
      }
    }
  }

  const scope = normalizeScopeFilters(combined as Partial<ScopeFilters>);
  const packInfo = basePack
    ? { key: basePack.key, name: basePack.name, description: basePack.description || null }
    : null;

  return { scope, pack: packInfo };
}

export function clearContextPackCache(): void {
  packCache.clear();
}
