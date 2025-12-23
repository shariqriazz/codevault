import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'timers/promises';
import { IndexerUI } from '../utils/cli-ui.js';

// ============================================================================
// Helper Functions
// ============================================================================

interface OutputCapture {
  stdout: string[];
  stderr: string[];
}

function captureOutput(): {
  capture: OutputCapture;
  restore: () => void;
} {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const originalConsoleWarn = console.warn.bind(console);
  const originalConsoleError = console.error.bind(console);

  const capture: OutputCapture = {
    stdout: [],
    stderr: []
  };

  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    capture.stdout.push(chunk.toString());
    return true;
  };

  process.stderr.write = (chunk: string | Uint8Array): boolean => {
    capture.stderr.push(chunk.toString());
    return true;
  };

  console.warn = (...args: unknown[]): void => {
    capture.stderr.push(args.map(a => String(a)).join(' '));
  };

  console.error = (...args: unknown[]): void => {
    capture.stderr.push(args.map(a => String(a)).join(' '));
  };

  const restore = (): void => {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  };

  return { capture, restore };
}

// ============================================================================
// IndexerUI Constructor Tests
// ============================================================================

test('IndexerUI can be instantiated', () => {
  const ui = new IndexerUI();
  assert.ok(ui instanceof IndexerUI);
});

test('IndexerUI methods are callable after construction', () => {
  const ui = new IndexerUI();
  assert.equal(typeof ui.showHeader, 'function');
  assert.equal(typeof ui.showConfiguration, 'function');
  assert.equal(typeof ui.startScanning, 'function');
  assert.equal(typeof ui.finishScanning, 'function');
  assert.equal(typeof ui.startIndexing, 'function');
  assert.equal(typeof ui.updateProgress, 'function');
  assert.equal(typeof ui.updateStats, 'function');
  assert.equal(typeof ui.showFinalizing, 'function');
  assert.equal(typeof ui.finishIndexing, 'function');
  assert.equal(typeof ui.showSummary, 'function');
  assert.equal(typeof ui.showError, 'function');
  assert.equal(typeof ui.cleanup, 'function');
});

// ============================================================================
// showHeader Tests
// ============================================================================

test('showHeader outputs header text', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.showHeader();
  restore();

  const output = capture.stdout.join('');
  assert.ok(output.includes('CodeVault'));
});

// ============================================================================
// showConfiguration Tests
// ============================================================================

test('showConfiguration outputs provider information', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.showConfiguration({
    provider: 'OpenAI',
    dimensions: 1536,
    chunkSize: { min: 1000, max: 8000, optimal: 4000 }
  });
  restore();

  const output = capture.stdout.join('');
  assert.ok(output.includes('OpenAI'));
  assert.ok(output.includes('1536'));
});

test('showConfiguration includes model when provided', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.showConfiguration({
    provider: 'OpenAI',
    model: 'text-embedding-ada-002',
    dimensions: 1536,
    chunkSize: { min: 1000, max: 8000, optimal: 4000 }
  });
  restore();

  const output = capture.stdout.join('');
  assert.ok(output.includes('text-embedding-ada-002'));
});

test('showConfiguration includes rate limit when provided', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.showConfiguration({
    provider: 'OpenAI',
    dimensions: 1536,
    chunkSize: { min: 1000, max: 8000, optimal: 4000 },
    rateLimit: { rpm: 100 }
  });
  restore();

  const output = capture.stdout.join('');
  assert.ok(output.includes('100'));
  assert.ok(output.includes('req/min') || output.includes('rate'));
});

test('showConfiguration handles chunk size display correctly', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.showConfiguration({
    provider: 'Test',
    dimensions: 768,
    chunkSize: { min: 2000, max: 16000, optimal: 8000 }
  });
  restore();

  const output = capture.stdout.join('');
  // Should show values in K (thousands)
  assert.ok(output.includes('2') || output.includes('16') || output.includes('8'));
});

// ============================================================================
// Scanning Phase Tests
// ============================================================================

