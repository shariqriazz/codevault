import { Command } from 'commander';
import { indexProject } from '../../core/indexer.js';

export function registerUpdateCommand(program: Command): void {
  program
    .command('update [path]')
    .description('Update index by re-scanning all files')
    .option('-p, --provider <provider>', 'embedding provider (auto|openai)', 'auto')
    .option('--project <path>', 'alias for project path')
    .option('--directory <path>', 'alias for project directory')
    .option('--encrypt <mode>', 'encrypt chunk payloads (on|off)')
    .option('--concurrency <number>', 'number of files to process concurrently (default: 200, max: 1000)')
    .action(async (projectPath = '.', options: Record<string, unknown>) => {
      let resolvedPath = '.';
      if (typeof options.project === 'string') {
        resolvedPath = options.project;
      } else if (typeof options.directory === 'string') {
        resolvedPath = options.directory;
      } else if (typeof projectPath === 'string' && projectPath) {
        resolvedPath = projectPath;
      }
      console.log('🔄 Updating project index...');
      console.log(`Provider: ${String(options.provider)}`);
      try {
        await indexProject({
          repoPath: String(resolvedPath),
          provider: String(options.provider),
          encryptMode: String(options.encrypt),
          concurrency: options.concurrency ? parseInt(String(options.concurrency), 10) : undefined
        });
        console.log('✅ Index updated successfully');
      } catch (error) {
        console.error('❌ ERROR during update:', (error as Error).message);
        process.exit(1);
      }
    });
}
