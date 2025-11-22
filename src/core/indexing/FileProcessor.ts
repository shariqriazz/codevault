import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { LANG_RULES } from '../../languages/rules.js';
import { computeFastHash } from '../../indexer/merkle.js';
import { ChunkPipeline } from './chunk-pipeline.js';
import type { IndexContextData } from './IndexContext.js';
import type { IndexState } from './IndexState.js';
import { normalizeChunkMetadata, type CodemapChunk } from '../../types/codemap.js';
import { writeChunkToDisk, removeChunkArtifacts, type EncryptionPreference } from '../../storage/encrypted-chunks.js';
import { PersistManager } from './PersistManager.js';
import type { CodevaultMetadata, ImportantVariable } from '../metadata.js';
import type { SymbolMetadata } from '../../symbols/extract.js';

/**
 * FileProcessor handles the processing of individual files:
 * - Parsing and chunking
 * - Change detection via merkle tree
 * - Embedding and storage
 * - Fallback handling on errors
 */
export class FileProcessor {
  private chunkPipeline = new ChunkPipeline();

  private isCodemapChunk(value: unknown): value is CodemapChunk {
    return Boolean(
      value &&
      typeof value === 'object' &&
      'file' in (value as Record<string, unknown>) &&
      typeof (value as Record<string, unknown>).file === 'string'
    );
  }

  constructor(
    private context: IndexContextData,
    private state: IndexState,
    private onProgress: ((event: { type: string; file?: string; symbol?: string; chunkId?: string; success?: boolean; enqueuedChunks?: number }) => void) | null,
    private persistManager: PersistManager
  ) {}

  /**
   * Process a single file
   */
  async processFile(rel: string): Promise<void> {
    const abs = path.join(this.context.repo, rel);
    const ext = path.extname(rel).toLowerCase();
    const rule = LANG_RULES[ext];

    if (!rule) return;

    const existingChunksOriginal = new Map<string, CodemapChunk>();
    for (const [id, metadata] of Object.entries(this.state.codemap)) {
        if (this.isCodemapChunk(metadata) && metadata.file === rel) {
          existingChunksOriginal.set(id, metadata);
        }
      }
    const existingChunks = new Map(
      Array.from(existingChunksOriginal.entries()).map(([id, metadata]) => [
        id,
        {
          id,
          file_path: metadata.file,
          symbol: metadata.symbol || ''
        }
      ])
    );
    const staleChunkIds = new Set(existingChunks.keys());
    const chunkMerkleHashes: string[] = [];
    let fileHash: string | null = null;
    let success = false;
    let enqueuedChunks = 0;

    try {
      const source = await fs.promises.readFile(abs, 'utf8');
      fileHash = await computeFastHash(source);

      // Skip if file hasn't changed
      const previousMerkle = this.context.merkle[rel];
      if (previousMerkle && previousMerkle.shaFile === fileHash) {
        success = true;
        if (this.onProgress) {
          this.onProgress({ type: 'file_enqueued', file: rel, enqueuedChunks: 0, success: true });
        }
        return;
      }

      // Collect and group nodes
      const collectedNodes = this.chunkPipeline.collectNodesForFile(source, rule);
      const nodeGroups = await this.chunkPipeline.groupNodes(
        collectedNodes,
        source,
        this.context.modelProfile,
        rule
      );

      // Process groups
      await this.chunkPipeline.processGroups(
        nodeGroups,
        source,
        rule,
        this.context.limits,
        this.context.modelProfile,
        rel,
        { staleChunkIds, existingChunks },
        chunkMerkleHashes,
        this.onProgress,
        async (params) => {
          await this.embedAndStore(params);
          enqueuedChunks++;
        },
        this.state.chunkingStats
      );

      // Delete stale chunks
      if (staleChunkIds.size > 0) {
        await this.deleteChunks(Array.from(staleChunkIds), existingChunksOriginal);
        this.state.markIndexMutated();
        this.persistManager.scheduleCodemapSave();
      }

      // Update merkle tree
      if (fileHash) {
        this.state.updatedMerkle[rel] = {
          shaFile: fileHash,
          chunkShas: chunkMerkleHashes
        };
        this.state.markMerkleDirty();
        this.persistManager.scheduleMerkleSave();
      }
      success = true;
    } catch (error) {
      this.state.addError({
        type: 'processing_error',
        file: rel,
        error: (error as Error).message
      });

      // Try fallback processing
      await this.tryFallbackProcessing(rel, abs, rule, existingChunksOriginal, staleChunkIds, chunkMerkleHashes);
      success = true;
    } finally {
      if (this.onProgress) {
        this.onProgress({ type: 'file_enqueued', file: rel, enqueuedChunks, success });
      }
      if (this.onProgress) {
        this.onProgress({ type: 'file_completed', file: rel, success });
      }
    }
  }

