import { Command } from 'commander';
import chalk from 'chalk';
import { stdin as input, stdout as output } from 'process';
import * as readline from 'readline/promises';
import {
  createConversationContext,
  addConversationTurn,
  clearConversationHistory,
  getConversationSummary,
  synthesizeConversationalAnswerStreaming,
  type ConversationContext,
  type ConversationTurn
} from '../../synthesis/conversational-synthesizer.js';
import { resolveScopeWithPack } from '../../context/packs.js';

interface ChatOptions {
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
  temperature: string;
  maxHistory: string;
}

export function registerChatCommand(program: Command): void {
  program
    .command('chat')
    .description('Start interactive conversation about the codebase')
    .option('-p, --provider <provider>', 'embedding provider (auto|openai)', 'auto')
    .option('-c, --chat-provider <provider>', 'chat LLM provider (auto|openai)', 'auto')
    .option('--path <path>', 'project root directory', '.')
    .option('--project <path>', 'alias for project path')
    .option('--directory <path>', 'alias for project directory')
    .option('-k, --max-chunks <num>', 'maximum code chunks per query', '10')
    .option('--path_glob <pattern...>', 'file patterns to filter')
    .option('--tags <tag...>', 'filter by tags')
    .option('--lang <language...>', 'filter by language')
    .option('--reranker <mode>', 'use API reranking (on|off)', 'on')
    .option('--temperature <num>', 'LLM temperature (0-2)', '0.7')
    .option('--max-history <num>', 'maximum conversation turns to remember', '5')
    .action(async (options: ChatOptions) => {
      try {
        // Suppress verbose logs
        process.env.CODEVAULT_QUIET = 'true';

        const resolvedPath = options.project || options.directory || options.path || '.';
        const maxChunks = parseInt(options.maxChunks, 10);
        const temperature = parseFloat(options.temperature);
        const maxHistory = parseInt(options.maxHistory, 10);
        const useReranking = options.reranker !== 'off';

        const { scope: scopeFilters } = resolveScopeWithPack(
          {
            path_glob: options.path_glob,
            tags: options.tags,
            lang: options.lang
          },
          { basePath: resolvedPath }
        );

        // Create conversation context
        const conversationContext: ConversationContext = createConversationContext();

        // Display welcome message
        console.log(chalk.cyan.bold('\n💬 CodeVault Interactive Chat'));
        console.log(chalk.gray('━'.repeat(80)));
        console.log(chalk.white('Ask questions about your codebase. Type ') + chalk.cyan('/help') + chalk.white(' for commands.\n'));

        // Create readline interface
        const rl = readline.createInterface({ input, output });

        let isRunning = true;

        while (isRunning) {
          try {
            // Show conversation summary if there's history
            if (conversationContext.turns.length > 0) {
              const summary = getConversationSummary(conversationContext);
              console.log(chalk.gray(`[${summary}]`));
            }

            // Prompt for user input
            const question = await rl.question(chalk.cyan('You: '));
            const trimmedQuestion = question.trim();

            if (!trimmedQuestion) {
              continue;
            }

            // Handle commands
            if (trimmedQuestion.startsWith('/')) {
              const handled = await handleCommand(trimmedQuestion, conversationContext);
              if (handled === 'exit') {
                isRunning = false;
                break;
              }
              continue;
            }

            // Show thinking indicator
            console.log(chalk.gray('🤔 Thinking...\n'));

            // Generate answer with streaming
            let fullAnswer = '';
            let firstChunk = true;

            try {
              let selectedChunks: ConversationTurn['chunks'] = [];
              for await (const chunk of synthesizeConversationalAnswerStreaming(
                trimmedQuestion,
                conversationContext,
                {
                  provider: options.provider,
                  chatProvider: options.chatProvider,
                  workingPath: resolvedPath,
                  scope: scopeFilters,
                  maxChunks,
                  useReranking,
                  temperature,
                  maxHistoryTurns: maxHistory,
                  onChunksSelected: (chunks) => { selectedChunks = chunks; }
                }
              )) {
                if (firstChunk) {
                  console.log(chalk.green('Assistant: '));
                  firstChunk = false;
                }
                process.stdout.write(chunk);
                fullAnswer += chunk;
              }

              console.log('\n');

              // Add to conversation history
              const turn: ConversationTurn = {
                question: trimmedQuestion,
                answer: fullAnswer,
                chunks: selectedChunks,
                timestamp: new Date()
              };
              addConversationTurn(conversationContext, turn);

            } catch (error) {
              console.error(chalk.red(`\n❌ Error: ${(error as Error).message}\n`));
            }

          } catch (error) {
            if ((error as any).code === 'ERR_USE_AFTER_CLOSE') {
              // User pressed Ctrl+C
              isRunning = false;
              break;
            }
            console.error(chalk.red(`\n❌ Error: ${(error as Error).message}\n`));
          }
        }

        // Cleanup
        rl.close();
        console.log(chalk.cyan('\n👋 Goodbye!\n'));
        delete process.env.CODEVAULT_QUIET;

      } catch (error) {
        console.error(chalk.red('\n❌ Error:'), (error as Error).message);
        process.exit(1);
      }
    });
}

