#!/usr/bin/env node

import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as handlers from './mcp/handlers/index.js';
import {
  SearchCodeArgsSchema,
  SearchCodeWithChunksArgsSchema,
  GetCodeChunkArgsSchema,
  IndexProjectArgsSchema,
  UpdateProjectArgsSchema,
  GetProjectStatsArgsSchema,
  UseContextPackArgsSchema,
  AskCodebaseArgsSchema
} from './mcp/schemas.js';
import { CACHE_CONSTANTS } from './config/constants.js';
import { clearSearchCaches } from './core/search.js';
import { clearTokenCache } from './chunking/token-counter.js';
import { logger } from './utils/logger.js';
import { ZodError, ZodIssue } from 'zod';
import { safeGetProperty, safeGetString } from './utils/error-utils.js';
import type { ContextPack } from './types/context-pack.js';

type MCPErrorType = 'validation' | 'runtime' | 'configuration' | 'permission' | 'unknown';

interface ZodErrorLike {
  issues: ZodIssue[];
}

interface MCPErrorPayload {
  code: string;
  type: MCPErrorType;
  message: string;
  details?: Record<string, unknown>;
  suggestion?: string;
}

function formatMcpError(error: unknown): MCPErrorPayload {
  if (error instanceof ZodError) {
    return {
      code: 'VALIDATION_ERROR',
      type: 'validation',
      message: 'Invalid input parameters',
      details: { issues: error.issues },
      suggestion: 'Check parameter types and required fields'
    };
  }

  const normalizedError = error instanceof Error ? error : new Error(String(error));
  const code = safeGetProperty(error, 'code');

  if (code === 'ENCRYPTION_KEY_REQUIRED') {
    return {
      code,
      type: 'configuration',
      message: normalizedError.message,
      suggestion: 'Set CODEVAULT_ENCRYPTION_KEY to decrypt encrypted chunks'
    };
  }

  if (code === 'ENCRYPTION_AUTH_FAILED') {
    return {
      code,
      type: 'permission',
      message: normalizedError.message,
      suggestion: 'Verify encryption key or re-index encrypted chunks'
    };
  }

  if (code === 'PATH_VALIDATION_FAILED') {
    return {
      code,
      type: 'validation',
      message: normalizedError.message,
      suggestion: 'Ensure the requested path is inside the project root'
    };
  }

  return {
    code: (typeof code === 'string' ? code : null) || 'RUNTIME_ERROR',
    type: 'runtime',
    message: normalizedError.message,
    details: normalizedError.stack ? { stack: normalizedError.stack } : undefined
  };
}

function buildMcpErrorResponse(error: unknown) {
  const payload = formatMcpError(error);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2)
      }
    ],
    isError: true
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJson: unknown = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const packageVersion = safeGetString(packageJson, 'version') || '0.0.0';

/**
 * Minimal MCP server exposing CodeVault tools over stdio for AI assistants.
 *
 * Registers the search/index/update/context MCP tools, validates inputs with Zod,
 * and returns structured errors suitable for clients.
 */
