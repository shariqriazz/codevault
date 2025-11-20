import { z } from 'zod';
import { RERANKER_OPTIONS } from './search.js';

const stringOrStringArray = z.union([z.string(), z.array(z.string())]);
const booleanLike = z.union([z.boolean(), z.string()]);

export const ContextPackScopeSchema = z.object({
  path_glob: stringOrStringArray.optional(),
  tags: stringOrStringArray.optional(),
  lang: stringOrStringArray.optional(),
  provider: z.string().optional(),
  reranker: z.enum(RERANKER_OPTIONS).optional(),
  hybrid: booleanLike.optional(),
  bm25: booleanLike.optional(),
  symbol_boost: booleanLike.optional()
}).strict();

export const ContextPackSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  scope: ContextPackScopeSchema.optional(),
  path_glob: stringOrStringArray.optional(),
  tags: stringOrStringArray.optional(),
  lang: stringOrStringArray.optional(),
  provider: z.string().optional(),
  reranker: z.enum(RERANKER_OPTIONS).optional(),
  hybrid: booleanLike.optional(),
  bm25: booleanLike.optional(),
  symbol_boost: booleanLike.optional()
}).strict();

export type ContextPackScope = z.infer<typeof ContextPackScopeSchema>;
export type ContextPack = z.infer<typeof ContextPackSchema>;

type ScopeValue = string | string[] | boolean | undefined;

export function extractScopeFromPackDefinition(definition: ContextPack): Record<string, ScopeValue> {
  if (!definition || typeof definition !== 'object') {
    return {};
  }

  const scopeCandidate = definition.scope && typeof definition.scope === 'object'
    ? { ...definition.scope }
    : {};

  const scope: Record<string, ScopeValue> = { ...scopeCandidate };

  const scopeKeys = ['path_glob', 'tags', 'lang', 'provider', 'reranker', 'hybrid', 'bm25', 'symbol_boost'] as const;

  for (const key of scopeKeys) {
    if (Object.prototype.hasOwnProperty.call(definition, key)) {
      const value = definition[key];
      if (value !== undefined) {
        scope[key] = value as ScopeValue;
      }
    }
  }

  return scope;
}