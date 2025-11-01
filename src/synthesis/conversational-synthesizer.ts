import { searchCode, getChunk } from '../core/search.js';
import { createChatLLMProvider, type ChatMessage } from '../providers/chat-llm.js';
import type { ScopeFilters } from '../types/search.js';
import type { SearchResult } from '../core/types.js';

export interface ConversationTurn {
  question: string;
  answer: string;
  chunks: SearchResult[];
  timestamp: Date;
}

export interface ConversationContext {
  turns: ConversationTurn[];
  allChunks: Map<string, { result: SearchResult; code: string }>;
}

export interface ConversationalSynthesisOptions {
  provider?: string;
  chatProvider?: string;
  workingPath?: string;
  scope?: ScopeFilters;
  maxChunks?: number;
  useReranking?: boolean;
  temperature?: number;
  maxHistoryTurns?: number;
}

export interface ConversationalSynthesisResult {
  success: boolean;
  answer?: string;
  query: string;
  chunksAnalyzed: number;
  chatProvider: string;
  embeddingProvider: string;
  error?: string;
  newChunks?: SearchResult[];
}

/**
 * Synthesize an answer in the context of an ongoing conversation
 */
export async function synthesizeConversationalAnswer(
  query: string,
  conversationContext: ConversationContext,
  options: ConversationalSynthesisOptions = {}
): Promise<ConversationalSynthesisResult> {
  const {
    provider = 'auto',
    chatProvider = 'auto',
    workingPath = '.',
    scope = {},
    maxChunks = 10,
    useReranking = true,
    temperature = 0.7,
    maxHistoryTurns = 5
  } = options;

  try {
    const chatLLM = createChatLLMProvider(chatProvider);
    if (chatLLM.init) {
      await chatLLM.init();
    }

    // Search for relevant code chunks for current query
    const searchScope: ScopeFilters = {
      ...scope,
      reranker: useReranking ? 'api' : 'off',
      hybrid: true,
      bm25: true,
      symbol_boost: true
    };

    const searchResult = await searchCode(
      query,
      maxChunks,
      provider,
      workingPath,
      searchScope
    );

    if (!searchResult.success || searchResult.results.length === 0) {
      return {
        success: false,
        error: 'no_results',
        query,
        chunksAnalyzed: 0,
        chatProvider: chatLLM.getName(),
        embeddingProvider: provider
      };
    }

    // Retrieve code for new chunks
    const newChunks = searchResult.results.slice(0, maxChunks);
    for (const result of newChunks) {
      if (!conversationContext.allChunks.has(result.sha)) {
        const chunkResult = await getChunk(result.sha, workingPath);
        if (chunkResult.success && chunkResult.code) {
          conversationContext.allChunks.set(result.sha, {
            result,
            code: chunkResult.code
          });
        }
      }
    }

    // Build conversational prompt
    const messages = buildConversationalMessages(
      query,
      conversationContext,
      newChunks,
      maxHistoryTurns
    );

    // Generate answer
    const answer = await chatLLM.generateCompletion(messages, { 
      temperature,
      maxTokens: parseInt(process.env.CODEVAULT_CHAT_MAX_TOKENS || '4096', 10)
    });

    return {
      success: true,
      answer,
      query,
      chunksAnalyzed: newChunks.length,
      chatProvider: chatLLM.getName(),
      embeddingProvider: provider,
      newChunks
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

/**
 * Streaming version for real-time responses
 */
export async function* synthesizeConversationalAnswerStreaming(
  query: string,
  conversationContext: ConversationContext,
  options: ConversationalSynthesisOptions = {}
): AsyncGenerator<string> {
  const {
    provider = 'auto',
    chatProvider = 'auto',
    workingPath = '.',
    scope = {},
    maxChunks = 10,
    useReranking = true,
    temperature = 0.7,
    maxHistoryTurns = 5
  } = options;

  const chatLLM = createChatLLMProvider(chatProvider);
  if (chatLLM.init) {
    await chatLLM.init();
  }

  // Search for relevant code chunks
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
    yield `Please try rephrasing your question or ensure the project is indexed.`;
    return;
  }

  // Retrieve code for new chunks
  const newChunks = searchResult.results.slice(0, maxChunks);
  for (const result of newChunks) {
    if (!conversationContext.allChunks.has(result.sha)) {
      const chunkResult = await getChunk(result.sha, workingPath);
      if (chunkResult.success && chunkResult.code) {
        conversationContext.allChunks.set(result.sha, {
          result,
          code: chunkResult.code
        });
      }
    }
  }

  // Build messages with conversation history
  const messages = buildConversationalMessages(
    query,
    conversationContext,
    newChunks,
    maxHistoryTurns
  );

  // Stream the response
  for await (const chunk of chatLLM.generateStreamingCompletion(messages, { temperature })) {
    yield chunk;
  }
}

/**
 * Build messages array with conversation history
 */
function buildConversationalMessages(
  currentQuery: string,
  context: ConversationContext,
  newChunks: SearchResult[],
  maxHistoryTurns: number
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  // System prompt for conversational mode
  messages.push({
    role: 'system',
    content: buildConversationalSystemPrompt()
  });

  // Add conversation history (last N turns)
  const recentTurns = context.turns.slice(-maxHistoryTurns);
  for (const turn of recentTurns) {
    messages.push({
      role: 'user',
      content: turn.question
    });
    messages.push({
      role: 'assistant',
      content: turn.answer
    });
  }

  // Add current query with code context
  const userPrompt = buildConversationalUserPrompt(currentQuery, context, newChunks);
  messages.push({
    role: 'user',
    content: userPrompt
  });

  return messages;
}

/**
 * Build system prompt for conversational mode
 */
function buildConversationalSystemPrompt(): string {
  return `You are an expert code analyst helping a developer understand their codebase through an interactive conversation.

Your role is to:
1. Answer questions clearly and concisely based on the provided code context
2. Maintain continuity with the conversation history
3. Reference previous discussions when relevant
4. Use proper markdown formatting with code citations
5. Cite specific files using the format: \`[filename.ext](filename.ext:line)\`
6. Be conversational but professional
7. If the question builds on previous context, acknowledge that connection

Format guidelines:
- Use clear headings and sections
- Include code blocks with language tags
- Use bullet points for clarity
- Bold/italic for emphasis
- Keep responses focused and relevant to the current question

Remember: You're having an ongoing conversation, not answering isolated questions.`;
}

/**
 * Build user prompt with conversation-aware context
 */
function buildConversationalUserPrompt(
  currentQuery: string,
  context: ConversationContext,
  newChunks: SearchResult[]
): string {
  let prompt = `# Current Question\n\n${currentQuery}\n\n`;

  // Show relevant code chunks for current question
  if (newChunks.length > 0) {
    prompt += `# Relevant Code (for current question)\n\n`;
    prompt += `I found ${newChunks.length} code chunks relevant to your current question:\n\n`;

    newChunks.forEach((result, index) => {
      const chunkData = context.allChunks.get(result.sha);
      const relevanceScore = (result.meta.score * 100).toFixed(1);

      prompt += `## Chunk ${index + 1}: ${result.meta.symbol} (${relevanceScore}% relevant)\n\n`;
      prompt += `**File:** \`${result.path}\`\n`;
      prompt += `**Language:** ${result.lang}\n`;
      prompt += `**Symbol:** ${result.meta.symbol}\n`;

      if (result.meta.description) {
        prompt += `**Description:** ${result.meta.description}\n`;
      }

      if (chunkData && chunkData.code) {
        const truncatedCode = chunkData.code.length > 2000
          ? chunkData.code.substring(0, 2000) + '\n... [truncated]'
          : chunkData.code;

        prompt += `\n**Code:**\n\n\`\`\`${result.lang}\n${truncatedCode}\n\`\`\`\n\n`;
      }

      prompt += `---\n\n`;
    });
  }

  // Add reference to previously discussed code if relevant
  if (context.turns.length > 0) {
    const previousChunks = new Set<string>();
    context.turns.forEach(turn => {
      turn.chunks.forEach(chunk => previousChunks.add(chunk.sha));
    });

    const previouslySeenChunks = Array.from(previousChunks)
      .filter(sha => !newChunks.some(c => c.sha === sha))
      .slice(0, 5);

    if (previouslySeenChunks.length > 0) {
      prompt += `# Previously Discussed Code (available for reference)\n\n`;
      previouslySeenChunks.forEach(sha => {
        const chunkData = context.allChunks.get(sha);
        if (chunkData) {
          prompt += `- \`${chunkData.result.path}\` - ${chunkData.result.meta.symbol}\n`;
        }
      });
      prompt += `\n`;
    }
  }

  // Instructions for response
  prompt += `# Instructions\n\n`;
  prompt += `Based on our conversation and the code provided, please answer: "${currentQuery}"\n\n`;
  prompt += `Your response should:\n`;
  prompt += `1. Build on our previous conversation if relevant\n`;
  prompt += `2. Directly answer the current question\n`;
  prompt += `3. Use inline citations like: \`[filename.ext](filename.ext)\`\n`;
  prompt += `4. Include relevant code snippets\n`;
  prompt += `5. Use proper markdown formatting\n`;
  prompt += `6. Be concise but thorough\n`;

  return prompt;
}

/**
 * Create a new conversation context
 */
export function createConversationContext(): ConversationContext {
  return {
    turns: [],
    allChunks: new Map()
  };
}

/**
 * Add a turn to the conversation history
 */
export function addConversationTurn(
  context: ConversationContext,
  turn: ConversationTurn
): void {
  context.turns.push(turn);
}

/**
 * Clear conversation history
 */
export function clearConversationHistory(context: ConversationContext): void {
  context.turns = [];
  context.allChunks.clear();
}

/**
 * Get conversation summary for display
 */
export function getConversationSummary(context: ConversationContext): string {
  const turnCount = context.turns.length;
  const uniqueChunks = context.allChunks.size;
  const uniqueFiles = new Set(
    Array.from(context.allChunks.values()).map(chunk => chunk.result.path)
  ).size;

  return `Conversation: ${turnCount} turn${turnCount !== 1 ? 's' : ''} | ${uniqueChunks} code chunks | ${uniqueFiles} file${uniqueFiles !== 1 ? 's' : ''}`;
}
