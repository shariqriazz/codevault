import chalk from 'chalk';
import { Command } from 'commander';
import { resolveScopeWithPack } from '../../context/packs.js';
import { searchCode } from '../../core/search.js';

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
    .action(async (query: string, projectPath = '.', options: Record<string, unknown>) => {
      try {
        process.env.CODEVAULT_QUIET = 'true';

        const resolvedPath = String(options.project || options.directory || projectPath || '.');
        const limit = parseInt(String(options.limit));

        const { scope: scopeFilters } = resolveScopeWithPack(options, { basePath: resolvedPath });
        const results = await searchCode(query, limit, String(options.provider || 'auto'), resolvedPath, scopeFilters);

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

        console.log(chalk.cyan(`\n🔍 Found ${results.results.length} results for "${query}"\n`));

        results.results.forEach((result, index) => {
          const score = (result.meta.score * 100).toFixed(0);
          console.log(chalk.white(`${index + 1}. ${result.path}`));
          console.log(chalk.gray(`   ${result.meta.symbol}() · ${result.lang}`));
          console.log(chalk.gray(`   Score: ${score}%\n`));
        });

        delete process.env.CODEVAULT_QUIET;
      } catch (error) {
        console.error(chalk.red('\n❌ Search error:'), (error as Error).message);
        process.exit(1);
      }
    });
}
