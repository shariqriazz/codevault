import chalk from 'chalk';
import { Command } from 'commander';
import { resolveScopeWithPack } from '../../context/packs.js';
import { searchCode } from '../../core/search.js';
import { print } from '../../utils/logger.js';

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
    .action(async (query, projectPath = '.', options) => {
      try {
        process.env.CODEVAULT_QUIET = 'true';

        const resolvedPath = options.project || options.directory || projectPath || '.';
        const limit = parseInt(options.limit);
        const maxCodeSize = parseInt(options.maxCodeSize || '100000');

        const { scope: scopeFilters } = resolveScopeWithPack(options, { basePath: resolvedPath });
        const results = await searchCode(query, limit, options.provider, resolvedPath, scopeFilters);

        if (!results.success) {
          print(chalk.yellow(`\nNo results found for "${query}"`));
          if (results.suggestion) {
            print(chalk.gray(`Suggestion: ${results.suggestion}`));
          }
          return;
        }

        if (results.results.length === 0) {
          print(chalk.yellow(`\nNo results found for "${query}"`));
          return;
        }

        print(chalk.cyan(`\n🔍 Found ${results.results.length} results with code for "${query}"\n`));

        const { getChunk } = await import('../../core/search.js');

        for (let index = 0; index < results.results.length; index++) {
          const result = results.results[index];
          const score = (result.meta.score * 100).toFixed(0);

          print(chalk.gray('━'.repeat(80)));
          print(chalk.white(`📄 ${result.path} · ${result.meta.symbol}() · Score: ${score}%`));
          print(chalk.gray('━'.repeat(80)));

          const chunkResult = await getChunk(result.sha, resolvedPath);

          if (chunkResult.success && chunkResult.code) {
            let code = chunkResult.code;
            let truncated = false;

            if (code.length > maxCodeSize) {
              code = code.substring(0, maxCodeSize);
              truncated = true;
            }

            print('');
            print(code);

            if (truncated) {
              print(chalk.yellow(`\n⚠️  Code truncated (${chunkResult.code.length} chars, showing ${maxCodeSize})`));
            }
          } else {
            print(chalk.red(`\n❌ Error retrieving code: ${chunkResult.error}`));
          }

          print('');
        }

        delete process.env.CODEVAULT_QUIET;
      } catch (error) {
        console.error(chalk.red('\n❌ Search error:'), (error as Error).message);
        process.exit(1);
      }
    });
}
