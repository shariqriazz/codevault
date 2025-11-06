/**
 * Zod validation schemas for MCP tool arguments
 *
 * Provides runtime validation and type safety for all MCP tool inputs
 */

import { z } from 'zod';
import { SEARCH_CONSTANTS } from '../config/constants.js';

/**
 * Common path parameter that accepts multiple aliases
 */
const PathSchema = z
  .string()
  .trim()
  .min(1, 'Path cannot be empty')
  .default('.');

/**
 * Provider enum
 */
const ProviderSchema = z.enum(['auto', 'openai']).default('auto');

/**
 * Boolean-like string enum
 */
const BooleanStringSchema = z.enum(['on', 'off']);

/**
 * Reranker mode enum
 */
const RerankerSchema = z.enum(['off', 'api']).default('off');

/**
 * Flexible string or array schema
 */
const StringOrArraySchema = z.union([z.string(), z.array(z.string())]).optional();

/**
 * Search code arguments
 */
export const SearchCodeArgsSchema = z.object({
  query: z
    .string()
    .min(1, 'Query cannot be empty')
    .max(1000, 'Query too long (max 1000 chars)'),
  limit: z
    .number()
    .int('Limit must be integer')
    .min(1, 'Limit must be at least 1')
    .max(SEARCH_CONSTANTS.MAX_SEARCH_LIMIT, `Limit cannot exceed ${SEARCH_CONSTANTS.MAX_SEARCH_LIMIT}`)
    .default(50),
  provider: ProviderSchema,
  path: PathSchema.optional(),
  project: PathSchema.optional(),
  directory: PathSchema.optional(),
  path_glob: StringOrArraySchema,
  tags: StringOrArraySchema,
  lang: StringOrArraySchema,
  reranker: RerankerSchema,
  hybrid: BooleanStringSchema.default('on'),
  bm25: BooleanStringSchema.default('on'),
  symbol_boost: BooleanStringSchema.default('on'),
});

export type SearchCodeArgs = z.infer<typeof SearchCodeArgsSchema>;

/**
 * Search code with chunks arguments
 */
export const SearchCodeWithChunksArgsSchema = z.object({
  query: z
    .string()
    .min(1, 'Query cannot be empty')
    .max(1000, 'Query too long (max 1000 chars)'),
  limit: z
    .number()
    .int('Limit must be integer')
    .min(1, 'Limit must be at least 1')
    .max(50, 'Limit cannot exceed 50 for code chunks')
    .default(10),
  provider: ProviderSchema,
  path: PathSchema.optional(),
  project: PathSchema.optional(),
  directory: PathSchema.optional(),
  path_glob: StringOrArraySchema,
  tags: StringOrArraySchema,
  lang: StringOrArraySchema,
  reranker: RerankerSchema,
  hybrid: BooleanStringSchema.default('on'),
  bm25: BooleanStringSchema.default('on'),
  symbol_boost: BooleanStringSchema.default('on'),
});

export type SearchCodeWithChunksArgs = z.infer<typeof SearchCodeWithChunksArgsSchema>;

/**
 * Get code chunk arguments
 */
export const GetCodeChunkArgsSchema = z.object({
  sha: z.string().min(1, 'SHA cannot be empty').max(64, 'SHA too long'),
  path: PathSchema.optional(),
  project: PathSchema.optional(),
  directory: PathSchema.optional(),
});

export type GetCodeChunkArgs = z.infer<typeof GetCodeChunkArgsSchema>;

/**
 * Index project arguments
 */
export const IndexProjectArgsSchema = z.object({
  path: PathSchema.optional(),
  project: PathSchema.optional(),
  directory: PathSchema.optional(),
  provider: ProviderSchema,
});

export type IndexProjectArgs = z.infer<typeof IndexProjectArgsSchema>;

/**
 * Update project arguments
 */
export const UpdateProjectArgsSchema = IndexProjectArgsSchema;

export type UpdateProjectArgs = z.infer<typeof UpdateProjectArgsSchema>;

/**
 * Get project stats arguments
 */
export const GetProjectStatsArgsSchema = z.object({
  path: PathSchema.optional(),
  project: PathSchema.optional(),
  directory: PathSchema.optional(),
});

export type GetProjectStatsArgs = z.infer<typeof GetProjectStatsArgsSchema>;

/**
 * Use context pack arguments
 */
export const UseContextPackArgsSchema = z.object({
  name: z.string().min(1, 'Context pack name cannot be empty').max(100, 'Name too long'),
  path: PathSchema.optional(),
  project: PathSchema.optional(),
  directory: PathSchema.optional(),
});

export type UseContextPackArgs = z.infer<typeof UseContextPackArgsSchema>;

/**
 * Ask codebase arguments
 */
export const AskCodebaseArgsSchema = z.object({
  question: z
    .string()
    .min(1, 'Question cannot be empty')
    .max(2000, 'Question too long (max 2000 chars)'),
  provider: ProviderSchema,
  chat_provider: ProviderSchema,
  path: PathSchema.optional(),
  project: PathSchema.optional(),
  directory: PathSchema.optional(),
  max_chunks: z
    .number()
    .int('max_chunks must be integer')
    .min(1, 'max_chunks must be at least 1')
    .max(50, 'max_chunks cannot exceed 50')
    .default(10),
  path_glob: StringOrArraySchema,
  tags: StringOrArraySchema,
  lang: StringOrArraySchema,
  reranker: z.enum(['on', 'off']).default('on'),
  multi_query: z.boolean().default(false),
  temperature: z
    .number()
    .min(0, 'Temperature must be >= 0')
    .max(2, 'Temperature must be <= 2')
    .default(0.7),
});

export type AskCodebaseArgs = z.infer<typeof AskCodebaseArgsSchema>;

/**
 * Helper function to extract path from validated args
 */
export function extractPath(args: { path?: string; project?: string; directory?: string }): string {
  return (args.path || args.project || args.directory || '.').trim();
}
