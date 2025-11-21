import { searchCode, getChunk } from '../core/search.js';
import { createChatLLMProvider, type ChatLLMProvider, type ChatMessage } from '../providers/chat-llm.js';
import { 
  buildSystemPrompt, 
  buildUserPrompt, 
  buildMultiQueryPrompt, 
  parseMultiQueryResponse,
  type CodeContext 
} from './prompt-builder.js';
import type { ScopeFilters } from '../types/search.js';
import type { SearchResult } from '../core/types.js';
import { resolveProviderContext } from '../config/resolver.js';
import { logger } from '../utils/logger.js';

/**
 * Options controlling search + synthesis behavior.
 */
export interface SynthesisOptions {
  provider?: string;
  chatProvider?: string;
  workingPath?: string;
  scope?: ScopeFilters;
  maxChunks?: number;
  useReranking?: boolean;
  useMultiQuery?: boolean;
  temperature?: number;
  stream?: boolean;
}

export interface SynthesisResult {
  success: boolean;
  answer?: string;
  query: string;
  queriesUsed?: string[];
  chunksAnalyzed: number;
  chatProvider: string;
  embeddingProvider: string;
  error?: string;
  metadata?: {
    searchType?: string;
    totalResults?: number;
    multiQuery?: boolean;
    injectionWarnings?: string[];
  };
}

function validateLLMResponse(response: string): { safe: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!response || !response.trim()) {
    issues.push('empty_response');
  }
  if (/<\/?code_context>/i.test(response) || /<\/?user_query>/i.test(response)) {
    issues.push('prompt_structure_leak');
  }
  if (/system prompt|ignore previous instructions/i.test(response)) {
    issues.push('injection_acknowledgment');
  }

  return { safe: issues.length === 0, issues };
}

/**
 * Perform hybrid search and produce a natural-language answer with retrieved code context.
 *
 * @param query - User-provided question or instruction
 * @param options - Provider, scope, and synthesis controls
 * @returns Structured synthesis result containing the answer, metadata, and any warnings
 */
export async function synthesizeAnswer(
  query: string,
  options: SynthesisOptions = {}
): Promise<SynthesisResult> {
  const {
    provider = 'auto',
    chatProvider = 'auto',
    workingPath = '.',
    scope = {},
    maxChunks = 10,
    useReranking = true,
    useMultiQuery = false,
    temperature = 0.7
  } = options;

  try {
    const providerContext = resolveProviderContext(workingPath);
    const chatLLM = createChatLLMProvider(chatProvider, providerContext.chat);
    if (chatLLM.init) {
      await chatLLM.init();
    }

    const allResults: SearchResult[] = [];
    let queriesUsed: string[] = [query];
    let usedMultiQuery = false;

    // Multi-query support for complex questions
    if (useMultiQuery && isComplexQuestion(query)) {
      try {
        const multiQueryPrompt = buildMultiQueryPrompt(query);
        const multiQueryResponse = await chatLLM.generateCompletion([
          { role: 'user', content: multiQueryPrompt }
        ], { temperature: 0.3, maxTokens: 500 });

        const subQueries = parseMultiQueryResponse(multiQueryResponse);

        if (subQueries.length > 0) {
          queriesUsed = subQueries;
          usedMultiQuery = true;

          if (!process.env.CODEVAULT_QUIET) {
            const { log } = await import('../utils/logger.js');
            log.info(`📝 Breaking down query into ${subQueries.length} sub-queries:`);
            subQueries.forEach((q, i) => log.info(`   ${i + 1}. "${q}"`));
            log.info('');
          }
        }
      } catch (error) {
        // Fall back to single query if multi-query fails
        if (!process.env.CODEVAULT_QUIET) {
          logger.warn('Multi-query breakdown failed, using original query');
        }
      }
    }

    // Execute searches
    const searchScope: ScopeFilters = {
      ...scope,
      reranker: useReranking ? 'api' : 'off',
      hybrid: true,
      bm25: true,
      symbol_boost: true
    };

    for (const searchQuery of queriesUsed) {
      const searchResult = await searchCode(
        searchQuery,
        maxChunks,
        provider,
        workingPath,
        searchScope
      );

      if (searchResult.success && searchResult.results.length > 0) {
        allResults.push(...searchResult.results);
      }
    }

    // Deduplicate results by SHA
    const uniqueResults = new Map<string, SearchResult>();
    for (const result of allResults) {
      if (!uniqueResults.has(result.sha)) {
        uniqueResults.set(result.sha, result);
      } else {
        // Keep the one with higher score
        const existing = uniqueResults.get(result.sha)!;
        if (result.meta.score > existing.meta.score) {
          uniqueResults.set(result.sha, result);
        }
      }
    }

    const deduplicatedResults = Array.from(uniqueResults.values())
      .sort((a, b) => b.meta.score - a.meta.score)
      .slice(0, maxChunks);

    if (deduplicatedResults.length === 0) {
      return {
        success: false,
        error: 'no_results',
        query,
        queriesUsed,
        chunksAnalyzed: 0,
        chatProvider: chatLLM.getName(),
        embeddingProvider: provider,
        metadata: {
          multiQuery: usedMultiQuery,
          totalResults: 0
        }
      };
    }

    // Retrieve code chunks
    const codeChunks = new Map<string, string>();

    if (!process.env.CODEVAULT_QUIET) {
      logger.debug(`🔍 Retrieved ${deduplicatedResults.length} relevant code chunks`);
    }

    for (const result of deduplicatedResults) {
      const chunkResult = await getChunk(result.sha, workingPath);
      if (chunkResult.success && chunkResult.code) {
        codeChunks.set(result.sha, chunkResult.code);
      }
    }

    // Build context for LLM
    const context: CodeContext = {
      query,
      results: deduplicatedResults,
      codeChunks,
      metadata: {
        searchType: deduplicatedResults[0]?.meta?.searchType,
        provider,
        totalChunks: deduplicatedResults.length
      }
    };

    // Generate synthesis
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(context, { maxContextChunks: maxChunks });

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    if (!process.env.CODEVAULT_QUIET) {
      logger.debug(`🤖 Synthesizing answer with ${chatLLM.getName()}...`);
    }

    const answer = await chatLLM.generateCompletion(messages, {
      temperature,
      maxTokens: parseInt(process.env.CODEVAULT_CHAT_MAX_TOKENS || '256000', 10)
    });
    const validation = validateLLMResponse(answer);
    if (!validation.safe) {
      logger.warn('Potential prompt-injection indicators detected in LLM response', {
        issues: validation.issues
      });
    }

    return {
      success: true,
      answer,
      query,
      queriesUsed,
      chunksAnalyzed: deduplicatedResults.length,
      chatProvider: chatLLM.getName(),
      embeddingProvider: provider,
      metadata: {
        searchType: deduplicatedResults[0]?.meta?.searchType,
        totalResults: deduplicatedResults.length,
        multiQuery: usedMultiQuery,
        injectionWarnings: validation.safe ? undefined : validation.issues
      }
    };

  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      query,
      chunksAnalyzed: 0,
      chatProvider: chatProvider,
      embeddingProvider: provider
    };
  }
}