/**
 * Handle special commands in chat mode
 */
async function handleCommand(
  command: string,
  context: ConversationContext
): Promise<string | void> {
  const cmd = command.toLowerCase().trim();

  switch (cmd) {
    case '/exit':
    case '/quit':
    case '/q':
      return 'exit';

    case '/clear':
      clearConversationHistory(context);
      console.log(chalk.yellow('🗑️  Conversation history cleared\n'));
      break;

    case '/history':
      if (context.turns.length === 0) {
        console.log(chalk.gray('No conversation history yet.\n'));
      } else {
        console.log(chalk.bold('\n📜 Conversation History:\n'));
        context.turns.forEach((turn, index) => {
          console.log(chalk.cyan(`${index + 1}. Q: `) + turn.question);
          console.log(chalk.gray(`   A: ${turn.answer.substring(0, 100)}...`));
          console.log(chalk.gray(`   Time: ${turn.timestamp.toLocaleString()}\n`));
        });
      }
      break;

    case '/stats': {
      const summary = getConversationSummary(context);
      const uniqueFiles = new Set(
        Array.from(context.allChunks.values()).map(chunk => chunk.result.path)
      );

      console.log(chalk.bold('\n📊 Conversation Statistics:\n'));
      console.log(chalk.gray(`   Turns: ${context.turns.length}`));
      console.log(chalk.gray(`   Code chunks referenced: ${context.allChunks.size}`));
      console.log(chalk.gray(`   Files explored: ${uniqueFiles.size}`));
      console.log(chalk.gray(`   Languages: ${new Set(Array.from(context.allChunks.values()).map(c => c.result.lang)).size}\n`));
      
      if (uniqueFiles.size > 0) {
        console.log(chalk.bold('   Files in context:'));
        Array.from(uniqueFiles).slice(0, 10).forEach(file => {
          console.log(chalk.gray(`   - ${file}`));
        });
        if (uniqueFiles.size > 10) {
          console.log(chalk.gray(`   ... and ${uniqueFiles.size - 10} more\n`));
        } else {
          console.log('');
        }
      }
      break;
    }

    case '/help':
    case '/?':
      console.log(chalk.bold('\n📖 Available Commands:\n'));
      console.log(chalk.cyan('  /help') + chalk.gray('        - Show this help message'));
      console.log(chalk.cyan('  /exit') + chalk.gray('        - Exit chat mode (or Ctrl+C)'));
      console.log(chalk.cyan('  /quit') + chalk.gray('        - Same as /exit'));
      console.log(chalk.cyan('  /clear') + chalk.gray('       - Clear conversation history'));
      console.log(chalk.cyan('  /history') + chalk.gray('     - Show conversation history'));
      console.log(chalk.cyan('  /stats') + chalk.gray('       - Show conversation statistics'));
      console.log(chalk.gray('\n  Tips:'));
      console.log(chalk.gray('  - Ask follow-up questions naturally'));
      console.log(chalk.gray('  - Reference previous answers ("the function you mentioned")'));
      console.log(chalk.gray('  - Use /clear to start a fresh topic\n'));
      break;

    default:
      console.log(chalk.yellow(`Unknown command: ${cmd}`));
      console.log(chalk.gray('Type /help for available commands\n'));
      break;
  }
}
