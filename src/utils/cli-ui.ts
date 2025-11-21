import cliProgress from 'cli-progress';
import ora from 'ora';
import chalk from 'chalk';
import { print } from './logger.js';

const STALLED_ETA_SENTINEL = -1;

function formatEta(ms: number | null): string {
  if (ms === null || ms === undefined || ms < 0) return 'estimating…';
  if (ms === STALLED_ETA_SENTINEL) return 'stalled…';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export class IndexerUI {
  private progressBar: cliProgress.SingleBar | null = null;
  private spinner: ora.Ora | null = null;
  private startTime: number = 0;
  private totalFiles: number = 0;
  private processedFiles: number = 0;
  private stats = {
    chunks: 0,
    merged: 0,
    subdivided: 0,
    skipped: 0
  };

  showHeader(): void {
    print(chalk.cyan.bold('\n🔍 CodeVault Indexer'));
  }

  showConfiguration(config: {
    provider: string;
    model?: string;
    dimensions: number;
    chunkSize: { min: number; max: number; optimal: number };
    rateLimit?: { rpm: number; tpm?: number };
  }): void {
    print(chalk.white('\n📊 Configuration'));
    print(chalk.gray(`   Provider:    ${config.provider}${config.model ? ` (${config.model})` : ''}`));
    print(chalk.gray(`   Dimensions:  ${config.dimensions}`));
    print(chalk.gray(`   Chunk size:  ${Math.floor(config.chunkSize.min / 1000)}K-${Math.floor(config.chunkSize.max / 1000)}K tokens (optimal: ${Math.floor(config.chunkSize.optimal / 1000)}K)`));
    if (config.rateLimit) {
      print(chalk.gray(`   Rate limit:  ${config.rateLimit.rpm.toLocaleString()} req/min`));
    }
  }

  startScanning(): void {
    this.spinner = ora({
      text: chalk.white('Scanning project...'),
      color: 'cyan'
    }).start();
  }

  finishScanning(fileCount: number, languages: number): void {
    if (this.spinner) {
      this.spinner.succeed(chalk.white(`Found ${chalk.cyan(fileCount)} files across ${chalk.cyan(languages)}+ languages`));
      this.spinner = null;
    }
    this.totalFiles = fileCount;
  }

  startIndexing(): void {
    this.startTime = Date.now();
    this.processedFiles = 0;

    print(chalk.white('\n⚡ Indexing files'));

    if (this.totalFiles > 0) {
      this.progressBar = new cliProgress.SingleBar({
        format: `${chalk.cyan('   [{bar}]')  } {percentage}% | {value}/{total} files | ETA {eta_manual}`,
        hideCursor: true,
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        clearOnComplete: false
      });
      this.progressBar.start(this.totalFiles, 0, {
        eta_manual: 'estimating…'
      });
    }
  }

  updateProgress(): void {
    this.processedFiles += 1;

    if (!this.progressBar) return;

    const elapsedMs = Date.now() - this.startTime;
    const averageMsPerFile = elapsedMs / Math.max(this.processedFiles, 1);
    const remainingFiles = Math.max(this.totalFiles - this.processedFiles, 0);
    const etaMs = this.totalFiles > 0 ? averageMsPerFile * remainingFiles : null;

    this.progressBar.update(this.processedFiles, {
      eta_manual: formatEta(etaMs && etaMs < 1000000 ? etaMs : STALLED_ETA_SENTINEL)
    });
  }

  updateChunkStats(stats: { chunks: number; merged: number; subdivided: number; skipped: number }): void {
    this.stats = stats;
  }

  finishIndexing(): void {
    if (this.progressBar) {
      this.progressBar.stop();
      this.progressBar = null;
    }

    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  showSummary(summary: {
    totalChunks: number;
    dbSize?: string;
    codemapSize?: string;
    tokenStats?: any;
  }): void {
    print(chalk.white('\n📊 Summary'));
    print(chalk.gray(`   Total chunks:      ${chalk.white(summary.totalChunks)}`));

    if (this.stats.merged > 0) {
      print(chalk.gray(`   Merged small:      ${chalk.white(this.stats.merged)}`));
    }
    if (this.stats.subdivided > 0) {
      print(chalk.gray(`   Subdivided large:  ${chalk.white(this.stats.subdivided)}`));
    }
    if (this.stats.skipped > 0) {
      print(chalk.gray(`   Skipped (small):   ${chalk.white(this.stats.skipped)}`));
    }

    if (summary.dbSize) {
      print(chalk.gray(`   Database:          ${chalk.white(summary.dbSize)}`));
    }
    if (summary.codemapSize) {
      print(chalk.gray(`   Codemap:           ${chalk.white(summary.codemapSize)}`));
    }

    print(chalk.cyan('\n🚀 Ready to use!'));
    print(chalk.gray(`   Quick search:       ${chalk.white('codevault search "your query"')}`));
    print(chalk.gray(`   With code chunks:   ${chalk.white('codevault search-with-code "your query"')}`));
    print(chalk.gray(`   Ask w/ synthesis:   ${chalk.white('codevault ask "How does auth work?"')}`));
    print(chalk.gray(`   Interactive chat:   ${chalk.white('codevault chat')}`));
    print(chalk.gray(`   Auto-update index:  ${chalk.white('codevault watch --debounce 500')}`));
    print(chalk.gray(`   Partial reindex:    ${chalk.white('codevault update --files src/app.ts')}`));
    print(chalk.gray(`   MCP server:         ${chalk.white('codevault mcp (Claude Desktop, etc.)')}`));
    print('');
  }

  showError(message: string): void {
    if (this.spinner) {
      this.spinner.fail(chalk.red(message));
    } else {
      print(chalk.red(message));
    }
  }
}
