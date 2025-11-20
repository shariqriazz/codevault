import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {
  synthesizeAnswer,
  synthesizeAnswerStreaming,
  type SynthesisResult
} from '../../synthesis/synthesizer.js';
import {
  formatSynthesisResult,
  formatErrorMessage,
  formatNoResultsMessage,
  addCitationFooter
} from '../../synthesis/markdown-formatter.js';
import { resolveScopeWithPack } from '../../context/packs.js';
import type { ScopeFilters } from '../../types/search.js';

/**
 * CLI options for the ask command
 */
interface AskCommandOptions {
  provider: string;
  chatProvider: string;
  path: string;
  project?: string;
  directory?: string;
  maxChunks: string;
  path_glob?: string[];
  tags?: string[];
  lang?: string[];
  reranker: string;
  multiQuery?: boolean;
  temperature: string;
  stream?: boolean;
  citations?: boolean;
  metadata?: boolean;
}

export function registerAskCommand(program: Command): void {
  program
    .command('ask <question>')
    .description('Ask a question and get LLM-synthesized answer with code citations')
    .option('-p, --provider <provider>', 'embedding provider (auto|openai)', 'auto')
    .option('-c, --chat-provider <provider>', 'chat LLM provider (auto|openai)', 'auto')
    .option('--path <path>', 'project root directory', '.')
    .option('--project <path>', 'alias for project path')
    .option('--directory <path>', 'alias for project directory')
    .option('-k, --max-chunks <num>', 'maximum code chunks to analyze', '10')
    .option('--path_glob <pattern...>', 'file patterns to filter')
    .option('--tags <tag...>', 'filter by tags')
    .option('--lang <language...>', 'filter by language')
    .option('--reranker <mode>', 'use API reranking (on|off)', 'on')
    .option('--multi-query', 'break complex questions into sub-queries')
    .option('--temperature <num>', 'LLM temperature (0-2)', '0.7')
    .option('--stream', 'stream the response in real-time')
    .option('--citations', 'add citation footer')
    .option('--no-metadata', 'hide search metadata')
    .action(async (question: string, options: AskCommandOptions) => {
      try {
        // Suppress verbose logs
        process.env.CODEVAULT_QUIET = 'true';

        const resolvedPath: string = options.project || options.directory || options.path || '.';
        const maxChunks: number = parseInt(options.maxChunks, 10);
        const temperature: number = parseFloat(options.temperature);
        const useReranking: boolean = options.reranker !== 'off';

        const { scope: scopeFilters }: { scope: ScopeFilters } = resolveScopeWithPack(
          {
            path_glob: options.path_glob,
            tags: options.tags,
            lang: options.lang
          },
          { basePath: resolvedPath }
        );

        // Streaming mode
        if (options.stream) {
          const spinner = ora({
            text: chalk.cyan('🔍 Searching...'),
            color: 'cyan'
          }).start();

          let firstChunk = true;

          try {
            const provider: string = options.provider;
            const chatProvider: string = options.chatProvider;
            const workingPath: string = resolvedPath;

            for await (const chunk of synthesizeAnswerStreaming(question, {
              provider,
              chatProvider,
              workingPath,
              scope: scopeFilters,
              maxChunks,
              useReranking,
              temperature
            })) {
              if (firstChunk) {
                spinner.succeed(chalk.cyan('🔍 Searching...  ✓'));
                console.log(chalk.cyan('🤖 Generating answer...\n'));
                console.log(chalk.gray('━'.repeat(80)));
                console.log();
                firstChunk = false;
              }
              process.stdout.write(chunk);
            }
            
            console.log('\n');
          } catch (error) {
            spinner.fail(chalk.red('Error generating answer'));
            console.error(chalk.red(`\n${(error as Error).message}\n`));
            process.exit(1);
          }
          
          delete process.env.CODEVAULT_QUIET;
          return;
        }

        // Non-streaming mode
        const spinner = ora({
          text: chalk.cyan('🔍 Searching...'),
          color: 'cyan'
        }).start();

        const provider: string = options.provider;
        const chatProvider: string = options.chatProvider;
        const workingPath: string = resolvedPath;
        const useMultiQuery: boolean = options.multiQuery ?? false;

        const result: SynthesisResult = await synthesizeAnswer(question, {
          provider,
          chatProvider,
          workingPath,
          scope: scopeFilters,
          maxChunks,
          useReranking,
          useMultiQuery,
          temperature
        });

        spinner.succeed(chalk.cyan(`🔍 Searching...  ✓ ${result.chunksAnalyzed || maxChunks} chunks found`));
        
        const genSpinner = ora({
          text: chalk.cyan('🤖 Generating answer...'),
          color: 'cyan'
        }).start();
        
        genSpinner.succeed(chalk.cyan('🤖 Generating answer...  ✓'));

        if (!result.success) {
          if (result.error === 'no_results') {
            console.log(formatNoResultsMessage(result.query, result.queriesUsed));
          } else {
            console.log(formatErrorMessage(result.error || 'Unknown error', result.query));
          }
          process.exit(1);
        }

        console.log();
        console.log(chalk.gray('━'.repeat(80)));
        console.log();

        let output = formatSynthesisResult(result, {
          includeMetadata: false,  // Hide verbose metadata by default
          includeStats: false
        });

        const includeCitations: boolean = options.citations ?? false;
        if (includeCitations && result.answer) {
          output = addCitationFooter(output);
        }

        console.log(output);

        // Show concise footer
        console.log();
        console.log(chalk.gray('━'.repeat(80)));
        const searchType: string = result.metadata?.searchType || 'hybrid';
        const resultProvider: string = result.chatProvider || 'auto';
        console.log(chalk.gray(`ℹ️  ${result.chunksAnalyzed || maxChunks} code chunks analyzed • ${searchType} search • ${resultProvider}`));
        console.log();

        delete process.env.CODEVAULT_QUIET;

      } catch (error) {
        console.error(chalk.red('\n❌ Error:'), (error as Error).message);
        process.exit(1);
      }
    });
}