import type { SearchResult } from '../core/types.js';

export interface CodeContext {
  results: SearchResult[];
  codeChunks: Map<string, string>;
  query: string;
  metadata?: {
    searchType?: string;
    provider?: string;
    totalChunks?: number;
  };
}

export interface PromptOptions {
  maxContextChunks?: number;
  includeFileStructure?: boolean;
  citationStyle?: 'inline' | 'footnote';
}

export function buildSystemPrompt(): string {
  return `You are an expert code analyst helping developers understand their codebase. Your role is to:

1. Analyze the provided code chunks and their metadata
2. Answer the user's question clearly and concisely
3. Use proper markdown formatting
4. Include citations to specific files and code snippets
5. Provide practical, actionable insights
6. Highlight important patterns, dependencies, and relationships

Format your response in markdown with:
- Clear headings and sections
- Code blocks with language tags
- File path citations like: \`[filename.ext](filename.ext:line)\`
- Bullet points for clarity
- Bold/italic for emphasis

Keep responses focused and relevant to the question asked.`;
}

export function buildUserPrompt(context: CodeContext, options: PromptOptions = {}): string {
  const { query, results, codeChunks, metadata } = context;
  const maxChunks = options.maxContextChunks || 10;
  const citationStyle = options.citationStyle || 'inline';
  
  let prompt = `# Question\n\n${query}\n\n`;
  
  // Add search metadata
  if (metadata) {
    prompt += `# Search Context\n\n`;
    if (metadata.searchType) {
      prompt += `- Search Type: ${metadata.searchType}\n`;
    }
    if (metadata.provider) {
      prompt += `- Embedding Provider: ${metadata.provider}\n`;
    }
    if (metadata.totalChunks) {
      prompt += `- Total Indexed Chunks: ${metadata.totalChunks}\n`;
    }
    prompt += `- Relevant Results: ${results.length}\n\n`;
  }
  
  // Add relevant code chunks
  prompt += `# Relevant Code Chunks\n\n`;
  prompt += `I found ${Math.min(results.length, maxChunks)} relevant code chunks. Here they are in order of relevance:\n\n`;
  
  const chunksToInclude = results.slice(0, maxChunks);
  
  chunksToInclude.forEach((result, index) => {
    const chunkCode = codeChunks.get(result.sha);
    const relevanceScore = (result.meta.score * 100).toFixed(1);
    
    prompt += `## Chunk ${index + 1}: ${result.meta.symbol} (${relevanceScore}% relevant)\n\n`;
    prompt += `**File:** \`${result.path}\`\n`;
    prompt += `**Language:** ${result.lang}\n`;
    prompt += `**Symbol:** ${result.meta.symbol}\n`;
    
    if (result.meta.description) {
      prompt += `**Description:** ${result.meta.description}\n`;
    }
    
    if (result.meta.intent) {
      prompt += `**Intent:** ${result.meta.intent}\n`;
    }
    
    // Add search metadata if available
    if (result.meta.searchType) {
      prompt += `**Search Type:** ${result.meta.searchType}\n`;
    }
    
    if (result.meta.symbolBoost && result.meta.symbolBoost > 0) {
      prompt += `**Symbol Match:** Yes (boosted by ${(result.meta.symbolBoost * 100).toFixed(0)}%)\n`;
    }
    
    if (result.meta.rerankerScore !== undefined) {
      prompt += `**Reranker Score:** ${(result.meta.rerankerScore * 100).toFixed(1)}%\n`;
    }
    
    prompt += `\n**Code:**\n\n`;
    
    if (chunkCode) {
      const truncatedCode = chunkCode.length > 2000 
        ? chunkCode.substring(0, 2000) + '\n... [truncated]'
        : chunkCode;
      
      prompt += `\`\`\`${result.lang}\n${truncatedCode}\n\`\`\`\n\n`;
    } else {
      prompt += `_[Code not available]_\n\n`;
    }
    
    prompt += `---\n\n`;
  });
  
  // Add instructions for response format
  prompt += `# Instructions\n\n`;
  prompt += `Based on the code chunks above, please answer the question: "${query}"\n\n`;
  prompt += `Your response should:\n`;
  prompt += `1. Directly answer the question in clear, natural language\n`;
  prompt += `2. Reference specific code chunks using inline citations like: \`[filename.ext](filename.ext)\`\n`;
  prompt += `3. Include relevant code snippets in your explanation\n`;
  prompt += `4. Highlight key patterns, dependencies, or architectural decisions\n`;
  prompt += `5. Use proper markdown formatting with headers, lists, and code blocks\n`;
  prompt += `6. Be concise but thorough - focus on what's most relevant\n\n`;
  
  if (citationStyle === 'footnote') {
    prompt += `7. Add a "References" section at the end with all cited files\n\n`;
  }
  
  return prompt;
}

export function buildMultiQueryPrompt(query: string): string {
  return `You are a query analyzer for code search. Given a complex question about a codebase, break it down into 2-4 specific search queries that would help find relevant code.

Question: "${query}"

Return ONLY a JSON array of search query strings, nothing else. Each query should be:
- Specific and focused on one aspect
- Use technical terms that would appear in code
- Be suitable for semantic search

Example format:
["authentication middleware", "user login function", "session management"]

Your response (JSON array only):`;
}

export function parseMultiQueryResponse(response: string): string[] {
  try {
    // Extract JSON array from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }
    
    const queries = JSON.parse(jsonMatch[0]);
    
    if (!Array.isArray(queries)) {
      return [];
    }
    
    return queries
      .filter(q => typeof q === 'string' && q.trim().length > 0)
      .map(q => q.trim())
      .slice(0, 4); // Max 4 queries
  } catch (error) {
    console.error('Failed to parse multi-query response:', error);
    return [];
  }
}