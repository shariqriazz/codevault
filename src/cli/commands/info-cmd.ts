import fs from 'fs';
import { Command } from 'commander';
import { readCodemap } from '../../codemap/io.js';
import { print } from '../../utils/logger.js';

export function registerInfoCommand(program: Command): void {
  program
    .command('info')
    .description('Show project information')
    .action(() => {
      try {
        const codemapPath = 'codevault.codemap.json';

        if (!fs.existsSync(codemapPath)) {
          print('Project not indexed');
          print('TIP: Run "codevault index" to index the project');
          return;
        }

        const codemap = readCodemap(codemapPath);
        const chunks = Object.values(codemap);

        const langStats = chunks.reduce((acc: Record<string, number>, chunk) => {
          acc[chunk.lang || 'unknown'] = (acc[chunk.lang || 'unknown'] || 0) + 1;
          return acc;
        }, {});

        const fileStats = chunks.reduce((acc: Record<string, number>, chunk) => {
          acc[chunk.file] = (acc[chunk.file] || 0) + 1;
          return acc;
        }, {});

        const topFiles = Object.entries(fileStats)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10);

        print('CodeVault project information\n');
        print(`Total indexed functions: ${chunks.length}`);
        print('');

        print('By language:');
        Object.entries(langStats).forEach(([lang, count]) => {
          print(`  ${lang}: ${count} functions`);
        });
        print('');

        print('Files with most functions:');
        topFiles.forEach(([file, count]) => {
          print(`  ${file}: ${count} functions`);
        });
      } catch (error) {
        console.error('ERROR getting information:', (error as Error).message);
        process.exit(1);
      }
    });
}
