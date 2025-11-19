import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createEmbeddingProvider, getModelProfile, getSizeLimits, type EmbeddingProvider } from '../providers/index.js';
import { BATCH_SIZE } from '../providers/base.js';
import { getTokenCountStats } from '../chunking/token-counter.js';
import { readCodemap, writeCodemap } from '../codemap/io.js';
import { normalizeChunkMetadata, type Codemap } from '../types/codemap.js';
import { LANG_RULES } from '../languages/rules.js';
import { groupNodesForChunking } from '../chunking/file-grouper.js';
import {
  cloneMerkle,
  computeFastHash,
  loadMerkle,
  normalizeToProjectPath,
  removeMerkleEntry,
  saveMerkle,
  type MerkleTree
} from '../indexer/merkle.js';
import { attachSymbolGraphToCodemap } from '../symbols/graph.js';
import {
  resolveEncryptionPreference,
  writeChunkToDisk,
  removeChunkArtifacts
} from '../storage/encrypted-chunks.js';
import { Database, initDatabase } from '../database/db.js';
import { BatchEmbeddingProcessor } from './batch-indexer.js';
import type { IndexProjectOptions, IndexProjectResult, ChunkingStats } from './types.js';
import { logger } from '../utils/logger.js';
import { FileScanner } from './indexing/file-scanner.js';
import { resolveProviderContext } from '../config/resolver.js';
import { ChunkPipeline } from './indexing/chunk-pipeline.js';


export class IndexerEngine {
  private db: Database | null = null;
  private codemap: Codemap = {};
  private merkle: MerkleTree = {};
  private updatedMerkle: MerkleTree = {};
  private merkleDirty = false;
  private indexMutated = false;
  private processedChunks = 0;
  private errors: any[] = [];
  private chunkingStats: ChunkingStats = {
    totalNodes: 0,
    skippedSmall: 0,
    subdivided: 0,
    statementFallback: 0,
    normalChunks: 0,
    mergedSmall: 0
  };
  private encryptionPreference: any;
  private embeddingProvider: EmbeddingProvider | null = null;
  private batchProcessor: BatchEmbeddingProcessor | null = null;
  private chunkDir: string = '';

  constructor(private options: IndexProjectOptions = {}) {}

