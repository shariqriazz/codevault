import type { SynthesisResult } from './synthesizer.js';

export interface FormattingOptions {
  includeMetadata?: boolean;
  includeStats?: boolean;
  colorize?: boolean;
}

export function formatSynthesisResult(result: SynthesisResult, options: FormattingOptions = {}): string {
  const {
    includeMetadata = true,
    includeStats = true
  } = options;

  let output = '';

  // Add metadata header if requested
  if (includeMetadata && result.metadata) {
    output += '---\n';
    output += '**Search Metadata**\n\n';
    
    if (result.queriesUsed && result.queriesUsed.length > 1) {
      output += `- **Queries Used:** ${result.queriesUsed.length}\n`;
      result.queriesUsed.forEach((q, i) => {
        output += `  ${i + 1}. "${q}"\n`;
      });
    }
    
    if (result.metadata.multiQuery) {
      output += `- **Multi-Query:** Yes\n`;
    }
    
    if (result.metadata.searchType) {
      output += `- **Search Type:** ${result.metadata.searchType}\n`;
    }
    
    output += `- **Chunks Analyzed:** ${result.chunksAnalyzed}\n`;
    output += `- **Embedding Provider:** ${result.embeddingProvider}\n`;
    output += `- **Chat Provider:** ${result.chatProvider}\n`;
    output += '\n---\n\n';
  }

  // Add main answer
  if (result.success && result.answer) {
    output += result.answer;
    
    if (!result.answer.endsWith('\n')) {
      output += '\n';
    }
  } else if (!result.success) {
    output += `**Error:** ${result.error || 'Unknown error occurred'}\n`;
  }

  // Add stats footer if requested
  if (includeStats && result.success) {
    output += '\n\n---\n\n';
    output += '_Generated using CodeVault semantic search + LLM synthesis_\n';
  }

  return output;
}

export function formatStreamingChunk(chunk: string): string {
  // Pass through streaming chunks as-is
  return chunk;
}

export function extractCitations(markdown: string): string[] {
  const citations: string[] = [];
  
  // Match markdown links: [text](path) or `[text](path)`
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  
  while ((match = linkPattern.exec(markdown)) !== null) {
    const path = match[2];
    // Filter out external URLs, only keep file paths
    if (!path.startsWith('http://') && !path.startsWith('https://')) {
      citations.push(path);
    }
  }
  
  return Array.from(new Set(citations));
}

export function addCitationFooter(markdown: string): string {
  const citations = extractCitations(markdown);
  
  if (citations.length === 0) {
    return markdown;
  }

  let output = markdown;
  
  if (!output.endsWith('\n\n')) {
    output += '\n\n';
  }

  output += '## 📚 References\n\n';
  output += 'The following files were referenced in this answer:\n\n';
  
  citations.forEach((citation, index) => {
    output += `${index + 1}. \`${citation}\`\n`;
  });

  return output;
}

export function formatErrorMessage(error: string, query: string): string {
  let output = `# ❌ Unable to Answer\n\n`;
  output += `**Question:** "${query}"\n\n`;
  output += `**Error:** ${error}\n\n`;
  
  output += `## Possible Solutions:\n\n`;
  output += `1. Ensure the project is indexed: \`codevault index\`\n`;
  output += `2. Check if the question is related to the codebase\n`;
  output += `3. Try rephrasing your question with more specific terms\n`;
  output += `4. Verify embedding and chat API configurations\n`;
  
  return output;
}

export function formatNoResultsMessage(query: string, queriesUsed?: string[]): string {
  let output = `# ℹ️ No Relevant Code Found\n\n`;
  output += `**Question:** "${query}"\n\n`;
  
  if (queriesUsed && queriesUsed.length > 1) {
    output += `**Queries Attempted:**\n`;
    queriesUsed.forEach((q, i) => {
      output += `${i + 1}. "${q}"\n`;
    });
    output += '\n';
  }
  
  output += `## Suggestions:\n\n`;
  output += `1. Try using more specific technical terms\n`;
  output += `2. Check if the relevant code is in the indexed project\n`;
  output += `3. Use simpler, more direct questions\n`;
  output += `4. Try searching for function names or class names directly\n`;
  
  return output;
}