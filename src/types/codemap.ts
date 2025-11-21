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

  // Helper to safely get a property value
  const getProp = (key: string): unknown => {
    if (data && typeof data === 'object' && key in data) {
      return (data)[key];
    }
    return undefined;
  };

  const fileProp = getProp('file');
  const file = typeof fileProp === 'string' && fileProp.trim().length > 0 ? fileProp : 'unknown';

  const shaProp = getProp('sha');
  const sha = typeof shaProp === 'string' && shaProp.trim().length > 0 ? shaProp : 'unknown';

  const langProp = getProp('lang');
  const lang = typeof langProp === 'string' && langProp.trim().length > 0 ? langProp : 'unknown';

  const chunkTypeProp = getProp('chunkType');
  const chunkType = typeof chunkTypeProp === 'string' && chunkTypeProp.trim().length > 0 ? chunkTypeProp : undefined;

  const providerProp = getProp('provider');
  const provider = typeof providerProp === 'string' && providerProp.trim().length > 0 ? providerProp : undefined;

  const dimensionsProp = getProp('dimensions');
  const dimensions = typeof dimensionsProp === 'number' && Number.isFinite(dimensionsProp) ? dimensionsProp : undefined;

  const hasCodevaultTagsProp = getProp('hasCodevaultTags');
  const hasCodevaultTags = typeof hasCodevaultTagsProp === 'boolean' ? hasCodevaultTagsProp : false;

  const hasIntentProp = getProp('hasIntent');
  const hasIntent = typeof hasIntentProp === 'boolean' ? hasIntentProp : false;

  const hasDocumentationProp = getProp('hasDocumentation');
  const hasDocumentation = typeof hasDocumentationProp === 'boolean' ? hasDocumentationProp : false;

  const variableCount = sanitizeVariableCount(getProp('variableCount'));
  const synonyms = sanitizeStringArray(getProp('synonyms'));
  const pathWeight = sanitizePathWeight(getProp('path_weight'));
  const lastUsed = sanitizeLastUsed(getProp('last_used_at'));
  const successRate = sanitizeSuccessRate(getProp('success_rate'));

  const encryptedProp = getProp('encrypted');
  const encrypted = typeof encryptedProp === 'boolean' ? encryptedProp : false;

  const symbolSignature = sanitizeOptionalString(getProp('symbol_signature'));

  const symbolParametersProp = getProp('symbol_parameters');
  const symbolParameters = Array.isArray(symbolParametersProp)
    ? sanitizeStringArray(symbolParametersProp)
    : [];

  const symbolReturn = sanitizeOptionalString(getProp('symbol_return'));

  const symbolCallsProp = getProp('symbol_calls');
  const symbolCalls = Array.isArray(symbolCallsProp)
    ? sanitizeStringArray(symbolCallsProp)
    : [];

  const symbolCallTargetsProp = getProp('symbol_call_targets');
  const symbolCallTargets = Array.isArray(symbolCallTargetsProp)
    ? sanitizeStringArray(symbolCallTargetsProp)
    : [];

  const symbolCallersProp = getProp('symbol_callers');
  const symbolCallers = Array.isArray(symbolCallersProp)
    ? sanitizeStringArray(symbolCallersProp)
    : [];

  const symbolNeighborsProp = getProp('symbol_neighbors');
  const symbolNeighbors = Array.isArray(symbolNeighborsProp)
    ? sanitizeStringArray(symbolNeighborsProp)
    : [];

  const symbolProp = getProp('symbol');
  const symbol = typeof symbolProp === 'string' && symbolProp.trim().length > 0
    ? symbolProp
    : null;

  const normalized: Record<string, unknown> = {
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

  return normalized as CodemapChunk;
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