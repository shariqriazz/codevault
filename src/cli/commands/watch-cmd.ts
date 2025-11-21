import { Command } from 'commander';
import { startWatch } from '../../indexer/watch.js';
import { getErrorMessage } from '../../utils/error-utils.js';

interface WatchCommandOptions {
  provider: string;
  project?: string;
  directory?: string;
  debounce: string;
  encrypt?: string;
  concurrency?: string;
}

export function registerWatchCommand(program: Command): void {
  program
    .command('watch [path]')
    .description('Watch project files and update index on changes')
    .option('-p, --provider <provider>', 'embedding provider (auto|openai)', 'auto')
    .option('--project <path>', 'alias for project path')
    .option('--directory <path>', 'alias for project directory')
    .option('-d, --debounce <ms>', 'debounce interval (default 500)', '500')
    .option('--encrypt <mode>', 'encrypt chunk payloads (on|off)')
    .option('--concurrency <number>', 'number of files to process concurrently (default: 200, max: 1000)')
    .action(async (projectPath = '.', options: WatchCommandOptions) => {
      const resolvedPath = options.project || options.directory || projectPath || '.';
      const debounceMs = parseInt(options.debounce, 10);

      console.log(`👀 Watching ${resolvedPath} for changes...`);
      console.log(`Provider: ${options.provider}`);
      console.log(`Debounce: ${debounceMs}ms`);

      try {
        const controller = startWatch({
          repoPath: resolvedPath,
          provider: options.provider,
          debounceMs,
          encrypt: options.encrypt,
          concurrency: options.concurrency ? parseInt(options.concurrency, 10) : undefined,
          onBatch: ({ changed, deleted }) => {
            console.log(`🔁 Indexed ${changed.length} changed / ${deleted.length} deleted files`);
          }
        });

        await controller.ready;
        console.log('✅ Watcher active. Press Ctrl+C to stop.');

        await new Promise<void>(resolve => {
          const shutdown = () => {
            console.log('\nStopping watcher...');
            void controller.close().then(() => {
              process.off('SIGINT', shutdown);
              process.off('SIGTERM', shutdown);
              resolve();
            });
          };

          process.on('SIGINT', shutdown);
          process.on('SIGTERM', shutdown);
        });
      } catch (error) {
        console.error('❌ Failed to start watcher:', getErrorMessage(error));
        process.exit(1);
      }
    });
}