export async function* synthesizeAnswerStreaming(
  query: string,
  options: SynthesisOptions = {}
): AsyncGenerator<string> {
  const {
    provider = 'auto',
    chatProvider = 'auto',
    workingPath = '.',
    scope = {},
    maxChunks = 10,
    useReranking = true,
    temperature = 0.7
  } = options;

  const providerContext = resolveProviderContext(workingPath);
  const chatLLM = createChatLLMProvider(chatProvider, providerContext.chat);
  if (chatLLM.init) {
    await chatLLM.init();
  }

  // Execute search
  const searchScope: ScopeFilters = {
    ...scope,
    reranker: useReranking ? 'api' : 'off',
    hybrid: true,
    bm25: true,
    symbol_boost: true
  };

  const searchResult = await searchCode(query, maxChunks, provider, workingPath, searchScope);

  if (!searchResult.success || searchResult.results.length === 0) {
    yield `**No relevant code found for:** "${query}"\n\n`;
    yield `Please ensure the project is indexed and try rephrasing your question.`;
    return;
  }

  // Retrieve code chunks
  const codeChunks = new Map<string, string>();
  for (const result of searchResult.results.slice(0, maxChunks)) {
    const chunkResult = await getChunk(result.sha, workingPath);
    if (chunkResult.success && chunkResult.code) {
      codeChunks.set(result.sha, chunkResult.code);
    }
  }

  // Build context
  const context: CodeContext = {
    query,
    results: searchResult.results.slice(0, maxChunks),
    codeChunks,
    metadata: {
      searchType: searchResult.searchType,
      provider: searchResult.provider,
      totalChunks: searchResult.results.length
    }
  };

  // Generate streaming response
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(context, { maxContextChunks: maxChunks });

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  for await (const chunk of chatLLM.generateStreamingCompletion(messages, { temperature })) {
    yield chunk;
  }
}

function isComplexQuestion(query: string): boolean {
  const complexIndicators = [
    /\bhow\s+(does|do|can|should)\b/i,
    /\bwhat\s+(is|are|does)\b/i,
    /\bexplain\b/i,
    /\bwalk\s+me\s+through\b/i,
    /\bstep\s+by\s+step\b/i,
    /\band\b.*\band\b/i, // Multiple "and"s suggest complex query
    /\bor\b.*\bor\b/i,   // Multiple "or"s
    /\?.*\?/,             // Multiple questions
  ];

  return complexIndicators.some(pattern => pattern.test(query));
}
