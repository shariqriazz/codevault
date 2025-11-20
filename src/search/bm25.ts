import bm25Factory from 'wink-bm25-text-search';
import { log } from '../utils/logger.js';

const DEFAULT_FIELD = 'body';
const MIN_DOCS_FOR_CONSOLIDATION = 3;

function defaultPrep(text: string): string[] {
  if (!text) {
    return [];
  }

  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/u)
    .filter(Boolean);
}

export class BM25Index {
  private engine: ReturnType<typeof bm25Factory>;
  private documents = new Set<string>();
  private consolidated = false;

  constructor() {
    this.engine = bm25Factory();
    this.engine.defineConfig({ fldWeights: { [DEFAULT_FIELD]: 1 } });
    this.engine.definePrepTasks([defaultPrep]);
  }

  addDocument(id: string, text: string): void {
    if (!id || typeof text !== 'string' || text.trim().length === 0) {
      return;
    }

    if (this.documents.has(id)) {
      return;
    }

    this.engine.addDoc({ [DEFAULT_FIELD]: text }, id);
    this.documents.add(id);
    this.consolidated = false;
  }

  addDocuments(entries: Array<{ id: string; text: string }> = []): void {
    for (const entry of entries) {
      if (!entry) continue;
      const { id, text } = entry;
      this.addDocument(id, text);
    }
  }

  consolidate(): void {
    if (this.consolidated) {
      return;
    }

    if (this.documents.size < MIN_DOCS_FOR_CONSOLIDATION) {
      // wink-bm25-text-search throws when consolidating very small collections
      this.consolidated = true;
      return;
    }

    try {
      this.engine.consolidate();
    } catch (error) {
      log.warn('BM25 consolidation failed; skipping BM25 for this search', {
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      this.consolidated = true;
    }
  }

  search(query: string, limit = 60): Array<{ id: string; score: number }> {
    if (!query || !query.trim()) {
      return [];
    }

    if (this.documents.size < MIN_DOCS_FOR_CONSOLIDATION) {
      return [];
    }

    this.consolidate();
    const results = this.engine.search(query, limit);
    return results.map(([id, score]: [string, number]) => ({ id, score }));
  }
}
