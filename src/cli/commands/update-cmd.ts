import { Command } from 'commander';
import { indexProject } from '../../core/indexer.js';
import { print } from '../../utils/logger.js';

interface UpdateCommandOptions {
  provider?: string;
  project?: string;
  directory?: string;
  encrypt?: string;
  concurrency?: string | number;
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
    .action(async (projectPath: string = '.', options: UpdateCommandOptions) => {
      const resolvedPath = (typeof options.project === 'string' ? options.project : null) ||
        (typeof options.directory === 'string' ? options.directory : null) ||
        (typeof projectPath === 'string' ? projectPath : null) ||
        '.';
      const providerStr: string = typeof options.provider === 'string' ? options.provider : 'auto';
      const encryptStr: string | undefined = typeof options.encrypt === 'string' ? options.encrypt : undefined;
      const concurrencyNum: number | undefined = options.concurrency !== undefined
        ? parseInt(String(options.concurrency), 10)
        : undefined;
      print('🔄 Updating project index...');
      print(`Provider: ${providerStr}`);
      try {
        await indexProject({
          repoPath: resolvedPath,
          provider: providerStr,
          encryptMode: encryptStr,
          concurrency: concurrencyNum
        });
        print('✅ Index updated successfully');
      } catch (error) {
        console.error('❌ ERROR during update:', (error as Error).message);
        process.exit(1);
      }
    });
}
