#!/usr/bin/env node

import 'dotenv/config';
import { spawn } from 'child_process';
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerContextCommands } from './cli/commands/context.js';
import { resolveScopeWithPack } from './context/packs.js';
import { readCodemap } from './codemap/io.js';
import { indexProject } from './core/indexer.js';
import { searchCode } from './core/search.js';
import { startWatch } from './indexer/watch.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

const program = new Command();
program
  .name('codevault')
  .description('CodeVault - AI-powered semantic code search via MCP')
  .version(packageJson.version);

program
  .command('index [path]')
  .description('Index project and build codevault.codemap.json')
  .option('-p, --provider <provider>', 'embedding provider (auto|openai|ollama)', 'auto')
  .option('--project <path>', 'alias for project path')
  .option('--directory <path>', 'alias for project directory')
  .option('--encrypt <mode>', 'encrypt chunk payloads (on|off)')
  .action(async (projectPath = '.', options) => {
    const resolvedPath = options.project || options.directory || projectPath || '.';
    console.log('Starting project indexing...');
    console.log(`Provider: ${options.provider}`);
    try {
      await indexProject({ repoPath: resolvedPath, provider: options.provider, encryptMode: options.encrypt });
      console.log('Indexing completed successfully');
    } catch (error) {
      console.error('ERROR during indexing:', (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('update [path]')
  .description('Update index by re-scanning all files')
  .option('-p, --provider <provider>', 'embedding provider (auto|openai|ollama)', 'auto')
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

program
  .command('watch [path]')
  .description('Watch project files and update index on changes')
  .option('-p, --provider <provider>', 'embedding provider (auto|openai|ollama)', 'auto')
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

program
  .command('search <query> [path]')
  .description('Search indexed code')
  .option('-k, --limit <num>', 'maximum results', '10')
  .option('-p, --provider <provider>', 'embedding provider', 'auto')
  .option('--project <path>', 'project path')
  .option('--directory <path>', 'project directory')
  .option('--path_glob <pattern...>', 'file patterns')
  .option('--tags <tag...>', 'filter by tags')
  .option('--lang <language...>', 'filter by language')
  .option('--reranker <mode>', 'reranker (off|api)', 'off')
  .option('--hybrid <mode>', 'hybrid search (on|off)', 'on')
  .option('--bm25 <mode>', 'BM25 (on|off)', 'on')
  .option('--symbol_boost <mode>', 'symbol boost (on|off)', 'on')
  .action(async (query, projectPath = '.', options) => {
    try {
      const resolvedPath = options.project || options.directory || projectPath || '.';
      const limit = parseInt(options.limit);
      
      const { scope: scopeFilters } = resolveScopeWithPack(options, { basePath: resolvedPath });
      const results = await searchCode(query, limit, options.provider, resolvedPath, scopeFilters);

      if (!results.success) {
        console.log(`No results found for: "${query}"`);
        if (results.suggestion) {
          console.log(`Suggestion: ${results.suggestion}`);
        }
        return;
      }

      if (results.results.length === 0) {
        console.log(`No results found for: "${query}"`);
        return;
      }

      console.log(`Found ${results.results.length} results for: "${query}"\n`);

      results.results.forEach((result, index) => {
        console.log(`${index + 1}. FILE: ${result.path}`);
        console.log(`   SYMBOL: ${result.meta.symbol} (${result.lang})`);
        console.log(`   SIMILARITY: ${result.meta.score}`);
        console.log(`   SHA: ${result.sha}`);
        console.log('');
      });
    } catch (error) {
      console.error('Search error:', (error as Error).message);
      process.exit(1);
    }
  });

registerContextCommands(program);

program
  .command('mcp')
  .description('Start MCP server')
  .action(() => {
    const serverPath = path.join(__dirname, 'mcp-server.js');
    const mcpServer = spawn('node', [serverPath], {
      stdio: 'inherit'
    });

    mcpServer.on('error', (error) => {
      process.stderr.write(`ERROR starting MCP server: ${error.message}\n`);
      process.exit(1);
    });

    mcpServer.on('exit', (code) => {
      if (code !== 0) {
        process.stderr.write(`MCP server terminated with code: ${code}\n`);
        process.exit(code || 0);
      }
    });

    process.on('SIGINT', () => {
      mcpServer.kill('SIGINT');
    });

    process.on('SIGTERM', () => {
      mcpServer.kill('SIGTERM');
    });
  });

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

if (process.argv.length <= 2) {
  program.help();
}

program.parse(process.argv);