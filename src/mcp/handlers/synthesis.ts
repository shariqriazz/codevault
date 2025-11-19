import { synthesizeAnswer } from '../../synthesis/synthesizer.js';
import { formatSynthesisResult, formatErrorMessage, formatNoResultsMessage } from '../../synthesis/markdown-formatter.js';
import { resolveProjectRoot } from '../../utils/path-helpers.js';
import { resolveScopeWithPack } from '../../context/packs.js';
import { AskCodebaseArgs } from '../schemas.js';

export async function handleAskCodebase(args: AskCodebaseArgs, sessionContextPack: any) {
  const cleanPath = resolveProjectRoot(args);
  
  // Use resolveScopeWithPack like other search tools for consistency
  const { scope: scopeFilters } = resolveScopeWithPack(
    {
      path_glob: args.path_glob,
      tags: args.tags,
      lang: args.lang,
      reranker: args.reranker,
    },
    { basePath: cleanPath, sessionPack: sessionContextPack }
  );

  try {
    const result = await synthesizeAnswer(args.question, {
      provider: args.provider || 'auto',
      chatProvider: args.chat_provider || 'auto',
      workingPath: cleanPath,
      scope: scopeFilters,
      maxChunks: args.max_chunks || 10,
      useReranking: args.reranker !== 'off',
      useMultiQuery: args.multi_query || false,
      temperature: args.temperature || 0.7
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
    const errorText = formatErrorMessage((error as Error).message, args.question);
    return {
      content: [{ type: 'text', text: errorText }],
      isError: true,
    };
  }
}