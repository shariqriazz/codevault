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
    .action(async (projectPath = '.', options) => {
      const resolvedPath = options.project || options.directory || projectPath || '.';
      console.log('🔄 Updating project index...');
      console.log(`Provider: ${options.provider}`);
      try {
        await indexProject({ repoPath: resolvedPath, provider: options.provider, encryptMode: options.encrypt });
        console.log('✅ Index updated successfully');
      } catch (error) {
        console.error('❌ ERROR during update:', (error as Error).message);
        process.exit(1);
      }
    });
}
