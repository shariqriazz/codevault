import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { indexProject } from '../../core/indexer.js';
import { IndexerUI } from '../../utils/cli-ui.js';
import { indexProjectWithProgress } from '../../utils/indexer-with-progress.js';
import { log, print } from '../../utils/logger.js';
import { createEmbeddingProvider, getModelProfile, getSizeLimits } from '../../providers/index.js';
import { resolveProviderContext } from '../../config/resolver.js';

export function registerIndexCommand(program: Command): void {
  program
    .command('index [path]')
    .description('Index project and build codevault.codemap.json')
    .option('-p, --provider <provider>', 'embedding provider (auto|openai)', 'auto')
    .option('--project <path>', 'alias for project path')
    .option('--directory <path>', 'alias for project directory')
    .option('--encrypt <mode>', 'encrypt chunk payloads (on|off)')
    .option('--concurrency <number>', 'number of files to process concurrently (default: 200, max: 1000)')
    .option('--verbose', 'show verbose output')
    .action(async (projectPath = '.', options) => {
      const resolvedPath: string = (typeof options.project === 'string' ? options.project : null) ||
                                    (typeof options.directory === 'string' ? options.directory : null) ||
                                    (typeof projectPath === 'string' ? projectPath : null) ||
                                    '.';
      const ui = new IndexerUI();

      try {
        if (!options.verbose) {
          process.env.CODEVAULT_QUIET = 'true';
          process.env.CODEVAULT_MODEL_PROFILE_CACHED = 'true';
          log.setQuiet(true);

          ui.showHeader();

          const providerContext = resolveProviderContext(resolvedPath);
          const providerOption: string = typeof options.provider === 'string' ? options.provider : 'auto';
          const embeddingProvider = createEmbeddingProvider(providerOption, providerContext.embedding);
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
          print('Starting project indexing...');
          print(`Provider: ${typeof options.provider === 'string' ? options.provider : 'auto'}`);
        }

        let result;

        const providerOption: string = typeof options.provider === 'string' ? options.provider : 'auto';
        const encryptMode: string | undefined = typeof options.encrypt === 'string' ? options.encrypt : undefined;
        const concurrency = options.concurrency ? parseInt(String(options.concurrency), 10) : undefined;

        if (!options.verbose) {
          result = await indexProjectWithProgress({
            repoPath: resolvedPath,
            provider: providerOption,
            encryptMode,
            concurrency,
            callbacks: {
            onScanComplete: (fileCount) => {
              ui.finishScanning(fileCount, 25);
              ui.startIndexing();
            },
            onFileProgress: (current, total, fileName, etaMs, _avgPerFileMs, countFile = true) => {
              ui.updateProgress(fileName, current, total, etaMs ?? null, countFile);
            },
            onChunkHeartbeat: (etaMs) => {
              ui.updateProgress('processing...', undefined, undefined, etaMs ?? null, false);
            },
            onFinalizing: () => {
              ui.showFinalizing();
            }
          }
        });

          ui.cleanup();
          ui.finishIndexing();

          const dbPath = path.join(resolvedPath, '.codevault/codevault.db');
          const codemapPath = path.join(resolvedPath, 'codevault.codemap.json');
          const dbSize = fs.existsSync(dbPath) ? `${(fs.statSync(dbPath).size / 1024 / 1024).toFixed(1)} MB` : undefined;
          const codemapSize = fs.existsSync(codemapPath) ? `${(fs.statSync(codemapPath).size / 1024).toFixed(1)} KB` : undefined;

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

          delete process.env.CODEVAULT_QUIET;
          delete process.env.CODEVAULT_MODEL_PROFILE_CACHED;
        } else {
          result = await indexProject({
            repoPath: resolvedPath,
            provider: providerOption,
            encryptMode,
            concurrency
          });
          print('Indexing completed successfully');
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
}
