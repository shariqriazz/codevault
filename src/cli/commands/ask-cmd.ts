import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { synthesizeAnswer, synthesizeAnswerStreaming } from '../../synthesis/synthesizer.js';
import { 
  formatSynthesisResult, 
  formatErrorMessage, 
  formatNoResultsMessage,
  addCitationFooter 
} from '../../synthesis/markdown-formatter.js';
import { resolveScopeWithPack } from '../../context/packs.js';

export function registerAskCommand(program: Command): void {
  program
    .command('ask <question>')
    .description('Ask a question and get LLM-synthesized answer with code citations')
    .option('-p, --provider <provider>', 'embedding provider (auto|openai|ollama)', 'auto')
    .option('-c, --chat-provider <provider>', 'chat LLM provider (auto|openai|ollama)', 'auto')
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
    .action(async (question, options) => {
      try {
        const resolvedPath = options.project || options.directory || options.path || '.';
        const maxChunks = parseInt(options.maxChunks, 10);
        const temperature = parseFloat(options.temperature);
        const useReranking = options.reranker !== 'off';
        
        const { scope: scopeFilters } = resolveScopeWithPack(
          {
            path_glob: options.path_glob,
            tags: options.tags,
            lang: options.lang
          },
          { basePath: resolvedPath }
        );

        // Streaming mode
        if (options.stream) {
          console.log(chalk.cyan('\n🤖 Asking CodeVault...\n'));
          console.log(chalk.gray(`Question: ${question}\n`));
          
          const spinner = ora({
            text: 'Searching codebase...',
            color: 'cyan'
          }).start();

          let firstChunk = true;
          
          try {
            for await (const chunk of synthesizeAnswerStreaming(question, {
              provider: options.provider,
              chatProvider: options.chatProvider,
              workingPath: resolvedPath,
              scope: scopeFilters,
              maxChunks,
              useReranking,
              temperature
            })) {
              if (firstChunk) {
                spinner.stop();
                console.log(chalk.white('Answer:\n'));
                firstChunk = false;
              }
              process.stdout.write(chunk);
            }
            
            console.log('\n');
          } catch (error) {
            spinner.fail('Error generating answer');
            console.error(chalk.red(`\n${(error as Error).message}\n`));
            process.exit(1);
          }
          
          return;
        }

        // Non-streaming mode
        const spinner = ora({
          text: chalk.white('Searching codebase and synthesizing answer...'),
          color: 'cyan'
        }).start();

        const result = await synthesizeAnswer(question, {
          provider: options.provider,
          chatProvider: options.chatProvider,
          workingPath: resolvedPath,
          scope: scopeFilters,
          maxChunks,
          useReranking,
          useMultiQuery: options.multiQuery,
          temperature
        });

        spinner.stop();

        if (!result.success) {
          if (result.error === 'no_results') {
            console.log(formatNoResultsMessage(result.query, result.queriesUsed));
          } else {
            console.log(formatErrorMessage(result.error || 'Unknown error', result.query));
          }
          process.exit(1);
        }

        console.log(chalk.cyan('\n🤖 CodeVault Answer\n'));
        console.log(chalk.gray(`Question: ${question}\n`));

        let output = formatSynthesisResult(result, {
          includeMetadata: options.metadata !== false,
          includeStats: true
        });

        if (options.citations && result.answer) {
          output = addCitationFooter(output);
        }

        console.log(output);

      } catch (error) {
        console.error(chalk.red('\n❌ Error:'), (error as Error).message);
        process.exit(1);
      }
    });
}