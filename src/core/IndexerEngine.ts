import crypto from 'crypto';
import fg from 'fast-glob';
import fs from 'fs';
import path from 'path';
import Parser from 'tree-sitter';
import { createEmbeddingProvider, getModelProfile, getSizeLimits, type EmbeddingProvider } from '../providers/index.js';
import { BATCH_SIZE } from '../providers/base.js';
import { analyzeNodeForChunking, batchAnalyzeNodes, yieldStatementChunks } from '../chunking/semantic-chunker.js';
import { groupNodesForChunking, createCombinedChunk } from '../chunking/file-grouper.js';
import { getTokenCountStats } from '../chunking/token-counter.js';
import { readCodemap, writeCodemap } from '../codemap/io.js';
import { normalizeChunkMetadata, type Codemap } from '../types/codemap.js';
import { LANG_RULES, getSupportedLanguageExtensions } from '../languages/rules.js';
import {
  cloneMerkle,
  computeFastHash,
  loadMerkle,
  normalizeToProjectPath,
  removeMerkleEntry,
  saveMerkle,
  type MerkleTree
} from '../indexer/merkle.js';
import { extractSymbolMetadata } from '../symbols/extract.js';
import { attachSymbolGraphToCodemap } from '../symbols/graph.js';
import {
  resolveEncryptionPreference,
  writeChunkToDisk,
  removeChunkArtifacts
} from '../storage/encrypted-chunks.js';
import { extractSymbolName } from './symbol-extractor.js';
import {
  extractCodevaultMetadata,
  extractSemanticTags,
  extractImportantVariables,
  extractDocComments,
  generateEnhancedEmbeddingText
} from './metadata.js';
import { Database, initDatabase } from '../database/db.js';
import { BatchEmbeddingProcessor } from './batch-indexer.js';
import type { IndexProjectOptions, IndexProjectResult, ChunkingStats } from './types.js';
import { DEFAULT_SCAN_IGNORES } from '../utils/scan-patterns.js';
import { SIZE_THRESHOLD, CHUNK_SIZE } from '../config/constants.js';
import { logger } from '../utils/logger.js';

