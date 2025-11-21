import chalk from 'chalk';
import { Command } from 'commander';
import { resolveScopeWithPack } from '../../context/packs.js';
import { searchCode } from '../../core/search.js';
import { print } from '../../utils/logger.js';
import type { ScopeFilters } from '../../types/search.js';

export function registerSearchCommand(program: Command): void {
  program
    .command('search <query> [path]')
    .description('Search indexed code (returns metadata only)')
    .option('-k, --limit <num>', 'maximum results', '10')
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
    .action(async (query, projectPath = '.', options) => {
      try {
        process.env.CODEVAULT_QUIET = 'true';

        const resolvedPath: string = (typeof options.project === 'string' ? options.project : null) ||
                                      (typeof options.directory === 'string' ? options.directory : null) ||
                                      (typeof projectPath === 'string' ? projectPath : null) ||
                                      '.';
        const limitStr: string = typeof options.limit === 'string' ? options.limit : '10';
        const limit = parseInt(limitStr);

        const providerStr: string = typeof options.provider === 'string' ? options.provider : 'auto';
        const { scope: scopeFilters } = resolveScopeWithPack(options, { basePath: resolvedPath });
        const scopeFiltersTyped: ScopeFilters = scopeFilters;
        const results = await searchCode(query, limit, providerStr, resolvedPath, scopeFiltersTyped);

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

        print(chalk.cyan(`\n🔍 Found ${results.results.length} results for "${query}"\n`));

        results.results.forEach((result, index) => {
          const score = (result.meta.score * 100).toFixed(0);
          print(chalk.white(`${index + 1}. ${result.path}`));
          print(chalk.gray(`   ${result.meta.symbol}() · ${result.lang}`));
          print(chalk.gray(`   Score: ${score}%\n`));
        });

        delete process.env.CODEVAULT_QUIET;
      } catch (error) {
        console.error(chalk.red('\n❌ Search error:'), (error as Error).message);
        process.exit(1);
      }
    });
}
