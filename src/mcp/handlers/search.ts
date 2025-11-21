import { searchCode, getChunk } from '../../core/search.js';
import { resolveProjectRoot } from '../../utils/path-helpers.js';
import { resolveScopeWithPack } from '../../context/packs.js';
import { MAX_CHUNK_SIZE } from '../../config/constants.js';
import { SearchCodeArgs, SearchCodeWithChunksArgs, GetCodeChunkArgs } from '../schemas.js';

export async function handleSearchCode(args: SearchCodeArgs, sessionContextPack: unknown) {
  const cleanPath = resolveProjectRoot(args);
  const { scope: scopeFilters } = resolveScopeWithPack(
    {
      path_glob: args.path_glob,
      tags: args.tags,
      lang: args.lang,
      reranker: args.reranker,
      hybrid: args.hybrid,
      bm25: args.bm25,
      symbol_boost: args.symbol_boost,
    },
    { basePath: cleanPath, sessionPack: sessionContextPack as any }
  );

  const results = await searchCode(
    args.query,
    args.limit || 50,
    args.provider || 'auto',
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
        text: `Found ${results.results.length} results for: "${args.query}"\nProvider: ${results.provider}\n\n${resultText}`,
      },
    ],
  };
}

export async function handleSearchCodeWithChunks(args: SearchCodeWithChunksArgs, sessionContextPack: unknown) {
  const cleanPath = resolveProjectRoot(args);
  const { scope: scopeFilters } = resolveScopeWithPack(
    {
      path_glob: args.path_glob,
      tags: args.tags,
      lang: args.lang,
      reranker: args.reranker,
      hybrid: args.hybrid,
      bm25: args.bm25,
      symbol_boost: args.symbol_boost,
    },
    { basePath: cleanPath, sessionPack: sessionContextPack as any }
  );

  const searchResults = await searchCode(
    args.query,
    args.limit || 10,
    args.provider || 'auto',
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

export async function handleGetCodeChunk(args: GetCodeChunkArgs) {
  const cleanPath = resolveProjectRoot(args);
  const result = await getChunk(args.sha, cleanPath);

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
          text: `⚠️ CODE CHUNK TOO LARGE - TRUNCATED\n\nSHA: ${args.sha}\nFull size: ${codeText.length} characters\n\n${codeText.substring(0, MAX_CHUNK_SIZE)}\n\n[TRUNCATED]`,
        },
      ],
    };
  }

  return {
    content: [{ type: 'text', text: codeText }],
  };
}
