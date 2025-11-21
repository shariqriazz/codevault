import { z } from 'zod';

export const DEFAULT_PATH_WEIGHT = 1;
export const DEFAULT_SUCCESS_RATE = 0;

export const CodemapChunkSchema = z.object({
  file: z.string(),
  symbol: z.union([z.string(), z.null()]).optional(),
  sha: z.string(),
  lang: z.string().optional(),
  chunkType: z.string().optional(),
  provider: z.string().optional(),
  dimensions: z.number().optional(),
  hasCodevaultTags: z.boolean().optional(),
  hasIntent: z.boolean().optional(),
  hasDocumentation: z.boolean().optional(),
  variableCount: z.number().optional(),
  synonyms: z.array(z.string()).optional(),
  path_weight: z.number().optional(),
  last_used_at: z.union([z.string(), z.null()]).optional(),
  success_rate: z.number().optional(),
  encrypted: z.boolean().optional(),
  symbol_signature: z.string().optional(),
  symbol_parameters: z.array(z.string()).optional(),
  symbol_return: z.string().optional(),
  symbol_calls: z.array(z.string()).optional(),
  symbol_call_targets: z.array(z.string()).optional(),
  symbol_callers: z.array(z.string()).optional(),
  symbol_neighbors: z.array(z.string()).optional()
}).passthrough();

export const CodemapSchema = z.record(z.string(), CodemapChunkSchema);

export type CodemapChunk = z.infer<typeof CodemapChunkSchema>;
export type Codemap = z.infer<typeof CodemapSchema>;

const KNOWN_FIELDS = new Set([
  'file',
  'symbol',
  'sha',
  'lang',
  'chunkType',
  'provider',
  'dimensions',
  'hasCodevaultTags',
  'hasIntent',
  'hasDocumentation',
  'variableCount',
  'synonyms',
  'path_weight',
  'last_used_at',
  'success_rate',
  'symbol_signature',
  'symbol_parameters',
  'symbol_return',
  'symbol_calls',
  'symbol_call_targets',
  'symbol_callers',
  'symbol_neighbors',
  'encrypted'
]);

function sanitizeStringArray(value: unknown, options: { lowercase?: boolean } = {}): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }
    let trimmed = entry.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (options.lowercase) {
      trimmed = trimmed.toLowerCase();
    }
    unique.add(trimmed);
  }

  return Array.from(unique.values());
}

function sanitizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function sanitizePathWeight(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_PATH_WEIGHT;
  }
  if (value < 0) {
    return 0;
  }
  return value;
}

function sanitizeSuccessRate(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_SUCCESS_RATE;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function sanitizeLastUsed(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  const date = typeof value === 'string' ? new Date(value) : value;
  if (!(date instanceof Date) || Number.isNaN(date.valueOf())) {
    return undefined;
  }

  return date.toISOString();
}

function sanitizeVariableCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  const rounded = Math.round(value);
  return rounded < 0 ? 0 : rounded;
}

function extractExtras(source: unknown): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  if (!source || typeof source !== 'object') {
    return extras;
  }

  for (const [key, val] of Object.entries(source)) {
    if (!KNOWN_FIELDS.has(key)) {
      extras[key] = val;
    }
  }

  return extras;
}

