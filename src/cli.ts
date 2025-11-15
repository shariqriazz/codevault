#!/usr/bin/env node

import 'dotenv/config';
import { spawn } from 'child_process';
import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerConfigCommands } from './cli/commands/config-cmd.js';
import { registerContextCommands } from './cli/commands/context.js';
import { registerAskCommand } from './cli/commands/ask-cmd.js';
import { registerChatCommand } from './cli/commands/chat-cmd.js';
import { resolveScopeWithPack } from './context/packs.js';
import { readCodemap } from './codemap/io.js';
import { indexProject } from './core/indexer.js';
import { searchCode } from './core/search.js';
import { startWatch } from './indexer/watch.js';
import { IndexerUI } from './utils/cli-ui.js';
import { indexProjectWithProgress } from './utils/indexer-with-progress.js';
import { log } from './utils/logger.js';
import { applyConfigToEnv } from './config/apply-env.js';
import { createEmbeddingProvider, getModelProfile, getSizeLimits } from './providers/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

// Apply config to environment variables (CLI only - MCP uses env vars directly)
// This allows CLI users to use global config while MCP continues using env vars
applyConfigToEnv();

const program = new Command();
program
  .name('codevault')
  .description('CodeVault - AI-powered semantic code search via MCP')
  .version(packageJson.version);

program
  .command('index [path]')
  .description('Index project and build codevault.codemap.json')
  .option('-p, --provider <provider>', 'embedding provider (auto|openai)', 'auto')
  .option('--project <path>', 'alias for project path')
  .option('--directory <path>', 'alias for project directory')
  .option('--encrypt <mode>', 'encrypt chunk payloads (on|off)')
  .option('--verbose', 'show verbose output')
  .action(async (projectPath = '.', options) => {
    const resolvedPath = options.project || options.directory || projectPath || '.';
    const ui = new IndexerUI();
    
    try {
      // Suppress verbose indexer logs if not in verbose mode
      if (!options.verbose) {
        process.env.CODEVAULT_QUIET = 'true';
        // Cache model profile to prevent repeated console.logs
        process.env.CODEVAULT_MODEL_PROFILE_CACHED = 'true';

        // Suppress structured logging to avoid interfering with progress bar
        log.setQuiet(true);

        ui.showHeader();
        
        // Get provider info once for configuration display
        const embeddingProvider = createEmbeddingProvider(options.provider);
        if (embeddingProvider.init) {
          await embeddingProvider.init();
        }
        const providerName = embeddingProvider.getName();
        const modelName = embeddingProvider.getModelName ? embeddingProvider.getModelName() : null;
        const profile = await getModelProfile(providerName, modelName || providerName);
        const limits = getSizeLimits(profile);
        
        ui.showConfiguration({
          provider: providerName,
          model: modelName || undefined,
          dimensions: embeddingProvider.getDimensions(),
          chunkSize: {
            min: limits.min,
            max: limits.max,
            optimal: limits.optimal
          },
          rateLimit: embeddingProvider.rateLimiter ? {
            rpm: embeddingProvider.rateLimiter.getStats().rpm || 0
          } : undefined
        });
        
        ui.startScanning();
      } else {
        console.log('Starting project indexing...');
        console.log(`Provider: ${options.provider}`);
      }
      
      let result;
      
      if (!options.verbose) {
        // Use progress-aware indexer
        result = await indexProjectWithProgress({
          repoPath: resolvedPath,
          provider: options.provider,
          encryptMode: options.encrypt,
          callbacks: {
            onScanComplete: (fileCount) => {
              ui.finishScanning(fileCount, 25);
              ui.startIndexing();
            },
            onFileProgress: (current, total, fileName) => {
              ui.updateProgress(fileName);
            },
            onFinalizing: () => {
              ui.showFinalizing();
            }
          }
        });
        
        ui.cleanup();
        ui.finishIndexing();
        
        // Get file sizes
        const dbPath = path.join(resolvedPath, '.codevault/codevault.db');
        const codemapPath = path.join(resolvedPath, 'codevault.codemap.json');
        const dbSize = fs.existsSync(dbPath) ? `${(fs.statSync(dbPath).size / 1024 / 1024).toFixed(1)} MB` : undefined;
        const codemapSize = fs.existsSync(codemapPath) ? `${(fs.statSync(codemapPath).size / 1024).toFixed(1)} KB` : undefined;
        
        // Update stats from result
        if (result.chunkingStats) {
          ui.updateStats({
            chunks: result.processedChunks,
            merged: result.chunkingStats.mergedSmall,
            subdivided: result.chunkingStats.subdivided,
            skipped: result.chunkingStats.skippedSmall
          });
        }
        
        ui.showSummary({
          totalChunks: result.totalChunks,
          dbSize,
          codemapSize,
          tokenStats: result.tokenStats
        });
        
        // Clean up env vars
        delete process.env.CODEVAULT_QUIET;
        delete process.env.CODEVAULT_MODEL_PROFILE_CACHED;
      } else {
        // Verbose mode uses original indexer
        result = await indexProject({
          repoPath: resolvedPath,
          provider: options.provider,
          encryptMode: options.encrypt
        });
        console.log('Indexing completed successfully');
      }
    } catch (error) {
      if (!options.verbose) {
        ui.cleanup();
        ui.showError((error as Error).message);
      } else {
        console.error('ERROR during indexing:', (error as Error).message);
      }
      process.exit(1);
    }
  });

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

