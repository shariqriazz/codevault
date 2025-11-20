import { Command } from 'commander';
import { startWatch } from '../../indexer/watch.js';

export function registerWatchCommand(program: Command): void {
  program
    .command('watch [path]')
    .description('Watch project files and update index on changes')
    .option('-p, --provider <provider>', 'embedding provider (auto|openai)', 'auto')
    .option('--project <path>', 'alias for project path')
    .option('--directory <path>', 'alias for project directory')
    .option('-d, --debounce <ms>', 'debounce interval (default 500)', '500')
    .option('--encrypt <mode>', 'encrypt chunk payloads (on|off)')
    .action(async (projectPath = '.', options) => {
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
          onBatch: ({ changed, deleted }) => {
            console.log(`🔁 Indexed ${changed.length} changed / ${deleted.length} deleted files`);
          }
        });

        await controller.ready;
        console.log('✅ Watcher active. Press Ctrl+C to stop.');

        await new Promise<void>(resolve => {
          const shutdown = async () => {
            console.log('\nStopping watcher...');
            await controller.close();
            process.off('SIGINT', shutdown);
            process.off('SIGTERM', shutdown);
            resolve();
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