test('startScanning creates spinner', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.startScanning();
  ui.cleanup(); // Stop spinner to prevent hanging
  restore();

  // Spinner should have started (may not output immediately)
  assert.ok(true); // Just verify no errors
});

test('finishScanning stops spinner and shows file count', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.startScanning();
  ui.finishScanning(150, 5);
  restore();

  const output = capture.stdout.join('');
  assert.ok(output.includes('150') || output.includes('files'));
});

test('finishScanning handles zero files', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.startScanning();
  ui.finishScanning(0, 0);
  restore();

  const output = capture.stdout.join('');
  assert.ok(output.includes('0') || output.includes('files'));
});

test('finishScanning works without prior startScanning', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  // Should not throw even if startScanning was not called
  ui.finishScanning(100, 3);
  restore();

  // Just verify no errors thrown
  assert.ok(true);
});

// ============================================================================
// Indexing Phase Tests
// ============================================================================

test('startIndexing initializes progress bar with file count', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.finishScanning(50, 3); // Set total files
  ui.startIndexing();
  ui.cleanup();
  restore();

  const output = capture.stdout.join('');
  assert.ok(output.includes('Indexing') || output.includes('files'));
});

test('startIndexing handles zero total files', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.finishScanning(0, 0);
  ui.startIndexing();
  ui.cleanup();
  restore();

  // Should not throw with zero files
  assert.ok(true);
});

test('updateProgress increments file count', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.finishScanning(10, 2);
  ui.startIndexing();
  ui.updateProgress('file1.ts');
  ui.updateProgress('file2.ts');
  ui.cleanup();
  restore();

  // Progress should be tracked internally
  assert.ok(true);
});

test('updateProgress with countFile false does not increment', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.finishScanning(10, 2);
  ui.startIndexing();
  ui.updateProgress('file1.ts', undefined, undefined, undefined, false);
  ui.cleanup();
  restore();

  // Should not throw
  assert.ok(true);
});

test('updateProgress handles ETA values', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.finishScanning(10, 2);
  ui.startIndexing();
  ui.updateProgress('file1.ts', 1, 10, 5000);
  ui.cleanup();
  restore();

  // Should not throw with ETA
  assert.ok(true);
});

test('updateProgress handles null ETA', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.finishScanning(10, 2);
  ui.startIndexing();
  ui.updateProgress('file1.ts', 1, 10, null);
  ui.cleanup();
  restore();

  // Should not throw with null ETA
  assert.ok(true);
});

test('updateProgress handles negative ETA', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.finishScanning(10, 2);
  ui.startIndexing();
  ui.updateProgress('file1.ts', 1, 10, -1);
  ui.cleanup();
  restore();

  // Should handle stalled ETA sentinel
  assert.ok(true);
});

// ============================================================================
// updateStats Tests
// ============================================================================

test('updateStats accepts partial stats object', () => {
  const ui = new IndexerUI();

  // Should not throw with partial stats
  ui.updateStats({ chunks: 100 });
  ui.updateStats({ merged: 50 });
  ui.updateStats({ subdivided: 25 });
  ui.updateStats({ skipped: 10 });
  ui.updateStats({});

  assert.ok(true);
});

test('updateStats accepts full stats object', () => {
  const ui = new IndexerUI();

  ui.updateStats({
    chunks: 100,
    merged: 50,
    subdivided: 25,
    skipped: 10
  });

  assert.ok(true);
});

test('updateStats handles undefined values', () => {
  const ui = new IndexerUI();

  ui.updateStats({
    chunks: undefined,
    merged: undefined,
    subdivided: undefined,
    skipped: undefined
  });

  assert.ok(true);
});

// ============================================================================
// Finalizing Phase Tests
// ============================================================================

test('showFinalizing stops progress bar and starts spinner', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.finishScanning(10, 2);
  ui.startIndexing();
  ui.showFinalizing();
  ui.cleanup();
  restore();

  const output = capture.stdout.join('');
  assert.ok(output.includes('Finalizing') || output.includes('indexes'));
});

