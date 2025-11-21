import { Command } from 'commander';
import { indexProject } from '../../core/indexer.js';
import { getErrorMessage } from '../../utils/error-utils.js';

interface UpdateCommandOptions {
  provider: string;
  project?: string;
  directory?: string;
  encrypt?: string;
  concurrency?: string;
}

export function registerUpdateCommand(program: Command): void {
  program
    .command('update [path]')
    .description('Update index by re-scanning all files')
    .option('-p, --provider <provider>', 'embedding provider (auto|openai)', 'auto')
    .option('--project <path>', 'alias for project path')
    .option('--directory <path>', 'alias for project directory')
    .option('--encrypt <mode>', 'encrypt chunk payloads (on|off)')
    .option('--concurrency <number>', 'number of files to process concurrently (default: 200, max: 1000)')
    .action(async (projectPath = '.', options: UpdateCommandOptions) => {
      const resolvedPath = options.project || options.directory || projectPath || '.';
      console.log('🔄 Updating project index...');
      console.log(`Provider: ${options.provider}`);
      try {
        await indexProject({
          repoPath: resolvedPath,
          provider: options.provider,
          encryptMode: options.encrypt,
          concurrency: options.concurrency ? parseInt(options.concurrency, 10) : undefined
        });
        console.log('✅ Index updated successfully');
      } catch (error) {
        console.error('❌ ERROR during update:', getErrorMessage(error));
        process.exit(1);
      }
    });
}