import type { TreeSitterNode } from '../types/ast.js';

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
  private processedNodes = new Set<number>();

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

    const normalizedChanged = Array.isArray(changedFiles)
      ? Array.from(new Set(
          changedFiles
            .map(file => normalizeToProjectPath(repo, file))
            .filter(Boolean) as string[]
        ))
      : null;

    const normalizedDeleted = Array.from(new Set(
      (Array.isArray(deletedFiles) ? deletedFiles : [])
        .map(file => normalizeToProjectPath(repo, file))
        .filter(Boolean) as string[]
    ));

    const deletedSet = new Set(normalizedDeleted);
    
    const { files, toDelete } = await this.gatherFiles(repo, normalizedChanged);
    
    for (const file of toDelete) {
      deletedSet.add(file);
    }
    const isPartialUpdate = normalizedChanged !== null;

    this.embeddingProvider = embeddingProviderOverride || createEmbeddingProvider(provider);

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

    const parser = new Parser();
    
    this.db = new Database(dbPath);
    
    // Create batch processor for efficient embedding generation
    this.batchProcessor = new BatchEmbeddingProcessor(this.embeddingProvider, this.db, BATCH_SIZE);

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

        let tree;
        try {
          parser.setLanguage(rule.ts);
          
          if (source.length > SIZE_THRESHOLD) {
            tree = parser.parse((index: number) => {
              if (index < source.length) {
                return source.slice(index, Math.min(index + CHUNK_SIZE, source.length));
              }
              return null;
            });
          } else {
            tree = parser.parse(source);
          }
          
          if (!tree || !tree.rootNode) {
            throw new Error('Failed to create syntax tree');
          }
        } catch (parseError) {
          throw parseError;
        }

        const collectedNodes: TreeSitterNode[] = [];
        const collectNodes = (node: TreeSitterNode) => {
           if (node.type === 'export_statement') {
            let hasDeclaration = false;
            for (let i = 0; i < node.childCount; i++) {
              const child = node.child(i);
              if (child && ['function_declaration', 'class_declaration', 'method_definition'].includes(child.type)) {
                hasDeclaration = true;
                break;
              }
            }
            
            if (!hasDeclaration && rule.nodeTypes.includes(node.type)) {
              collectedNodes.push(node);
              return;
            }
            
            if (hasDeclaration) {
              for (let i = 0; i < node.childCount; i++) {
                const child = node.child(i);
                if (child) {
                  collectNodes(child);
                }
              }
              return;
            }
          }
          
          if (rule.nodeTypes.includes(node.type)) {
            collectedNodes.push(node);
          }
          for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child) {
              collectNodes(child);
            }
          }
        };
        
        collectNodes(tree.rootNode);
        
        const nodeGroups = await groupNodesForChunking(
          collectedNodes,
          source,
          modelProfile,
          rule
        );
        
        this.processedNodes = new Set<number>();

        for (const nodeGroup of nodeGroups) {
           if (nodeGroup.nodes.length === 1) {
            await this.yieldChunk(nodeGroup.nodes[0], source, rule, limits, modelProfile, rel, staleChunkIds, chunkMerkleHashes, onProgress);
          } else {
            const combinedChunk = createCombinedChunk(nodeGroup, source);
            if (combinedChunk) {
              this.chunkingStats.totalNodes += nodeGroup.nodes.length;
              this.chunkingStats.fileGrouped = (this.chunkingStats.fileGrouped || 0) + 1;
              this.chunkingStats.functionsGrouped = (this.chunkingStats.functionsGrouped || 0) + nodeGroup.nodes.length;
              
              await this.processChunk(
                combinedChunk.node,
                combinedChunk.code,
                `group_${nodeGroup.nodes.length}funcs`,
                null,
                source,
                rel,
                rule,
                staleChunkIds,
                chunkMerkleHashes,
                onProgress
              );
            }
          }
        }

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
    
    await this.batchProcessor.flush();
    
    if (this.merkleDirty) {
      saveMerkle(repo, this.updatedMerkle);
    }

    this.db.close();

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
  }

  private async yieldChunk(
      node: TreeSitterNode, 
      source: string, 
      rule: any, 
      limits: any, 
      modelProfile: any, 
      rel: string,
      staleChunkIds: Set<string>,
      chunkMerkleHashes: string[],
      onProgress: any,
      parentNode: TreeSitterNode | null = null
  ): Promise<void> {
    this.chunkingStats.totalNodes++;
    
    const analysis = await analyzeNodeForChunking(node, source, rule, modelProfile);
    
    if (analysis.size < limits.min && parentNode !== null) {
      this.chunkingStats.skippedSmall++;
      return;
    }
    
    if (analysis.needsSubdivision && analysis.subdivisionCandidates.length > 0) {
      this.chunkingStats.subdivided++;
      
      const subAnalyses = await batchAnalyzeNodes(
        analysis.subdivisionCandidates,
        source,
        rule,
        modelProfile,
        true
      );
      
      const smallChunks: any[] = [];
      
      for (let i = 0; i < subAnalyses.length; i++) {
        const subAnalysis = subAnalyses[i];
        const subNode = subAnalysis.node;
        
        if (subAnalysis.size < limits.min) {
          const subCode = source.slice(subNode.startIndex, subNode.endIndex);
          smallChunks.push({
            node: subNode,
            code: subCode,
            size: subAnalysis.size
          });
          if (subNode.id !== undefined) {
            this.processedNodes.add(subNode.id);
          }
        } else {
          if (subNode.id !== undefined) {
            this.processedNodes.add(subNode.id);
          }
          await this.yieldChunk(subNode, source, rule, limits, modelProfile, rel, staleChunkIds, chunkMerkleHashes, onProgress, node);
        }
      }
      
      if (smallChunks.length > 0) {
        const totalSmallSize = smallChunks.reduce((sum: number, c: any) => sum + c.size, 0);
        
        if (totalSmallSize >= limits.min || smallChunks.length >= 3) {
          const mergedCode = smallChunks.map((c: any) => c.code).join('\n\n');
          const mergedNode: TreeSitterNode = {
            ...node,
            type: `${node.type}_merged`,
            startIndex: smallChunks[0].node.startIndex,
            endIndex: smallChunks[smallChunks.length - 1].node.endIndex
          };
          const suffix = `small_methods_${smallChunks.length}`;
          
          this.chunkingStats.mergedSmall++;
          await this.processChunk(mergedNode, mergedCode, suffix, parentNode, source, rel, rule, staleChunkIds, chunkMerkleHashes, onProgress);
        } else {
          this.chunkingStats.skippedSmall += smallChunks.length;
        }
      }
      
      return;
    } else if (analysis.size > limits.max) {
      this.chunkingStats.statementFallback++;
      const statementChunks = await yieldStatementChunks(
        node, 
        source, 
        limits.max, 
        limits.overlap, 
        modelProfile
      );
      
      for (let i = 0; i < statementChunks.length; i++) {
        const stmtChunk = statementChunks[i];
        await this.processChunk(node, stmtChunk.code, `${i + 1}`, parentNode, source, rel, rule, staleChunkIds, chunkMerkleHashes, onProgress);
      }
      return;
    }
    
    this.chunkingStats.normalChunks++;
    const code = source.slice(node.startIndex, node.endIndex);
    await this.processChunk(node, code, null, parentNode, source, rel, rule, staleChunkIds, chunkMerkleHashes, onProgress);
  }

  private async processChunk(
      node: TreeSitterNode, 
      code: string, 
      suffix: string | null, 
      parentNode: TreeSitterNode | null,
      source: string,
      rel: string,
      rule: any,
      staleChunkIds: Set<string>,
      chunkMerkleHashes: string[],
      onProgress: any
  ): Promise<void> {
    let symbol = extractSymbolName(node, source);
    if (!symbol) return;
    
    if (suffix) {
      symbol = `${symbol}_part${suffix}`;
    }

    const docComments = extractDocComments(source, node, rule);
    const codevaultMetadata = extractCodevaultMetadata(docComments);
    const automaticTags = extractSemanticTags(rel, symbol, code);
    const allTags = [...new Set([...codevaultMetadata.tags, ...automaticTags])];
    codevaultMetadata.tags = allTags;

    const importantVariables = extractImportantVariables(node, source, rule);
    const symbolData = extractSymbolMetadata({ node, source, symbol });

    const enhancedEmbeddingText = generateEnhancedEmbeddingText(
      code,
      codevaultMetadata,
      importantVariables,
      docComments
    );

    const chunkType = node.type.includes('class') ? 'class' :
      node.type.includes('method') ? 'method' : 'function';

    const contextInfo = {
      nodeType: node.type,
      startLine: source.slice(0, node.startIndex).split('\n').length,
      endLine: source.slice(0, node.endIndex).split('\n').length,
      codeLength: code.length,
      hasDocumentation: !!docComments,
      variableCount: importantVariables.length,
      isSubdivision: !!suffix,
      hasParentContext: !!parentNode
    };

    const sha = crypto.createHash('sha1').update(code).digest('hex');
    const chunkId = `${rel}:${symbol}:${sha.substring(0, 8)}`;
    const chunkMerkleHash = await computeFastHash(code);

    if (this.codemap[chunkId]?.sha === sha) {
      staleChunkIds.delete(chunkId);
      chunkMerkleHashes.push(chunkMerkleHash);
      return;
    }

    await this.embedAndStore({
      code,
      enhancedEmbeddingText,
      chunkId,
      sha,
      lang: rule.lang,
      rel,
      symbol,
      chunkType,
      codevaultMetadata,
      importantVariables,
      docComments,
      contextInfo,
      symbolData
    });
    
    staleChunkIds.delete(chunkId);
    chunkMerkleHashes.push(chunkMerkleHash);
    this.processedChunks++;

    if (onProgress) {
      onProgress({ type: 'chunk_processed', file: rel, symbol, chunkId });
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

  private async gatherFiles(repo: string, normalizedChanged: string[] | null): Promise<{ files: string[], toDelete: string[] }> {
    const languagePatterns = getSupportedLanguageExtensions().map(ext => `**/*${ext}`);
    let files: string[] = [];

    if (normalizedChanged === null) {
      files = await fg(languagePatterns, {
        cwd: repo,
        absolute: false,
        followSymbolicLinks: false,
        ignore: DEFAULT_SCAN_IGNORES,
        onlyFiles: true,
        dot: false
      });
    } else {
      files = normalizedChanged.filter(rel => {
        const ext = path.extname(rel).toLowerCase();
        return !!LANG_RULES[ext];
      });
    }

    const uniqueFiles: string[] = [];
    const toDelete: string[] = [];
    const seenFiles = new Set<string>();

    for (const rel of files) {
      if (!rel || seenFiles.has(rel)) {
        continue;
      }

      const absPath = path.join(repo, rel);
      try {
          await fs.promises.access(absPath);
          seenFiles.add(rel);
          uniqueFiles.push(rel);
      } catch {
          toDelete.push(rel);
      }
    }

    return { files: uniqueFiles, toDelete };
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