program
  .command('search <query> [path]')
  .description('Search indexed code (returns metadata only)')
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
      // Suppress verbose logs
      process.env.CODEVAULT_QUIET = 'true';
      
      const resolvedPath = options.project || options.directory || projectPath || '.';
      const limit = parseInt(options.limit);
      
      const { scope: scopeFilters } = resolveScopeWithPack(options, { basePath: resolvedPath });
      const results = await searchCode(query, limit, options.provider, resolvedPath, scopeFilters);

      if (!results.success) {
        console.log(chalk.yellow(`\nNo results found for "${query}"`));
        if (results.suggestion) {
          console.log(chalk.gray(`Suggestion: ${results.suggestion}`));
        }
        return;
      }

      if (results.results.length === 0) {
        console.log(chalk.yellow(`\nNo results found for "${query}"`));
        return;
      }

      console.log(chalk.cyan(`\n🔍 Found ${results.results.length} results for "${query}"\n`));

      results.results.forEach((result, index) => {
        const score = (result.meta.score * 100).toFixed(0);
        console.log(chalk.white(`${index + 1}. ${result.path}`));
        console.log(chalk.gray(`   ${result.meta.symbol}() · ${result.lang}`));
        console.log(chalk.gray(`   Score: ${score}%\n`));
      });
      
      delete process.env.CODEVAULT_QUIET;
    } catch (error) {
      console.error(chalk.red('\n❌ Search error:'), (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('search-with-code <query> [path]')
  .description('Search indexed code and display full code chunks')
  .option('-k, --limit <num>', 'maximum results', '5')
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
  .option('--max-code-size <bytes>', 'max code size to display per chunk', '100000')
  .action(async (query, projectPath = '.', options) => {
    try {
      // Suppress verbose logs
      process.env.CODEVAULT_QUIET = 'true';
      
      const resolvedPath = options.project || options.directory || projectPath || '.';
      const limit = parseInt(options.limit);
      const maxCodeSize = parseInt(options.maxCodeSize || '100000');
      
      const { scope: scopeFilters } = resolveScopeWithPack(options, { basePath: resolvedPath });
      const results = await searchCode(query, limit, options.provider, resolvedPath, scopeFilters);

      if (!results.success) {
        console.log(chalk.yellow(`\nNo results found for "${query}"`));
        if (results.suggestion) {
          console.log(chalk.gray(`Suggestion: ${results.suggestion}`));
        }
        return;
      }

      if (results.results.length === 0) {
        console.log(chalk.yellow(`\nNo results found for "${query}"`));
        return;
      }

      console.log(chalk.cyan(`\n🔍 Found ${results.results.length} results with code for "${query}"\n`));

      const { getChunk } = await import('./core/search.js');
      
      for (let index = 0; index < results.results.length; index++) {
        const result = results.results[index];
        const score = (result.meta.score * 100).toFixed(0);
        
        console.log(chalk.gray('━'.repeat(80)));
        console.log(chalk.white(`📄 ${result.path} · ${result.meta.symbol}() · Score: ${score}%`));
        console.log(chalk.gray('━'.repeat(80)));
        
        const chunkResult = await getChunk(result.sha, resolvedPath);
        
        if (chunkResult.success && chunkResult.code) {
          let code = chunkResult.code;
          let truncated = false;
          
          if (code.length > maxCodeSize) {
            code = code.substring(0, maxCodeSize);
            truncated = true;
          }
          
          console.log();
          console.log(code);
          
          if (truncated) {
            console.log(chalk.yellow(`\n⚠️  Code truncated (${chunkResult.code.length} chars, showing ${maxCodeSize})`));
          }
        } else {
          console.log(chalk.red(`\n❌ Error retrieving code: ${chunkResult.error}`));
        }
        
        console.log('');
      }
      
      delete process.env.CODEVAULT_QUIET;
    } catch (error) {
      console.error(chalk.red('\n❌ Search error:'), (error as Error).message);
      process.exit(1);
    }
  });
registerConfigCommands(program);

registerContextCommands(program);

registerAskCommand(program);

registerChatCommand(program);

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