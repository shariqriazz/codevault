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
import { searchCode, getChunk, getOverview } from './core/search.js';
import { indexProject } from './core/indexer.js';
import { resolveScopeWithPack } from './context/packs.js';
import { synthesizeAnswer } from './synthesis/synthesizer.js';
import { formatSynthesisResult, formatErrorMessage, formatNoResultsMessage } from './synthesis/markdown-formatter.js';
import { MAX_CHUNK_SIZE } from './config/constants.js';
import { resolveProjectRoot } from './utils/path-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

let currentWorkingPath = '.';
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
  const typedArgs = args as any; // MCP SDK doesn't provide strict typing for arguments

  try {
    switch (name) {
      case 'search_code': {
        const cleanPath = resolveProjectRoot(typedArgs);
        const { scope: scopeFilters } = resolveScopeWithPack(
          {
            path_glob: typedArgs.path_glob,
            tags: typedArgs.tags,
            lang: typedArgs.lang,
            reranker: typedArgs.reranker,
            hybrid: typedArgs.hybrid,
            bm25: typedArgs.bm25,
            symbol_boost: typedArgs.symbol_boost,
          },
          { basePath: cleanPath, sessionPack: sessionContextPack }
        );

        const results = await searchCode(
          typedArgs.query,
          typedArgs.limit || 50,
          typedArgs.provider || 'auto',
          cleanPath,
          scopeFilters
        );

        if (!results.success) {
          return {
            content: [
              {
                type: 'text',
                text: results.error === 'database_not_found'
                  ? `📋 Project not indexed!\n\n🔍 Database not found: ${cleanPath}/.codevault/codevault.db\n\n💡 Use index_project tool`
                  : `No results: ${results.message}\n${results.suggestion || ''}`,
              },
            ],
          };
        }

        const resultText = results.results
          .map(
            (result, index) =>
              `${index + 1}. ${result.path}\n   Symbol: ${result.meta.symbol} (${result.lang})\n   Similarity: ${result.meta.score}\n   SHA: ${result.sha}`
          )
          .join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `Found ${results.results.length} results for: "${typedArgs.query}"\nProvider: ${results.provider}\n\n${resultText}`,
            },
          ],
        };
      }

      case 'search_code_with_chunks': {
        const cleanPath = resolveProjectRoot(typedArgs);
        const { scope: scopeFilters } = resolveScopeWithPack(
          {
            path_glob: typedArgs.path_glob,
            tags: typedArgs.tags,
            lang: typedArgs.lang,
            reranker: typedArgs.reranker,
            hybrid: typedArgs.hybrid,
            bm25: typedArgs.bm25,
            symbol_boost: typedArgs.symbol_boost,
          },
          { basePath: cleanPath, sessionPack: sessionContextPack }
        );

        const searchResults = await searchCode(
          typedArgs.query,
          typedArgs.limit || 10,
          typedArgs.provider || 'auto',
          cleanPath,
          scopeFilters
        );

        if (!searchResults.success) {
          return {
            content: [{ type: 'text', text: searchResults.message || 'Search failed' }],
          };
        }

        const resultsWithCode = [];

        for (const result of searchResults.results) {
          const chunkResult = await getChunk(result.sha, cleanPath);
          let code = '';
          let truncated = false;

          if (chunkResult.success && chunkResult.code) {
            code = chunkResult.code;
            if (code.length > MAX_CHUNK_SIZE) {
              code = code.substring(0, MAX_CHUNK_SIZE);
              truncated = true;
            }
          } else {
            code = `[Error retrieving code: ${chunkResult.error}]`;
          }

          resultsWithCode.push({ ...result, code, truncated });
        }

        const resultText = resultsWithCode
          .map(
            (result, index) =>
              `${index + 1}. ${result.path}\n   Symbol: ${result.meta.symbol} (${result.lang})\n   Similarity: ${result.meta.score}\n   SHA: ${result.sha}${
                result.truncated ? '\n   ⚠️  Code truncated' : ''
              }\n\n${'─'.repeat(80)}\n${result.code}\n${'─'.repeat(80)}`
          )
          .join('\n\n');

        return {
          content: [
            { type: 'text', text: `Found ${resultsWithCode.length} results with code\n\n${resultText}` },
          ],
        };
      }

      case 'get_code_chunk': {
        const cleanPath = resolveProjectRoot(typedArgs);
        const result = await getChunk(typedArgs.sha, cleanPath);

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `Error: ${result.error}` }],
            isError: true,
          };
        }

        const codeText = result.code || '';

        if (codeText.length > MAX_CHUNK_SIZE) {
          return {
            content: [
              {
                type: 'text',
                text: `⚠️ CODE CHUNK TOO LARGE - TRUNCATED\n\nSHA: ${typedArgs.sha}\nFull size: ${codeText.length} characters\n\n${codeText.substring(0, MAX_CHUNK_SIZE)}\n\n[TRUNCATED]`,
              },
            ],
          };
        }

        return {
          content: [{ type: 'text', text: codeText }],
        };
      }

      case 'index_project': {
        const cleanPath = resolveProjectRoot(typedArgs);

        if (!fs.existsSync(cleanPath)) {
          throw new Error(`Directory ${cleanPath} does not exist`);
        }

        const result = await indexProject({ repoPath: cleanPath, provider: typedArgs.provider || 'auto' });

        if (!result.success) {
          return {
            content: [
              { type: 'text', text: `Indexing failed: ${result.errors[0]?.error || 'Unknown error'}` },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `✅ Project indexed successfully!\n\n📊 Statistics:\n- Processed chunks: ${result.processedChunks}\n- Total chunks: ${result.totalChunks}\n- Provider: ${result.provider}\n\n🔍 Ready to search!\n- Quick search: search_code with path="${cleanPath}"\n- With code: search_code_with_chunks with path="${cleanPath}"`,
            },
          ],
        };
      }

      case 'update_project': {
        const cleanPath = resolveProjectRoot(typedArgs);
        const result = await indexProject({ repoPath: cleanPath, provider: typedArgs.provider || 'auto' });

        if (!result.success) {
          return {
            content: [
              { type: 'text', text: `Update failed: ${result.errors[0]?.error || 'Unknown error'}` },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `🔄 Project updated!\n📊 Processed: ${result.processedChunks} chunks\n📁 Total: ${result.totalChunks} chunks`,
            },
          ],
        };
      }

      case 'get_project_stats': {
        const cleanPath = resolveProjectRoot(typedArgs);
        const overviewResult = await getOverview(50, cleanPath);

        if (!overviewResult.success) {
          return {
            content: [
              { type: 'text', text: `Error: ${overviewResult.message || 'Failed to get stats'}` },
            ],
            isError: true,
          };
        }

        if (overviewResult.results.length === 0) {
          return {
            content: [{ type: 'text', text: '📋 Project not indexed or empty' }],
          };
        }

        const overview = overviewResult.results
          .map((result) => `- ${result.path} :: ${result.meta.symbol} (${result.lang})`)
          .join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `📊 Project overview (${overviewResult.results.length} main functions):\n\n${overview}`,
            },
          ],
        };
      }

      case 'use_context_pack': {
        const cleanPath = resolveProjectRoot(typedArgs);
        const name = typedArgs.name;

        if (name === 'default' || name === 'none' || name === 'clear') {
          sessionContextPack = null;
          return {
            content: [{ type: 'text', text: 'Cleared active context pack for this session' }],
          };
        }

        try {
          const { loadContextPack } = await import('./context/packs.js');
          const pack = loadContextPack(name, cleanPath);
          sessionContextPack = { ...pack, basePath: cleanPath };

          return {
            content: [
              {
                type: 'text',
                text: `Context pack "${pack.key}" activated for session\n\nScope: ${JSON.stringify(pack.scope, null, 2)}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
            isError: true,
          };
        }
      }

      case 'ask_codebase': {
        const cleanPath = resolveProjectRoot(typedArgs);
        
        // Use resolveScopeWithPack like other search tools for consistency
        const { scope: scopeFilters } = resolveScopeWithPack(
          {
            path_glob: typedArgs.path_glob,
            tags: typedArgs.tags,
            lang: typedArgs.lang,
            reranker: typedArgs.reranker,
          },
          { basePath: cleanPath, sessionPack: sessionContextPack }
        );

        try {
          const result = await synthesizeAnswer(typedArgs.question, {
            provider: typedArgs.provider || 'auto',
            chatProvider: typedArgs.chat_provider || 'auto',
            workingPath: cleanPath,
            scope: scopeFilters,
            maxChunks: typedArgs.max_chunks || 10,
            useReranking: typedArgs.reranker !== 'off',
            useMultiQuery: typedArgs.multi_query || false,
            temperature: typedArgs.temperature || 0.7
          });

          if (!result.success) {
            let errorText: string;
            if (result.error === 'no_results') {
              errorText = formatNoResultsMessage(result.query, result.queriesUsed);
            } else {
              errorText = formatErrorMessage(result.error || 'Unknown error', result.query);
            }
            
            return {
              content: [{ type: 'text', text: errorText }],
            };
          }

          const formattedResult = formatSynthesisResult(result, {
            includeMetadata: true,
            includeStats: true
          });

          return {
            content: [
              {
                type: 'text',
                text: formattedResult
              }
            ],
          };
        } catch (error) {
          const errorText = formatErrorMessage((error as Error).message, typedArgs.question);
          return {
            content: [{ type: 'text', text: errorText }],
            isError: true,
          };
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
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