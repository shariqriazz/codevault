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

function sanitizeStringArray(value: any, options: { lowercase?: boolean } = {}): string[] {
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

function sanitizeOptionalString(value: any): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function sanitizePathWeight(value: any): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_PATH_WEIGHT;
  }
  if (value < 0) {
    return 0;
  }
  return value;
}

function sanitizeSuccessRate(value: any): number {
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

function sanitizeLastUsed(value: any): string | undefined {
  if (!value) {
    return undefined;
  }

  const date = typeof value === 'string' ? new Date(value) : value;
  if (!(date instanceof Date) || Number.isNaN(date.valueOf())) {
    return undefined;
  }

  return date.toISOString();
}

function sanitizeVariableCount(value: any): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  const rounded = Math.round(value);
  return rounded < 0 ? 0 : rounded;
}

function extractExtras(source: any): Record<string, any> {
  const extras: Record<string, any> = {};
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

function internalNormalize(raw: any): CodemapChunk {
  const fallback = raw && typeof raw === 'object' ? raw : {};
  const parsed = CodemapChunkSchema.safeParse(fallback);
  const data = parsed.success ? parsed.data : fallback;
  const extras = extractExtras(data);

  const file = typeof data.file === 'string' && data.file.trim().length > 0 ? data.file : 'unknown';
  const sha = typeof data.sha === 'string' && data.sha.trim().length > 0 ? data.sha : 'unknown';
  const lang = typeof data.lang === 'string' && data.lang.trim().length > 0 ? data.lang : 'unknown';
  const chunkType = typeof data.chunkType === 'string' && data.chunkType.trim().length > 0 ? data.chunkType : undefined;
  const provider = typeof data.provider === 'string' && data.provider.trim().length > 0 ? data.provider : undefined;
  const dimensions = typeof data.dimensions === 'number' && Number.isFinite(data.dimensions) ? data.dimensions : undefined;
  const hasCodevaultTags = typeof data.hasCodevaultTags === 'boolean' ? data.hasCodevaultTags : false;
  const hasIntent = typeof data.hasIntent === 'boolean' ? data.hasIntent : false;
  const hasDocumentation = typeof data.hasDocumentation === 'boolean' ? data.hasDocumentation : false;
  const variableCount = sanitizeVariableCount(data.variableCount);
  const synonyms = sanitizeStringArray(data.synonyms);
  const pathWeight = sanitizePathWeight(data.path_weight);
  const lastUsed = sanitizeLastUsed(data.last_used_at);
  const successRate = sanitizeSuccessRate(data.success_rate);
  const encrypted = typeof data.encrypted === 'boolean' ? data.encrypted : false;
  const symbolSignature = sanitizeOptionalString(data.symbol_signature);
  const symbolParameters = Array.isArray(data.symbol_parameters)
    ? sanitizeStringArray(data.symbol_parameters)
    : [];
  const symbolReturn = sanitizeOptionalString(data.symbol_return);
  const symbolCalls = Array.isArray(data.symbol_calls)
    ? sanitizeStringArray(data.symbol_calls)
    : [];
  const symbolCallTargets = Array.isArray(data.symbol_call_targets)
    ? sanitizeStringArray(data.symbol_call_targets)
    : [];
  const symbolCallers = Array.isArray(data.symbol_callers)
    ? sanitizeStringArray(data.symbol_callers)
    : [];
  const symbolNeighbors = Array.isArray(data.symbol_neighbors)
    ? sanitizeStringArray(data.symbol_neighbors)
    : [];

  const symbol = typeof data.symbol === 'string' && data.symbol.trim().length > 0
    ? data.symbol
    : null;

  const normalized: any = {
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
    symbol_neighbors: symbolNeighbors
  };

  if (lastUsed) {
    normalized.last_used_at = lastUsed;
  }

  if (symbolSignature) {
    normalized.symbol_signature = symbolSignature;
  }

  if (symbolParameters.length > 0) {
    normalized.symbol_parameters = symbolParameters;
  }

  if (symbolReturn) {
    normalized.symbol_return = symbolReturn;
  }

  return normalized;
}

export function normalizeChunkMetadata(raw: any, previous?: CodemapChunk): CodemapChunk {
  const base = previous ? internalNormalize(previous) : undefined;
  const incoming = raw && typeof raw === 'object' ? raw : {};
  const merged = base ? { ...base, ...incoming } : incoming;
  return internalNormalize(merged);
}

export function normalizeCodemapRecord(raw: any): Codemap {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const entries = Object.entries(raw)
    .filter(([key]) => typeof key === 'string' && key.length > 0)
    .map(([chunkId, value]) => [chunkId, normalizeChunkMetadata(value)] as [string, CodemapChunk]);

  entries.sort(([a], [b]) => a.localeCompare(b));

  return Object.fromEntries(entries);
}