function internalNormalize(raw: unknown): CodemapChunk {
  const fallback = raw && typeof raw === 'object' ? raw : {};
  const parsed = CodemapChunkSchema.safeParse(fallback);
  const data = parsed.success ? parsed.data : (fallback as Record<string, unknown>);
  const extras = extractExtras(data);

  const dataObj = data as Record<string, unknown>;

  const file = typeof dataObj.file === 'string' && dataObj.file.trim().length > 0 ? dataObj.file : 'unknown';
  const sha = typeof dataObj.sha === 'string' && dataObj.sha.trim().length > 0 ? dataObj.sha : 'unknown';
  const lang = typeof dataObj.lang === 'string' && dataObj.lang.trim().length > 0 ? dataObj.lang : 'unknown';
  const chunkType = typeof dataObj.chunkType === 'string' && dataObj.chunkType.trim().length > 0 ? dataObj.chunkType : undefined;
  const provider = typeof dataObj.provider === 'string' && dataObj.provider.trim().length > 0 ? dataObj.provider : undefined;
  const dimensions = typeof dataObj.dimensions === 'number' && Number.isFinite(dataObj.dimensions) ? dataObj.dimensions : undefined;
  const hasCodevaultTags = typeof dataObj.hasCodevaultTags === 'boolean' ? dataObj.hasCodevaultTags : false;
  const hasIntent = typeof dataObj.hasIntent === 'boolean' ? dataObj.hasIntent : false;
  const hasDocumentation = typeof dataObj.hasDocumentation === 'boolean' ? dataObj.hasDocumentation : false;
  const variableCount = sanitizeVariableCount(dataObj.variableCount);
  const synonyms = sanitizeStringArray(dataObj.synonyms);
  const pathWeight = sanitizePathWeight(dataObj.path_weight);
  const lastUsed = sanitizeLastUsed(dataObj.last_used_at);
  const successRate = sanitizeSuccessRate(dataObj.success_rate);
  const encrypted = typeof dataObj.encrypted === 'boolean' ? dataObj.encrypted : false;
  const symbolSignature = sanitizeOptionalString(dataObj.symbol_signature);
  const symbolParameters = Array.isArray(dataObj.symbol_parameters)
    ? sanitizeStringArray(dataObj.symbol_parameters)
    : [];
  const symbolReturn = sanitizeOptionalString(dataObj.symbol_return);
  const symbolCalls = Array.isArray(dataObj.symbol_calls)
    ? sanitizeStringArray(dataObj.symbol_calls)
    : [];
  const symbolCallTargets = Array.isArray(dataObj.symbol_call_targets)
    ? sanitizeStringArray(dataObj.symbol_call_targets)
    : [];
  const symbolCallers = Array.isArray(dataObj.symbol_callers)
    ? sanitizeStringArray(dataObj.symbol_callers)
    : [];
  const symbolNeighbors = Array.isArray(dataObj.symbol_neighbors)
    ? sanitizeStringArray(dataObj.symbol_neighbors)
    : [];

  const symbol = typeof dataObj.symbol === 'string' && dataObj.symbol.trim().length > 0
    ? dataObj.symbol
    : null;

  const normalized = {
    ...extras,
    file,
    symbol,
    sha,
    lang,
    chunkType,
    provider,
    dimensions,
    hasCodevaultTags,
    hasIntent,
    hasDocumentation,
    variableCount,
    synonyms,
    path_weight: pathWeight,
    success_rate: successRate,
    encrypted,
    symbol_calls: symbolCalls,
    symbol_call_targets: symbolCallTargets,
    symbol_callers: symbolCallers,
    symbol_neighbors: symbolNeighbors,
    ...(lastUsed ? { last_used_at: lastUsed } : {}),
    ...(symbolSignature ? { symbol_signature: symbolSignature } : {}),
    ...(symbolParameters.length > 0 ? { symbol_parameters: symbolParameters } : {}),
    ...(symbolReturn ? { symbol_return: symbolReturn } : {})
  } as CodemapChunk;

  return normalized;
}

export function normalizeChunkMetadata(raw: unknown, previous?: CodemapChunk): CodemapChunk {
  const base = previous ? internalNormalize(previous) : undefined;
  const incoming = raw && typeof raw === 'object' ? raw : {};
  const merged = base ? { ...base, ...incoming } : incoming;
  return internalNormalize(merged);
}

export function normalizeCodemapRecord(raw: unknown): Codemap {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const entries = Object.entries(raw)
    .filter(([key]) => typeof key === 'string' && key.length > 0)
    .map(([chunkId, value]) => [chunkId, normalizeChunkMetadata(value)] as [string, CodemapChunk]);

  entries.sort(([a], [b]) => a.localeCompare(b));

  return Object.fromEntries(entries);
}