import fs from 'fs';
import { indexProject } from '../../core/indexer.js';
import { getOverview } from '../../core/search.js';
import { resolveProjectRoot } from '../../utils/path-helpers.js';
import { IndexProjectArgs, UpdateProjectArgs, GetProjectStatsArgs } from '../schemas.js';

export async function handleIndexProject(args: IndexProjectArgs) {
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
        text: `✅ Project indexed successfully!\n\n📊 Statistics:\n- Processed chunks: ${result.processedChunks}\n- Total chunks: ${result.totalChunks}\n- Provider: ${result.provider}\n\n🔍 Ready to search!\n- Quick search: search_code with path="${cleanPath}"\n- With code: search_code_with_chunks with path="${cleanPath}"`,
      },
    ],
  };
}

export async function handleUpdateProject(args: UpdateProjectArgs) {
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

export async function handleGetProjectStats(args: GetProjectStatsArgs) {
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