  public async index(): Promise<IndexProjectResult> {
    const {
      repoPath = '.',
      provider = 'auto',
      onProgress = null,
      changedFiles = null,
      deletedFiles = [],
      embeddingProviderOverride = null,
      encryptMode = undefined
    } = this.options;

    const repo = path.resolve(repoPath);

    try {
      await fs.promises.access(repo);
    } catch {
      throw new Error(`Directory ${repo} does not exist`);
    }

    try {
      const normalizedChanged = Array.isArray(changedFiles)
        ? Array.from(new Set(
            changedFiles
              .map(file => normalizeToProjectPath(repo, file))
              .filter(Boolean) as string[]
          ))
        : null;
      const providerContext = resolveProviderContext(repo);

      const normalizedDeleted = Array.from(new Set(
        (Array.isArray(deletedFiles) ? deletedFiles : [])
          .map(file => normalizeToProjectPath(repo, file))
          .filter(Boolean) as string[]
      ));

      const deletedSet = new Set(normalizedDeleted);
      
      const scanner = new FileScanner();
      const { files, toDelete } = await scanner.scan(repo, normalizedChanged);
      
      for (const file of toDelete) {
        deletedSet.add(file);
      }
      const isPartialUpdate = normalizedChanged !== null;

      this.embeddingProvider = embeddingProviderOverride || createEmbeddingProvider(provider, providerContext.embedding);

      if (!embeddingProviderOverride && this.embeddingProvider.init) {
        await this.embeddingProvider.init();
      }

      const providerName = this.embeddingProvider.getName();
      const modelName = this.embeddingProvider.getModelName ? this.embeddingProvider.getModelName() : null;
      const modelProfile = await getModelProfile(providerName, modelName || providerName);
      const limits = getSizeLimits(modelProfile);
      
      if (!process.env.CODEVAULT_QUIET) {
        logger.info(`Chunking Configuration`, {
          provider: providerName,
          model: modelName,
          dimensions: this.embeddingProvider.getDimensions(),
          mode: limits.unit
        });
      }

      await initDatabase(this.embeddingProvider.getDimensions(), repo);

      const codemapPath = path.join(repo, 'codevault.codemap.json');
      this.chunkDir = path.join(repo, '.codevault/chunks');
      const dbPath = path.join(repo, '.codevault/codevault.db');
      
      await this.checkDimensionMismatch(dbPath, this.embeddingProvider);

      this.encryptionPreference = resolveEncryptionPreference({ mode: encryptMode, logger: console }); // keeping console for logger shim in encrypted-chunks
      this.codemap = readCodemap(codemapPath);

      this.merkle = loadMerkle(repo);
      this.updatedMerkle = cloneMerkle(this.merkle);

      this.db = new Database(dbPath);
      
      // Create batch processor for efficient embedding generation
      this.batchProcessor = new BatchEmbeddingProcessor(this.embeddingProvider, this.db, BATCH_SIZE);
      const chunkPipeline = new ChunkPipeline();

      for (const rel of files) {
        deletedSet.delete(rel);

        const abs = path.join(repo, rel);
        const ext = path.extname(rel).toLowerCase();
        const rule = LANG_RULES[ext];

        if (!rule) continue;

        const existingChunks = new Map(
          Object.entries(this.codemap)
            .filter(([, metadata]) => metadata && metadata.file === rel) as [string, any][]
        );
        const staleChunkIds = new Set(existingChunks.keys());
        const chunkMerkleHashes: string[] = [];
        let fileHash: string | null = null;

        try {
          const source = await fs.promises.readFile(abs, 'utf8');
          fileHash = await computeFastHash(source);

          const previousMerkle = this.merkle[rel];
          if (previousMerkle && previousMerkle.shaFile === fileHash) {
            continue;
          }

          const collectedNodes = await chunkPipeline.collectNodesForFile(source, rule);

          const nodeGroups = await groupNodesForChunking(
            collectedNodes,
            source,
            modelProfile,
            rule
          );

          const existingChunks = new Map(
            Object.entries(this.codemap)
              .filter(([, metadata]) => metadata && metadata.file === rel) as [string, any][]
          );
          const staleChunkIds = new Set(existingChunks.keys());
          const chunkMerkleHashes: string[] = [];

          await chunkPipeline.processGroups(
            nodeGroups,
            source,
            rule,
            limits,
            modelProfile,
            rel,
            { staleChunkIds, existingChunks },
            chunkMerkleHashes,
            onProgress,
            (params) => this.embedAndStore(params),
            this.chunkingStats
          );

          if (staleChunkIds.size > 0) {
            await this.deleteChunks(Array.from(staleChunkIds), existingChunks);
            this.indexMutated = true;
          }

          if (fileHash) {
            this.updatedMerkle[rel] = {
              shaFile: fileHash,
              chunkShas: chunkMerkleHashes
            };
            this.merkleDirty = true;
          }
        } catch (error) {
          this.errors.push({ type: 'processing_error', file: rel, error: (error as Error).message });

          // Fallback logic
          try {
             if (!fs.existsSync(abs)) {
              continue;
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
                calls: []
              }
            });

            this.processedChunks++;
            this.indexMutated = true;

            if (onProgress) {
              onProgress({ type: 'chunk_processed', file: rel, symbol: fallbackSymbol, chunkId });
            }

            staleChunkIds.delete(chunkId);
            if (staleChunkIds.size > 0) {
              await this.deleteChunks(Array.from(staleChunkIds), existingChunks);
              this.indexMutated = true;
            }

            chunkMerkleHashes.length = 0;
            chunkMerkleHashes.push(chunkMerkleHash);
            fileHash = chunkMerkleHash;
            this.updatedMerkle[rel] = {
              shaFile: chunkMerkleHash,
              chunkShas: [...chunkMerkleHashes]
            };
            this.merkleDirty = true;

          } catch (fallbackError) {
            this.errors.push({ type: 'fallback_error', file: rel, error: (fallbackError as Error).message });
          }
        }
      }

      for (const fileRel of deletedSet) {
        await this.removeFileArtifacts(fileRel);
      }

      if (!isPartialUpdate) {
        const existingFilesSet = new Set(files);
        for (const fileRel of Object.keys(this.merkle)) {
          if (!existingFilesSet.has(fileRel)) {
            await this.removeFileArtifacts(fileRel);
          }
        }
      }

      if (onProgress) {
        onProgress({ type: 'finalizing' });
      }
      
      if (this.merkleDirty) {
        saveMerkle(repo, this.updatedMerkle);
      }

      attachSymbolGraphToCodemap(this.codemap);
      this.codemap = writeCodemap(codemapPath, this.codemap);

