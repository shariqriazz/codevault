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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

// Note: working path is resolved per request via resolveProjectRoot()
let sessionContextPack: any = null;

// FIX: Add periodic cache clearing to prevent memory leaks in long-running MCP server
const CACHE_CLEAR_INTERVAL_MS = Number.parseInt(process.env.CODEVAULT_CACHE_CLEAR_INTERVAL || '3600000', 10); // Default: 1 hour
let cacheCleanupTimer: NodeJS.Timeout | null = null;

async function scheduleCacheCleanup() {
  if (cacheCleanupTimer) {
    clearInterval(cacheCleanupTimer);
  }
  
  cacheCleanupTimer = setInterval(async () => {
    try {
      // Clear search caches
      const searchModule = await import('./core/search.js').catch(() => ({ clearSearchCaches: undefined }));
      if (typeof searchModule.clearSearchCaches === 'function') {
        searchModule.clearSearchCaches();
      }
      
      // Clear token counter cache
      const tokenModule = await import('./chunking/token-counter.js').catch(() => ({ clearTokenCache: undefined }));
      if (typeof tokenModule.clearTokenCache === 'function') {
        tokenModule.clearTokenCache();
      }
      
      console.error(JSON.stringify({
        event: 'cache_cleared',
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      // Ignore errors during cleanup
    }
  }, CACHE_CLEAR_INTERVAL_MS);
}

const server = new Server(
  {
    name: 'codevault-code-memory',
    version: packageJson.version,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List all available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
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

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const rawArgs = args || {};

  try {
    switch (name) {
      case 'search_code': {
        const validArgs = SearchCodeArgsSchema.parse(rawArgs);
        return await handlers.handleSearchCode(validArgs, sessionContextPack);
      }

      case 'search_code_with_chunks': {
        const validArgs = SearchCodeWithChunksArgsSchema.parse(rawArgs);
        return await handlers.handleSearchCodeWithChunks(validArgs, sessionContextPack);
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
          sessionContextPack = pack;
        });
      }

      case 'ask_codebase': {
        const validArgs = AskCodebaseArgsSchema.parse(rawArgs);
        return await handlers.handleAskCodebase(validArgs, sessionContextPack);
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    // Handle Zod validation errors specifically
    if (error && typeof error === 'object' && 'issues' in error && Array.isArray((error as any).issues)) {
      const validationError = `Validation Error: ${(error as any).issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join(', ')}`;
      return {
        content: [{ type: 'text', text: validationError }],
        isError: true,
      };
    }

    return {
      content: [{ type: 'text', text: `ERROR: ${(error as Error).message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error(JSON.stringify({
    start: 'CodeVault MCP Server started',
    version: packageJson.version,
  }));
  
  // FIX: Start periodic cache cleanup
  scheduleCacheCleanup();
  
  // FIX: Add cleanup handlers for graceful shutdown
  const cleanup = async () => {
    // Stop cache cleanup timer
    if (cacheCleanupTimer) {
      clearInterval(cacheCleanupTimer);
      cacheCleanupTimer = null;
    }
    
    // Clear session context pack
    sessionContextPack = null;
    
    // Clear search caches to free memory
    try {
      const searchModule = await import('./core/search.js').catch(() => ({ clearSearchCaches: undefined }));
      if (typeof searchModule.clearSearchCaches === 'function') {
        searchModule.clearSearchCaches();
      }
    } catch (error) {
      // Ignore if module doesn't export the function yet
    }
    
    // Clear token counter cache
    try {
      const tokenModule = await import('./chunking/token-counter.js').catch(() => ({ clearTokenCache: undefined }));
      if (typeof tokenModule.clearTokenCache === 'function') {
        tokenModule.clearTokenCache();
      }
    } catch (error) {
      // Ignore if module doesn't export the function yet
    }
  };
  
  process.on('SIGINT', async () => {
    await cleanup();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await cleanup();
    process.exit(0);
  });
  
  process.on('exit', () => {
    // Note: Cannot use async in exit handler, but cleanup is best-effort
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});