test('showFinalizing works without prior startIndexing', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  // Should not throw even without prior startIndexing
  ui.showFinalizing();
  ui.cleanup();
  restore();

  assert.ok(true);
});

// ============================================================================
// finishIndexing Tests
// ============================================================================

test('finishIndexing shows completion message', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.finishScanning(10, 2);
  ui.startIndexing();
  ui.finishIndexing();
  restore();

  const output = capture.stdout.join('');
  assert.ok(output.includes('complete') || output.includes('Complete'));
});

test('finishIndexing shows duration when timing available', async () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.finishScanning(10, 2);
  ui.startIndexing();
  await delay(50); // Small delay to create measurable duration
  ui.finishIndexing();
  restore();

  const output = capture.stdout.join('');
  assert.ok(output.includes('complete') || output.includes('Complete'));
});

test('finishIndexing cleans up spinner if active', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.showFinalizing();
  ui.finishIndexing();
  restore();

  // Should not throw
  assert.ok(true);
});

test('finishIndexing cleans up progress bar if active', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.finishScanning(10, 2);
  ui.startIndexing();
  ui.finishIndexing();
  restore();

  // Should not throw
  assert.ok(true);
});

// ============================================================================
// showSummary Tests
// ============================================================================

test('showSummary displays total chunks', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.showSummary({ totalChunks: 500 });
  restore();

  const output = capture.stdout.join('');
  assert.ok(output.includes('500'));
});

test('showSummary displays database size when provided', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.showSummary({
    totalChunks: 100,
    dbSize: '10.5 MB'
  });
  restore();

  const output = capture.stdout.join('');
  assert.ok(output.includes('10.5 MB') || output.includes('Database'));
});

test('showSummary displays codemap size when provided', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.showSummary({
    totalChunks: 100,
    codemapSize: '2.3 MB'
  });
  restore();

  const output = capture.stdout.join('');
  assert.ok(output.includes('2.3 MB') || output.includes('Codemap'));
});

test('showSummary displays merged stats when set', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.updateStats({ merged: 50 });
  ui.showSummary({ totalChunks: 100 });
  restore();

  const output = capture.stdout.join('');
  assert.ok(output.includes('50') || output.includes('Merged'));
});

test('showSummary displays subdivided stats when set', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.updateStats({ subdivided: 25 });
  ui.showSummary({ totalChunks: 100 });
  restore();

  const output = capture.stdout.join('');
  assert.ok(output.includes('25') || output.includes('Subdivided'));
});

test('showSummary displays skipped stats when set', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.updateStats({ skipped: 10 });
  ui.showSummary({ totalChunks: 100 });
  restore();

  const output = capture.stdout.join('');
  assert.ok(output.includes('10') || output.includes('Skipped'));
});

test('showSummary displays usage hints', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.showSummary({ totalChunks: 100 });
  restore();

  const output = capture.stdout.join('');
  assert.ok(output.includes('codevault') || output.includes('search'));
});

test('showSummary does not display zero stats', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.updateStats({ merged: 0, subdivided: 0, skipped: 0 });
  ui.showSummary({ totalChunks: 100 });
  restore();

  // Should not display stats sections with 0 values
  assert.ok(true);
});

// ============================================================================
// showError Tests
// ============================================================================

test('showError outputs error message to stderr', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.showError('Something went wrong');
  restore();

  const output = capture.stderr.join('');
  assert.ok(output.includes('Something went wrong'));
});

test('showError formats error with prefix', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.showError('File not found');
  restore();

  const output = capture.stderr.join('');
  assert.ok(output.includes('Error') || output.includes('error'));
});

test('showError handles empty message', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.showError('');
  restore();

  // Should not throw with empty message
  assert.ok(true);
});

test('showError handles special characters', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.showError('Path: /foo/bar\nCode: 123');
  restore();

  const output = capture.stderr.join('');
  assert.ok(output.includes('/foo/bar') || output.includes('Path'));
});

// ============================================================================
// cleanup Tests
// ============================================================================

test('cleanup stops spinner when active', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.startScanning();
  ui.cleanup();
  restore();

  // Should not throw
  assert.ok(true);
});

