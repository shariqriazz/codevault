#!/usr/bin/env node

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

let currentWorkingPath = '.';
let sessionContextPack: any = null;

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
          provider: { type: 'string', description: 'Embedding provider (auto|openai|ollama)', default: 'auto' },
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
        const cleanPath = typedArgs.path?.trim() || '.';
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
        const cleanPath = typedArgs.path?.trim() || '.';
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
        const MAX_CHUNK_SIZE = 100000;

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
        const cleanPath = typedArgs.path?.trim() || '.';
        const result = await getChunk(typedArgs.sha, cleanPath);

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `Error: ${result.error}` }],
            isError: true,
          };
        }

        const MAX_CHUNK_SIZE = 100000;
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
        const cleanPath = typedArgs.path?.trim() || '.';

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
              text: `✅ Project indexed successfully!\n\n📊 Statistics:\n- Processed chunks: ${result.processedChunks}\n- Total chunks: ${result.totalChunks}\n- Provider: ${result.provider}\n\n🔍 You can now use search_code with path="${cleanPath}"`,
            },
          ],
        };
      }

      case 'update_project': {
        const cleanPath = typedArgs.path?.trim() || '.';
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
        const cleanPath = typedArgs.path?.trim() || '.';
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
        const cleanPath = typedArgs.path?.trim() || '.';
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
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});