  /**
   * Fallback processing when normal processing fails
   */
  private async tryFallbackProcessing(
    rel: string,
    abs: string,
    rule: { lang: string } | null | undefined,
    existingChunks: Map<string, CodemapChunk>,
    staleChunkIds: Set<string>,
    chunkMerkleHashes: string[]
  ): Promise<void> {
    try {
      if (!fs.existsSync(abs)) {
        return;
      }

      if (!rule) {
        return;
      }

      const source = await fs.promises.readFile(abs, 'utf8');
      const fallbackSymbol = path.basename(rel) || rel;
      const sha = crypto.createHash('sha1').update(source).digest('hex');
      const chunkId = `${rel}:fallback:${sha.substring(0, 8)}`;
      const chunkMerkleHash = await computeFastHash(source);

      const fallbackMetadata = { tags: [], intent: null, description: null };
      const contextInfo = {
        nodeType: 'file',
        startLine: 1,
        endLine: source.split('\n').length,
        codeLength: source.length,
        hasDocumentation: false,
        variableCount: 0
      };

      await this.embedAndStore({
        code: source,
        enhancedEmbeddingText: source,
        chunkId,
        sha,
        lang: rule.lang,
        rel,
        symbol: fallbackSymbol,
        chunkType: 'file',
        codevaultMetadata: fallbackMetadata,
        importantVariables: [],
        docComments: null,
        contextInfo,
        symbolData: {
          signature: `${fallbackSymbol}()`,
          parameters: [],
          returnType: null,
          calls: [],
          keywords: []
        }
      });

      this.state.incrementProcessedChunks();
      this.state.markIndexMutated();
      this.persistManager.scheduleCodemapSave();

      if (this.onProgress) {
        this.onProgress({ type: 'chunk_processed', file: rel, symbol: fallbackSymbol, chunkId });
      }

      staleChunkIds.delete(chunkId);
      if (staleChunkIds.size > 0) {
        await this.deleteChunks(Array.from(staleChunkIds), existingChunks);
        this.state.markIndexMutated();
        this.persistManager.scheduleCodemapSave();
      }

      chunkMerkleHashes.length = 0;
      chunkMerkleHashes.push(chunkMerkleHash);

      this.state.updatedMerkle[rel] = {
        shaFile: chunkMerkleHash,
        chunkShas: [...chunkMerkleHashes]
      };
      this.state.markMerkleDirty();
      this.persistManager.scheduleMerkleSave();
    } catch (fallbackError) {
      this.state.addError({
        type: 'fallback_error',
        file: rel,
        error: (fallbackError as Error).message
      });
    }
  }

