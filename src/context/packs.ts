import fs from 'fs';
import path from 'path';
import { ContextPackSchema, extractScopeFromPackDefinition, type ContextPack } from '../types/context-pack.js';
import { normalizeScopeFilters } from '../search/scope.js';
import type { ScopeFilters } from '../types/search.js';

const CONTEXT_PACK_DIR = '.codevault/contextpacks';
const ACTIVE_STATE_FILENAME = 'active-pack.json';
const PACK_SCOPE_KEYS = ['path_glob', 'tags', 'lang', 'provider', 'reranker', 'hybrid', 'bm25', 'symbol_boost'];

interface PackInfo {
  key: string;
  name: string;
  description: string | null;
  scope: Record<string, any>;
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

function readJsonFile(filePath: string): any {
  const content = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON in context pack ${path.basename(filePath)}: ${(error as Error).message}`);
  }
}

function toContextPackObject(key: string, filePath: string, data: any): PackInfo {
  const parsed = ContextPackSchema.parse(data);
  const scope = extractScopeFromPackDefinition(parsed);
  const packName = typeof parsed.name === 'string' && parsed.name.trim().length > 0
    ? parsed.name.trim()
    : key;

  const description = typeof parsed.description === 'string' && parsed.description.trim().length > 0
    ? parsed.description.trim()
    : undefined;

  const scopeDefinition: Record<string, any> = {};
  for (const scopeKey of PACK_SCOPE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(scope, scopeKey) && typeof scope[scopeKey] !== 'undefined') {
      scopeDefinition[scopeKey] = scope[scopeKey];
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

    const key = typeof rawState.key === 'string' ? rawState.key : null;
    if (!key) {
      return null;
    }

    const pack = loadContextPack(key, basePath);
    return {
      ...pack,
      appliedAt: rawState.appliedAt || null
    };
  } catch (error) {
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
  overrides: any = {},
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

  const combined: any = {};

  if (basePack && basePack.scope) {
    for (const key of PACK_SCOPE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(basePack.scope, key)) {
        combined[key] = basePack.scope[key];
      }
    }
  }

  for (const key of PACK_SCOPE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(overrides, key) && typeof overrides[key] !== 'undefined') {
      combined[key] = overrides[key];
    }
  }

  const scope = normalizeScopeFilters(combined);
  const packInfo = basePack
    ? { key: basePack.key, name: basePack.name, description: basePack.description || null }
    : null;

  return { scope, pack: packInfo };
}

export function clearContextPackCache(): void {
  packCache.clear();
}