export class McpServer {
  private server: Server;
  private sessionContextPack: ContextPack | null = null;
  private cacheCleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.server = new Server(
      {
        name: 'codevault-code-memory',
        version: packageVersion,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: 'search_code',
          description: 'Search code semantically using embeddings',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              limit: { type: 'number', description: 'Max results (default: 50, max: 200)', default: 50 },
              provider: { type: 'string', description: 'Embedding provider (auto|openai)', default: 'auto' },
              path: { type: 'string', description: 'Project root directory', default: '.' },
              path_glob: { type: ['string', 'array'], description: 'File patterns to filter' },
              tags: { type: ['string', 'array'], description: 'Tags to filter' },
              lang: { type: ['string', 'array'], description: 'Languages to filter' },
              reranker: { type: 'string', enum: ['off', 'api'], default: 'off' },
              hybrid: { type: 'string', enum: ['on', 'off'], default: 'on' },
              bm25: { type: 'string', enum: ['on', 'off'], default: 'on' },
              symbol_boost: { type: 'string', enum: ['on', 'off'], default: 'on' },
            },
            required: ['query'],
          },
        },
        {
          name: 'search_code_with_chunks',
          description: 'Search code and return full code chunks',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              limit: { type: 'number', description: 'Max results', default: 10 },
              provider: { type: 'string', default: 'auto' },
              path: { type: 'string', default: '.' },
              path_glob: { type: ['string', 'array'] },
              tags: { type: ['string', 'array'] },
              lang: { type: ['string', 'array'] },
              reranker: { type: 'string', enum: ['off', 'api'], default: 'off' },
              hybrid: { type: 'string', enum: ['on', 'off'], default: 'on' },
              bm25: { type: 'string', enum: ['on', 'off'], default: 'on' },
              symbol_boost: { type: 'string', enum: ['on', 'off'], default: 'on' },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_code_chunk',
          description: 'Get code chunk by SHA',
          inputSchema: {
            type: 'object',
            properties: {
              sha: { type: 'string', description: 'SHA of code chunk' },
              path: { type: 'string', description: 'Project root directory', default: '.' },
            },
            required: ['sha'],
          },
        },
        {
          name: 'index_project',
          description: 'Index a project for semantic search',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Project root directory', default: '.' },
              provider: { type: 'string', description: 'Embedding provider', default: 'auto' },
            },
          },
        },
        {
          name: 'update_project',
          description: 'Update project index',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Project root directory', default: '.' },
              provider: { type: 'string', default: 'auto' },
            },
          },
        },
        {
          name: 'get_project_stats',
          description: 'Get project statistics',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Project root directory', default: '.' },
            },
          },
        },
        {
          name: 'use_context_pack',
          description: 'Activate a context pack for scoped search',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Context pack name or "clear"' },
              path: { type: 'string', description: 'Project root directory', default: '.' },
            },
            required: ['name'],
          },
        },
        {
          name: 'ask_codebase',
          description: 'Ask a question and get LLM-synthesized answer with code citations',
          inputSchema: {
            type: 'object',
            properties: {
              question: { type: 'string', description: 'Natural language question about the codebase' },
              provider: { type: 'string', description: 'Embedding provider (auto|openai)', default: 'auto' },
              chat_provider: { type: 'string', description: 'Chat LLM provider (auto|openai)', default: 'auto' },
              path: { type: 'string', description: 'Project root directory', default: '.' },
              max_chunks: { type: 'number', description: 'Max code chunks to analyze', default: 10 },
              path_glob: { type: ['string', 'array'], description: 'File patterns to filter' },
              tags: { type: ['string', 'array'], description: 'Tags to filter' },
              lang: { type: ['string', 'array'], description: 'Languages to filter' },
              reranker: { type: 'string', enum: ['on', 'off'], default: 'on', description: 'Use API reranking' },
              multi_query: { type: 'boolean', default: false, description: 'Break complex questions into sub-queries' },
              temperature: { type: 'number', minimum: 0, maximum: 2, default: 0.7, description: 'LLM temperature' },
            },
            required: ['question'],
          },
        },
      ];
    
      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const rawArgs = args || {};

      try {
        switch (name) {
          case 'search_code': {
            const validArgs = SearchCodeArgsSchema.parse(rawArgs);
            return await handlers.handleSearchCode(validArgs, this.sessionContextPack);
          }

          case 'search_code_with_chunks': {
            const validArgs = SearchCodeWithChunksArgsSchema.parse(rawArgs);
            return await handlers.handleSearchCodeWithChunks(validArgs, this.sessionContextPack);
          }

          case 'get_code_chunk': {
            const validArgs = GetCodeChunkArgsSchema.parse(rawArgs);
            return await handlers.handleGetCodeChunk(validArgs);
          }

          case 'index_project': {
            const validArgs = IndexProjectArgsSchema.parse(rawArgs);
            return await handlers.handleIndexProject(validArgs);
          }

          case 'update_project': {
            const validArgs = UpdateProjectArgsSchema.parse(rawArgs);
            return await handlers.handleUpdateProject(validArgs);
          }

          case 'get_project_stats': {
            const validArgs = GetProjectStatsArgsSchema.parse(rawArgs);
            return await handlers.handleGetProjectStats(validArgs);
          }

          case 'use_context_pack': {
            const validArgs = UseContextPackArgsSchema.parse(rawArgs);
            return await handlers.handleUseContextPack(validArgs, (pack) => {
              this.sessionContextPack = pack;
            });
          }

          case 'ask_codebase': {
            const validArgs = AskCodebaseArgsSchema.parse(rawArgs);
            return await handlers.handleAskCodebase(validArgs, this.sessionContextPack);
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error && typeof error === 'object' && 'issues' in error) {
          const zodError = error as ZodErrorLike;
          if (Array.isArray(zodError.issues)) {
            const validationError = `Validation Error: ${zodError.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`;
            return {
              content: [{ type: 'text', text: validationError }],
              isError: true,
            };
          }
        }

        return {
          ...buildMcpErrorResponse(error)
        };
      }
    });
  }

  public async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    logger.info('CodeVault MCP Server started', { version: packageVersion });

    this.scheduleCacheCleanup();
    this.setupShutdownHandlers();
  }

  private scheduleCacheCleanup() {
    if (this.cacheCleanupTimer) {
      clearInterval(this.cacheCleanupTimer);
    }
    
    this.cacheCleanupTimer = setInterval(() => {
      try {
        clearSearchCaches();
        clearTokenCache();
        
        logger.debug('Cache cleared periodically');
      } catch (error) {
        // Ignore errors during cleanup
      }
    }, CACHE_CONSTANTS.CACHE_CLEAR_INTERVAL_MS);
  }

  private setupShutdownHandlers() {
    const cleanup = async () => {
      if (this.cacheCleanupTimer) {
        clearInterval(this.cacheCleanupTimer);
        this.cacheCleanupTimer = null;
      }
      
      this.sessionContextPack = null;
      clearSearchCaches();
      clearTokenCache();
    };
    
    process.on('SIGINT', () => {
      void cleanup().then(() => process.exit(0));
    });

    process.on('SIGTERM', () => {
      void cleanup().then(() => process.exit(0));
    });
  }
}

const server = new McpServer();
server.start().catch((error) => {
  logger.error('Fatal error', error);
  process.exit(1);
});
