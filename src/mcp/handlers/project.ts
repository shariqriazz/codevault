import fs from 'fs';
import { indexProject } from '../../core/indexer.js';
import { getOverview } from '../../core/search.js';
import { resolveProjectRoot } from '../../utils/path-helpers.js';
import { IndexProjectArgs, UpdateProjectArgs, GetProjectStatsArgs } from '../schemas.js';

export async function handleIndexProject(args: IndexProjectArgs): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const cleanPath = resolveProjectRoot(args);

  if (!fs.existsSync(cleanPath)) {
    throw new Error(`Directory ${cleanPath} does not exist`);
  }

  const result = await indexProject({ repoPath: cleanPath, provider: args.provider || 'auto' });

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
        text: [
          '✅ Project indexed successfully!',
          '',
          '📊 Statistics:',
          `- Processed chunks: ${result.processedChunks}`,
          `- Total chunks: ${result.totalChunks}`,
          `- Provider: ${result.provider}`,
          '',
          '🔍 Ready to use:',
          `- Quick search: search_code { query, path: "${cleanPath}" }`,
          `- With code: search_code_with_chunks { query, path: "${cleanPath}" }`,
          `- Get chunk by SHA: get_code_chunk { sha, path: "${cleanPath}" }`,
          `- Refresh index: update_project { path: "${cleanPath}" }`,
          `- Stats overview: get_project_stats { path: "${cleanPath}" }`,
          `- Ask Q&A: ask_codebase { question, path: "${cleanPath}" }`,
          `- Context packs: use_context_pack { name, path: "${cleanPath}" }`
        ].join('\n')
      },
    ],
  };
}

export async function handleUpdateProject(args: UpdateProjectArgs): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const cleanPath = resolveProjectRoot(args);
  const result = await indexProject({ repoPath: cleanPath, provider: args.provider || 'auto' });

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

export async function handleGetProjectStats(args: GetProjectStatsArgs): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const cleanPath = resolveProjectRoot(args);
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
