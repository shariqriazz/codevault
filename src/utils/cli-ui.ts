import cliProgress from 'cli-progress';
import ora from 'ora';
import chalk from 'chalk';

function formatEta(ms: number | null): string {
  if (ms === null || ms === undefined || ms < 0) return 'estimating…';
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
  private spinner: any = null;
  private startTime: number = 0;
  private totalFiles: number = 0;
  private processedFiles: number = 0;
  private stats = {
    chunks: 0,
    merged: 0,
    subdivided: 0,
    skipped: 0
  };

  showHeader() {
    console.log(chalk.cyan.bold('\n🔍 CodeVault Indexer'));
  }

  showConfiguration(config: {
    provider: string;
    model?: string;
    dimensions: number;
    chunkSize: { min: number; max: number; optimal: number };
    rateLimit?: { rpm: number; tpm?: number };
  }) {
    console.log(chalk.white('\n📊 Configuration'));
    console.log(chalk.gray(`   Provider:    ${config.provider}${config.model ? ` (${config.model})` : ''}`));
    console.log(chalk.gray(`   Dimensions:  ${config.dimensions}`));
    console.log(chalk.gray(`   Chunk size:  ${Math.floor(config.chunkSize.min / 1000)}K-${Math.floor(config.chunkSize.max / 1000)}K tokens (optimal: ${Math.floor(config.chunkSize.optimal / 1000)}K)`));
    if (config.rateLimit) {
      console.log(chalk.gray(`   Rate limit:  ${config.rateLimit.rpm.toLocaleString()} req/min`));
    }
  }

  startScanning() {
    this.spinner = ora({
      text: chalk.white('Scanning project...'),
      color: 'cyan'
    }).start();
  }

  finishScanning(fileCount: number, languages: number) {
    if (this.spinner) {
      this.spinner.succeed(chalk.white(`Found ${chalk.cyan(fileCount)} files across ${chalk.cyan(languages)}+ languages`));
      this.spinner = null;
    }
    this.totalFiles = fileCount;
  }

  startIndexing() {
    this.startTime = Date.now();
    this.processedFiles = 0;
    
    console.log(chalk.white('\n⚡ Indexing files'));
    
    if (this.totalFiles > 0) {
      this.progressBar = new cliProgress.SingleBar({
        format: `${chalk.cyan('   [{bar}]')  } {percentage}% | {value}/{total} files | ETA {eta_manual}`,
        barCompleteChar: '█',
        barIncompleteChar: '░',
        hideCursor: true,
        clearOnComplete: false,
        stopOnComplete: true
      });
      
      this.progressBar.start(this.totalFiles, 0, { eta_manual: 'estimating…' });
    }
  }

  updateProgress(fileName: string, current?: number, total?: number, etaMs?: number | null, countFile: boolean = true) {
    if (countFile) {
      this.processedFiles++;
    }

    const etaText = formatEta(etaMs ?? null);

    if (this.progressBar) {
      // Refresh ETA even when the file count doesn't change
      this.progressBar.update(this.processedFiles, { eta_manual: etaText });
    }

    if (this.spinner && etaMs !== undefined) {
      const totals = current !== undefined && total !== undefined ? ` (${current}/${total})` : '';
      this.spinner.text = chalk.white(`Indexing: ${fileName}${totals} — ETA ${etaText}`);
    }
  }

  updateStats(stats: { chunks?: number; merged?: number; subdivided?: number; skipped?: number }) {
    if (stats.chunks !== undefined) this.stats.chunks = stats.chunks;
    if (stats.merged !== undefined) this.stats.merged = stats.merged;
    if (stats.subdivided !== undefined) this.stats.subdivided = stats.subdivided;
    if (stats.skipped !== undefined) this.stats.skipped = stats.skipped;
  }

  showFinalizing() {
    if (this.progressBar) {
      this.progressBar.stop();
      this.progressBar = null;
    }
    
    this.spinner = ora({
      text: chalk.white('Finalizing embeddings and building indexes...'),
      color: 'cyan'
    }).start();
  }

  finishIndexing() {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
    
    if (this.progressBar) {
      this.progressBar.stop();
      this.progressBar = null;
    }
    
    if (this.startTime > 0) {
      const duration = Date.now() - this.startTime;
      const minutes = Math.floor(duration / 60000);
      const seconds = Math.floor((duration % 60000) / 1000);
      const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
      
      console.log(chalk.green(`\n✅ Indexing complete in ${timeStr}!`));
    } else {
      console.log(chalk.green(`\n✅ Indexing complete!`));
    }
  }

  showSummary(summary: {
    totalChunks: number;
    dbSize?: string;
    codemapSize?: string;
    tokenStats?: any;
  }) {
    console.log(chalk.white('\n📊 Summary'));
    console.log(chalk.gray(`   Total chunks:      ${chalk.white(summary.totalChunks)}`));
    
    if (this.stats.merged > 0) {
      console.log(chalk.gray(`   Merged small:      ${chalk.white(this.stats.merged)}`));
    }
    if (this.stats.subdivided > 0) {
      console.log(chalk.gray(`   Subdivided large:  ${chalk.white(this.stats.subdivided)}`));
    }
    if (this.stats.skipped > 0) {
      console.log(chalk.gray(`   Skipped (small):   ${chalk.white(this.stats.skipped)}`));
    }
    
    if (summary.dbSize) {
      console.log(chalk.gray(`   Database:          ${chalk.white(summary.dbSize)}`));
    }
    if (summary.codemapSize) {
      console.log(chalk.gray(`   Codemap:           ${chalk.white(summary.codemapSize)}`));
    }

    console.log(chalk.cyan('\n🚀 Ready to use!'));
    console.log(chalk.gray(`   Quick search:       ${chalk.white('codevault search "your query"')}`));
    console.log(chalk.gray(`   With code chunks:   ${chalk.white('codevault search-with-code "your query"')}`));
    console.log(chalk.gray(`   Ask w/ synthesis:   ${chalk.white('codevault ask "How does auth work?"')}`));
    console.log(chalk.gray(`   Interactive chat:   ${chalk.white('codevault chat')}`));
    console.log(chalk.gray(`   Auto-update index:  ${chalk.white('codevault watch --debounce 500')}`));
    console.log(chalk.gray(`   Partial reindex:    ${chalk.white('codevault update --files src/app.ts')}`));
    console.log(chalk.gray(`   MCP server:         ${chalk.white('codevault mcp (Claude Desktop, etc.)')}`));
    console.log('');
  }

  showError(message: string) {
    console.error(chalk.red(`\n❌ Error: ${message}\n`));
  }

  cleanup() {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
    if (this.progressBar) {
      this.progressBar.stop();
      this.progressBar = null;
    }
  }
}
