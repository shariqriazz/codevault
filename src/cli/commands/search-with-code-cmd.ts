import chalk from 'chalk';
import { Command } from 'commander';
import { resolveScopeWithPack } from '../../context/packs.js';
import { searchCode } from '../../core/search.js';
import type { SearchCodeResult, SearchResult, GetChunkResult } from '../../core/types.js';

export function registerSearchWithCodeCommand(program: Command): void {
  program
    .command('search-with-code <query> [path]')
    .description('Search indexed code and display full code chunks')
    .option('-k, --limit <num>', 'maximum results', '5')
    .option('-p, --provider <provider>', 'embedding provider', 'auto')
    .option('--project <path>', 'project path')
    .option('--directory <path>', 'project directory')
    .option('--path_glob <pattern...>', 'file patterns')
    .option('--tags <tag...>', 'filter by tags')
    .option('--lang <language...>', 'filter by language')
    .option('--reranker <mode>', 'reranker (off|api)', 'off')
    .option('--hybrid <mode>', 'hybrid search (on|off)', 'on')
    .option('--bm25 <mode>', 'BM25 (on|off)', 'on')
    .option('--symbol_boost <mode>', 'symbol boost (on|off)', 'on')
    .option('--max-code-size <bytes>', 'max code size to display per chunk', '100000')
    .action(async (query: string, projectPath: string = '.', options: {
      limit: string;
      provider: string;
      project?: string;
      directory?: string;
      path_glob?: string[];
      tags?: string[];
      lang?: string[];
      reranker: 'off' | 'api';
      hybrid: string;
      bm25: string;
      symbol_boost: string;
      maxCodeSize?: string;
    }) => {
      try {
        process.env.CODEVAULT_QUIET = 'true';

        const resolvedPath = options.project || options.directory || projectPath || '.';
        const limit = parseInt(options.limit);
        const maxCodeSize = parseInt(options.maxCodeSize || '100000');

        const { scope: scopeFilters } = resolveScopeWithPack(options, { basePath: resolvedPath });
        const results: SearchCodeResult = await searchCode(query, limit, options.provider, resolvedPath, scopeFilters);

        if (!results.success) {
          console.log(chalk.yellow(`\nNo results found for "${query}"`));
          if (results.suggestion) {
            console.log(chalk.gray(`Suggestion: ${results.suggestion}`));
          }
          return;
        }

        if (results.results.length === 0) {
          console.log(chalk.yellow(`\nNo results found for "${query}"`));
          return;
        }

        console.log(chalk.cyan(`\n🔍 Found ${results.results.length} results with code for "${query}"\n`));

        const { getChunk }: { getChunk: (sha: string, basePath: string) => Promise<GetChunkResult> } = await import('../../core/search.js');

        for (let index = 0; index < results.results.length; index++) {
          const result: SearchResult = results.results[index];
          const score = (result.meta.score * 100).toFixed(0);

          console.log(chalk.gray('━'.repeat(80)));
          console.log(chalk.white(`📄 ${result.path} · ${result.meta.symbol}() · Score: ${score}%`));
          console.log(chalk.gray('━'.repeat(80)));

          const chunkResult: GetChunkResult = await getChunk(result.sha, resolvedPath);

          if (chunkResult.success && chunkResult.code) {
            let code: string = chunkResult.code;
            let truncated = false;

            if (code.length > maxCodeSize) {
              code = code.substring(0, maxCodeSize);
              truncated = true;
            }

            console.log();
            console.log(code);

            if (truncated) {
              console.log(chalk.yellow(`\n⚠️  Code truncated (${chunkResult.code.length} chars, showing ${maxCodeSize})`));
            }
          } else {
            console.log(chalk.red(`\n❌ Error retrieving code: ${chunkResult.error || 'Unknown error'}`));
          }

          console.log('');
        }

        delete process.env.CODEVAULT_QUIET;
      } catch (error) {
        console.error(chalk.red('\n❌ Search error:'), (error as Error).message);
        process.exit(1);
      }
    });
}
