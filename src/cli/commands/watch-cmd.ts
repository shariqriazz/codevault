import { Command } from 'commander';
import { startWatch } from '../../indexer/watch.js';
import { print } from '../../utils/logger.js';

interface WatchCommandOptions {
  provider?: string;
  project?: string;
  directory?: string;
  debounce?: string;
  encrypt?: string;
  concurrency?: string | number;
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
    .action(async (projectPath: string = '.', options: WatchCommandOptions): Promise<void> => {
      const resolvedPath = (typeof options.project === 'string' ? options.project : null) ||
        (typeof options.directory === 'string' ? options.directory : null) ||
        (typeof projectPath === 'string' ? projectPath : null) ||
        '.';
      const debounceStr: string = typeof options.debounce === 'string' ? options.debounce : '500';
      const debounceMs = parseInt(debounceStr, 10);
      const providerStr: string = typeof options.provider === 'string' ? options.provider : 'auto';
      const encryptStr: string | undefined = typeof options.encrypt === 'string' ? options.encrypt : undefined;
      const concurrencyNum: number | undefined = options.concurrency !== undefined
        ? parseInt(String(options.concurrency), 10)
        : undefined;

      print(`👀 Watching ${resolvedPath} for changes...`);
      print(`Provider: ${providerStr}`);
      print(`Debounce: ${debounceMs}ms`);

      try {
        const controller = startWatch({
          repoPath: resolvedPath,
          provider: providerStr,
          debounceMs,
          encrypt: encryptStr,
          concurrency: concurrencyNum,
          onBatch: ({ changed, deleted }) => {
            print(`🔁 Indexed ${changed.length} changed / ${deleted.length} deleted files`);
          }
        });

        await controller.ready;
        print('✅ Watcher active. Press Ctrl+C to stop.');

        await new Promise<void>(resolve => {
          const shutdown = (): void => {
            print('\nStopping watcher...');
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
        console.error('❌ Failed to start watcher:', (error as Error).message);
        process.exit(1);
      }
    });
}