      const tokenStats = getTokenCountStats();
      
      if (!process.env.CODEVAULT_QUIET) {
          logger.info('Chunking Statistics', { 
              stats: this.chunkingStats,
              processedChunks: this.processedChunks,
              totalChunks: Object.keys(this.codemap).length
          });
      }

      return {
        success: true,
        processedChunks: this.processedChunks,
        totalChunks: Object.keys(this.codemap).length,
        provider: this.embeddingProvider.getName(),
        errors: this.errors,
        chunkingStats: this.chunkingStats,
        tokenStats: modelProfile.useTokens ? tokenStats : undefined
      };
    } finally {
      // Ensure resources are cleaned up even on errors
      try {
        await this.batchProcessor?.flush();
      } catch (error) {
        this.errors.push({ type: 'finalize_error', error: (error as Error).message });
      }

      try {
        if (this.db) {
          this.db.close();
          this.db = null;
        }
      } catch (error) {
        this.errors.push({ type: 'db_close_error', error: (error as Error).message });
      }
    }
  }

  private async embedAndStore(params: {
    code: string;
    enhancedEmbeddingText: string;
    chunkId: string;
    sha: string;
    lang: string;
    rel: string;
    symbol: string;
    chunkType: string;
    codevaultMetadata: any;
    importantVariables: any[];
    docComments: string | null;
    contextInfo: any;
    symbolData: any;
  }): Promise<void> {
    try {
      if (!this.batchProcessor) throw new Error('Batch processor not initialized');

      await this.batchProcessor.addChunk({
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

      this.indexMutated = true;

      await fs.promises.mkdir(this.chunkDir, { recursive: true });
      const writeResult = writeChunkToDisk({
        chunkDir: this.chunkDir,
        sha: params.sha,
        code: params.code,
        encryption: this.encryptionPreference
      });

      const previousMetadata = this.codemap[params.chunkId];
      this.codemap[params.chunkId] = normalizeChunkMetadata({
        file: params.rel,
        symbol: params.symbol,
        sha: params.sha,
        lang: params.lang,
        chunkType: params.chunkType,
        provider: this.embeddingProvider?.getName() || 'unknown',
        dimensions: this.embeddingProvider?.getDimensions() || 0,
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

    } catch (error) {
      this.errors.push({ type: 'indexing_error', chunkId: params.chunkId, error: (error as Error).message });
      throw error;
    }
  }

  private async deleteChunks(chunkIds: string[], metadataLookup = new Map<string, any>()): Promise<void> {
    if (!Array.isArray(chunkIds) || chunkIds.length === 0) {
      return;
    }

    if (this.db) {
        await this.db.deleteChunks(chunkIds);
    }

    for (const chunkId of chunkIds) {
      const metadata = metadataLookup.get(chunkId) || this.codemap[chunkId];
      if (metadata && metadata.sha) {
        removeChunkArtifacts(this.chunkDir, metadata.sha);
      }
      delete this.codemap[chunkId];
    }
  }

  private async removeFileArtifacts(fileRel: string): Promise<void> {
    const entries = Object.entries(this.codemap)
      .filter(([, metadata]) => metadata && metadata.file === fileRel);

    if (entries.length > 0) {
      const metadataLookup = new Map(entries as [string, any][]);
      await this.deleteChunks(entries.map(([chunkId]) => chunkId), metadataLookup);
      this.indexMutated = true;
    }

    if (removeMerkleEntry(this.updatedMerkle, fileRel)) {
      this.merkleDirty = true;
    }
  }

  private async checkDimensionMismatch(dbPath: string, embeddingProvider: any): Promise<void> {
    try {
        await fs.promises.access(dbPath);
    } catch {
        return;
    }
    
    const db = new Database(dbPath);
    try {
      const existingDimensions = await db.getExistingDimensions();
      
      if (existingDimensions.length > 0) {
        const currentProvider = embeddingProvider.getName();
        const currentDimensions = embeddingProvider.getDimensions();
        
        const hasMismatch = existingDimensions.some(
          row => row.embedding_provider !== currentProvider ||
                 row.embedding_dimensions !== currentDimensions
        );
        
        if (hasMismatch) {
          logger.warn('Dimension/Provider Mismatch Detected!', {
              existing: existingDimensions,
              current: { provider: currentProvider, dimensions: currentDimensions },
              recommendation: 'Full re-index recommended'
          });
          
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (error) {
      // Ignore migration check errors
    } finally {
      db.close();
    }
  }
}
