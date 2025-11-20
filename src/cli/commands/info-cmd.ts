import fs from 'fs';
import { Command } from 'commander';
import { readCodemap } from '../../codemap/io.js';

export function registerInfoCommand(program: Command): void {
  program
    .command('info')
    .description('Show project information')
    .action(async () => {
      try {
        const codemapPath = 'codevault.codemap.json';

        if (!fs.existsSync(codemapPath)) {
          console.log('Project not indexed');
          console.log('TIP: Run "codevault index" to index the project');
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

        console.log('CodeVault project information\n');
        console.log(`Total indexed functions: ${chunks.length}`);
        console.log('');

        console.log('By language:');
        Object.entries(langStats).forEach(([lang, count]) => {
          console.log(`  ${lang}: ${count} functions`);
        });
        console.log('');

        console.log('Files with most functions:');
        topFiles.forEach(([file, count]) => {
          console.log(`  ${file}: ${count} functions`);
        });
      } catch (error) {
        console.error('ERROR getting information:', (error as Error).message);
        process.exit(1);
      }
    });
}
