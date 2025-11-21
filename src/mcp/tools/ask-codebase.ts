import { z } from 'zod';
import { synthesizeAnswer } from '../../synthesis/synthesizer.js';
import { formatSynthesisResult, formatErrorMessage, formatNoResultsMessage } from '../../synthesis/markdown-formatter.js';
import type { ScopeFilters } from '../../types/search.js';

export const askCodebaseInputSchema = z.object({
  question: z.string().min(1, 'Question is required'),
  provider: z.string().optional().default('auto'),
  chat_provider: z.string().optional().default('auto'),
  path: z.string().optional().default('.'),
  max_chunks: z.number().optional().default(10),
  path_glob: z.union([z.string(), z.array(z.string())]).optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  lang: z.union([z.string(), z.array(z.string())]).optional(),
  reranker: z.enum(['on', 'off']).optional().default('on'),
  multi_query: z.boolean().optional().default(false),
  temperature: z.number().min(0).max(2).optional().default(0.7)
});

export const askCodebaseResultSchema = z.object({
  success: z.boolean(),
  answer: z.string().optional(),
  query: z.string(),
  queriesUsed: z.array(z.string()).optional(),
  chunksAnalyzed: z.number(),
  chatProvider: z.string(),
  embeddingProvider: z.string(),
  error: z.string().optional()
});

interface ErrorLogger {
  log?: (error: unknown, context: Record<string, unknown>) => void;
  debugLog?: (message: string, context: Record<string, unknown>) => void;
}

interface CreateHandlerOptions {
  sessionPack?: unknown;
  errorLogger?: ErrorLogger;
}

export function createAskCodebaseHandler(options: CreateHandlerOptions = {}) {
  const { sessionPack, errorLogger } = options;

  return async (params: {
    question: string;
    provider?: string;
    chat_provider?: string;
    path?: string;
    max_chunks?: number;
    path_glob?: string | string[];
    tags?: string | string[];
    lang?: string | string[];
    reranker?: 'on' | 'off';
    multi_query?: boolean;
    temperature?: number;
  }) => {
    const {
      question,
      provider = 'auto',
      chat_provider = 'auto',
      path: workingPath = '.',
      max_chunks = 10,
      path_glob,
      tags,
      lang,
      reranker = 'on',
      multi_query = false,
      temperature = 0.7
    } = params;

    try {
      const scopeFilters: ScopeFilters = {
        path_glob: Array.isArray(path_glob) ? path_glob : path_glob ? [path_glob] : undefined,
        tags: Array.isArray(tags) ? tags : tags ? [tags] : undefined,
        lang: Array.isArray(lang) ? lang : lang ? [lang] : undefined
      };

      if (errorLogger?.debugLog) {
        errorLogger.debugLog('ask_codebase called', {
          question,
          provider,
          chat_provider,
          workingPath,
          max_chunks
        });
      }

      const result = await synthesizeAnswer(question, {
        provider,
        chatProvider: chat_provider,
        workingPath,
        scope: scopeFilters,
        maxChunks: max_chunks,
        useReranking: reranker === 'on',
        useMultiQuery: multi_query,
        temperature
      });

      if (!result.success) {
        if (result.error === 'no_results') {
          return {
            success: false,
            content: formatNoResultsMessage(result.query, result.queriesUsed)
          };
        }
        
        return {
          success: false,
          content: formatErrorMessage(result.error || 'Unknown error', result.query)
        };
      }

      const formattedResult = formatSynthesisResult(result, {
        includeMetadata: true,
        includeStats: true
      });

      return {
        success: true,
        content: formattedResult,
        metadata: {
          chunksAnalyzed: result.chunksAnalyzed,
          queriesUsed: result.queriesUsed,
          chatProvider: result.chatProvider,
          embeddingProvider: result.embeddingProvider
        }
      };

    } catch (error) {
      if (errorLogger?.log) {
        errorLogger.log(error, {
          operation: 'ask_codebase',
          question,
          path: workingPath
        });
      }
      
      return {
        success: false,
        content: formatErrorMessage((error as Error).message, question)
      };
    }
  };
}

interface MCPServer {
  tool: (name: string, schema: Record<string, unknown>, handler: (params: unknown) => Promise<unknown>) => void;
}

export function registerAskCodebaseTool(server: MCPServer, options: CreateHandlerOptions = {}) {
  const handler = createAskCodebaseHandler(options);

  server.tool(
    'ask_codebase',
    {
      question: z.string().min(1).describe('Natural language question about the codebase'),
      provider: z.string().optional().describe('Embedding provider (auto|openai)'),
      chat_provider: z.string().optional().describe('Chat LLM provider (auto|openai)'),
      path: z.string().optional().describe('Project root directory (default: ".")'),
      max_chunks: z.number().optional().describe('Maximum code chunks to analyze (default: 10)'),
      path_glob: z.union([z.string(), z.array(z.string())]).optional().describe('File patterns to filter'),
      tags: z.union([z.string(), z.array(z.string())]).optional().describe('Tags to filter'),
      lang: z.union([z.string(), z.array(z.string())]).optional().describe('Languages to filter'),
      reranker: z.enum(['on', 'off']).optional().describe('Use API reranking (default: on)'),
      multi_query: z.boolean().optional().describe('Break complex questions into sub-queries'),
      temperature: z.number().min(0).max(2).optional().describe('LLM temperature (default: 0.7)')
    },
    async (params: unknown) => {
      const result = await handler(params as Parameters<typeof handler>[0]);
      return {
        content: [
          {
            type: 'text',
            text: result.content
          }
        ]
      };
    }
  );

  return handler;
}