  /**
   * Embed and store a chunk
   */
  private async embedAndStore(params: {
    code: string;
    enhancedEmbeddingText: string;
    chunkId: string;
    sha: string;
    lang: string;
    rel: string;
    symbol: string;
    chunkType: string;
    codevaultMetadata: CodevaultMetadata;
    importantVariables: ImportantVariable[];
    docComments: string | null;
    contextInfo: Record<string, unknown>;
    symbolData: SymbolMetadata;
  }): Promise<void> {
    try {
      if (!this.context.batchProcessor) {
        throw new Error('Batch processor not initialized');
      }

      await this.context.batchProcessor.addChunk({
        chunkId: params.chunkId,
        enhancedEmbeddingText: params.enhancedEmbeddingText,
        params: {
          code: params.code,
          sha: params.sha,
          lang: params.lang,
          rel: params.rel,
          symbol: params.symbol,
          chunkType: params.chunkType,
          codevaultMetadata: params.codevaultMetadata,
          importantVariables: params.importantVariables,
          docComments: params.docComments,
          contextInfo: params.contextInfo
        }
      });

      this.state.markIndexMutated();
      this.persistManager.scheduleCodemapSave();

      await fs.promises.mkdir(this.context.chunkDir, { recursive: true });
      const writeResult = await writeChunkToDisk({
        chunkDir: this.context.chunkDir,
        sha: params.sha,
        code: params.code,
        encryption: this.context.encryptionPreference as EncryptionPreference | undefined
      });

      const previousMetadata = this.state.codemap[params.chunkId];
      this.state.codemap[params.chunkId] = normalizeChunkMetadata({
        file: params.rel,
        symbol: params.symbol,
        sha: params.sha,
        lang: params.lang,
        chunkType: params.chunkType,
        provider: this.context.providerInstance.getName(),
        dimensions: this.context.providerInstance.getDimensions(),
        hasCodevaultTags: Array.isArray(params.codevaultMetadata.tags) && params.codevaultMetadata.tags.length > 0,
        hasIntent: !!params.codevaultMetadata.intent,
        hasDocumentation: !!params.docComments,
        variableCount: Array.isArray(params.importantVariables) ? params.importantVariables.length : 0,
        encrypted: !!(writeResult && writeResult.encrypted),
        symbol_signature: params.symbolData && params.symbolData.signature ? params.symbolData.signature : undefined,
        symbol_parameters: params.symbolData && Array.isArray(params.symbolData.parameters) ? params.symbolData.parameters : undefined,
        symbol_return: params.symbolData && params.symbolData.returnType ? params.symbolData.returnType : undefined,
        symbol_calls: params.symbolData && Array.isArray(params.symbolData.calls) ? params.symbolData.calls : undefined
      }, previousMetadata);
      this.persistManager.scheduleCodemapSave();
    } catch (error) {
      this.state.addError({
        type: 'indexing_error',
        chunkId: params.chunkId,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Delete chunks from database and file system
   */
  private async deleteChunks(chunkIds: string[], metadataLookup = new Map<string, CodemapChunk>()): Promise<void> {
    if (!Array.isArray(chunkIds) || chunkIds.length === 0) {
      return;
    }

    if (this.context.db) {
      this.context.db.deleteChunks(chunkIds);
    }

    for (const chunkId of chunkIds) {
      const metadata = metadataLookup.get(chunkId) || this.state.codemap[chunkId];
      if (metadata && metadata.sha) {
        await removeChunkArtifacts(this.context.chunkDir, metadata.sha);
      }
      delete this.state.codemap[chunkId];
    }

    if (chunkIds.length > 0) {
      this.persistManager.scheduleCodemapSave();
    }
  }

  /**
   * Remove all artifacts for a deleted file
   */
  async removeFileArtifacts(fileRel: string): Promise<void> {
    const entries: Array<[string, CodemapChunk]> = [];
    for (const [chunkId, metadata] of Object.entries(this.state.codemap)) {
      if (this.isCodemapChunk(metadata) && metadata.file === fileRel) {
        entries.push([chunkId, metadata]);
      }
    }

    if (entries.length > 0) {
      const metadataLookup = new Map(entries);
      await this.deleteChunks(entries.map(([chunkId]) => chunkId), metadataLookup);
      this.state.markIndexMutated();
      this.persistManager.scheduleCodemapSave();
    }

    // Remove from merkle tree
    const { removeMerkleEntry } = await import('../../indexer/merkle.js');
    if (removeMerkleEntry(this.state.updatedMerkle, fileRel)) {
      this.state.markMerkleDirty();
      this.persistManager.scheduleMerkleSave();
    }
  }
}