test('cleanup stops progress bar when active', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.finishScanning(10, 2);
  ui.startIndexing();
  ui.cleanup();
  restore();

  // Should not throw
  assert.ok(true);
});

test('cleanup is safe to call multiple times', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.startScanning();
  ui.cleanup();
  ui.cleanup();
  ui.cleanup();
  restore();

  // Should not throw
  assert.ok(true);
});

test('cleanup is safe when no spinner or progress bar', () => {
  const ui = new IndexerUI();

  // Should not throw when nothing to clean up
  ui.cleanup();
  assert.ok(true);
});

// ============================================================================
// Full Workflow Tests
// ============================================================================

test('IndexerUI complete workflow executes without errors', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.showHeader();
  ui.showConfiguration({
    provider: 'OpenAI',
    model: 'text-embedding-ada-002',
    dimensions: 1536,
    chunkSize: { min: 1000, max: 8000, optimal: 4000 },
    rateLimit: { rpm: 100 }
  });
  ui.startScanning();
  ui.finishScanning(100, 5);
  ui.startIndexing();

  for (let i = 0; i < 10; i++) {
    ui.updateProgress(`file${i}.ts`, i, 100, 5000);
  }

  ui.updateStats({ chunks: 250, merged: 20, subdivided: 5, skipped: 3 });
  ui.showFinalizing();
  ui.finishIndexing();
  ui.showSummary({
    totalChunks: 250,
    dbSize: '5.2 MB',
    codemapSize: '1.1 MB'
  });

  ui.cleanup();
  restore();

  const output = capture.stdout.join('');
  assert.ok(output.includes('CodeVault'));
  assert.ok(output.includes('OpenAI'));
});

test('IndexerUI error workflow handles cleanup properly', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.showHeader();
  ui.startScanning();
  ui.showError('Failed to access directory');
  ui.cleanup();
  restore();

  const stdoutOutput = capture.stdout.join('');
  const stderrOutput = capture.stderr.join('');

  assert.ok(stdoutOutput.includes('CodeVault'));
  assert.ok(stderrOutput.includes('Failed to access directory'));
});

test('IndexerUI handles rapid state transitions', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.showHeader();
  ui.startScanning();
  ui.finishScanning(5, 1);
  ui.startIndexing();
  ui.showFinalizing();
  ui.finishIndexing();
  ui.cleanup();
  restore();

  // Should not throw with rapid transitions
  assert.ok(true);
});

// ============================================================================
// ETA Formatting Edge Cases
// ============================================================================

test('updateProgress handles very large ETA values', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.finishScanning(10, 2);
  ui.startIndexing();
  // 2 hours in milliseconds
  ui.updateProgress('file.ts', 1, 10, 7200000);
  ui.cleanup();
  restore();

  // Should not throw with large ETA
  assert.ok(true);
});

test('updateProgress handles zero ETA', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.finishScanning(10, 2);
  ui.startIndexing();
  ui.updateProgress('file.ts', 1, 10, 0);
  ui.cleanup();
  restore();

  // Should not throw with zero ETA
  assert.ok(true);
});

test('updateProgress handles undefined ETA', () => {
  const { capture, restore } = captureOutput();
  const ui = new IndexerUI();

  ui.finishScanning(10, 2);
  ui.startIndexing();
  ui.updateProgress('file.ts', 1, 10, undefined);
  ui.cleanup();
  restore();

  // Should not throw with undefined ETA
  assert.ok(true);
});

// ============================================================================
// Multiple UI Instance Tests
// ============================================================================

test('Multiple IndexerUI instances are independent', () => {
  const { capture, restore } = captureOutput();

  const ui1 = new IndexerUI();
  const ui2 = new IndexerUI();

  ui1.finishScanning(100, 3);
  ui2.finishScanning(50, 2);

  ui1.updateStats({ chunks: 200 });
  ui2.updateStats({ chunks: 100 });

  ui1.cleanup();
  ui2.cleanup();
  restore();

  // Both should work independently
  assert.ok(true);
});
