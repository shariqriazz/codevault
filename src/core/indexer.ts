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

import type { TreeSitterNode } from '../types/ast.js';

export async function indexProject({
  repoPath = '.',
  provider = 'auto',
  onProgress = null,
  changedFiles = null,
  deletedFiles = [],
  embeddingProviderOverride = null,
  encryptMode = undefined
}: IndexProjectOptions = {}): Promise<IndexProjectResult> {
  const repo = path.resolve(repoPath);

  if (!fs.existsSync(repo)) {
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
  const languagePatterns = getSupportedLanguageExtensions().map(ext => `**/*${ext}`);
  let files: string[] = [];

  if (normalizedChanged === null) {
    files = await fg(languagePatterns, {
      cwd: repo,
      absolute: false,
      followSymbolicLinks: false,
      ignore: [
        '**/vendor/**',
        '**/node_modules/**',
        '**/.git/**',
        '**/storage/**',
        '**/dist/**',
        '**/build/**',
        '**/tmp/**',
        '**/temp/**',
        '**/.npm/**',
        '**/.yarn/**',
        '**/Library/**',
        '**/System/**',
        '**/.Trash/**',
        '**/.codevault/**',
        '**/codevault.codemap.json',
        '**/codevault.codemap.json.backup-*',
        '**/package-lock.json',
        '**/yarn.lock',
        '**/pnpm-lock.yaml',
        '**/*.json',
        '**/*.sh',
        '**/examples/**',
        '**/assets/**'
      ],
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
  const seenFiles = new Set<string>();

  for (const rel of files) {
    if (!rel || seenFiles.has(rel)) {
      continue;
    }

    const absPath = path.join(repo, rel);
    if (!fs.existsSync(absPath)) {
      deletedSet.add(rel);
      continue;
    }

    seenFiles.add(rel);
    uniqueFiles.push(rel);
  }

  files = uniqueFiles;
  const isPartialUpdate = normalizedChanged !== null;

  const embeddingProvider = embeddingProviderOverride || createEmbeddingProvider(provider);

  if (!embeddingProviderOverride && embeddingProvider.init) {
    await embeddingProvider.init();
  }

  const providerName = embeddingProvider.getName();
  const modelName = embeddingProvider.getModelName ? embeddingProvider.getModelName() : null;
  const modelProfile = await getModelProfile(providerName, modelName || providerName);
  const limits = getSizeLimits(modelProfile);
  
  if (!process.env.CODEVAULT_QUIET) {
    console.log(`\n📊 Chunking Configuration:`);
    console.log(`  Provider: ${providerName}`);
    if (modelName) console.log(`  Model: ${modelName}`);
    console.log(`  Dimensions: ${embeddingProvider.getDimensions()}`);
    console.log(`  Chunking mode: ${limits.unit}`);
    console.log(`  Optimal size: ${limits.optimal} ${limits.unit}`);
    console.log(`  Min/Max: ${limits.min}-${limits.max} ${limits.unit}`);
    console.log(`  Overlap: ${limits.overlap} ${limits.unit}`);
    console.log(`  Batch size: ${BATCH_SIZE} chunks per API call`);
    if (modelProfile.useTokens && modelProfile.tokenCounter) {
      console.log(`  ✓ Token counting enabled`);
    } else {
      console.log(`  ℹ Using character estimation (token counting unavailable)`);
    }
    
    if (embeddingProvider.rateLimiter) {
      const rateLimiterStats = embeddingProvider.rateLimiter.getStats();
      if (rateLimiterStats.isLimited) {
        console.log(`  🔒 Rate limiting: ${rateLimiterStats.rpm} requests/minute`);
      } else {
        console.log(`  ⚡ Rate limiting: disabled (local model)`);
      }
    }
    console.log('');
  }

  await initDatabase(embeddingProvider.getDimensions(), repo);

  const codemapPath = path.join(repo, 'codevault.codemap.json');
  const chunkDir = path.join(repo, '.codevault/chunks');
  const dbPath = path.join(repo, '.codevault/codevault.db');
  
  if (fs.existsSync(dbPath)) {
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
          console.log('\n⚠️  WARNING: Dimension/Provider Mismatch Detected!');
          console.log('='.repeat(60));
          console.log('Existing index:');
          existingDimensions.forEach(row => {
            console.log(`  ${row.embedding_provider} (${row.embedding_dimensions}D)`);
          });
          console.log(`Current config: ${currentProvider} (${currentDimensions}D)`);
          console.log('\nRecommendation: Full re-index for consistent results');
          console.log('='.repeat(60) + '\n');
          
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (error) {
      // Ignore migration check errors
    } finally {
      db.close();
    }
  }

  const encryptionPreference = resolveEncryptionPreference({ mode: encryptMode, logger: console });
  let codemap = readCodemap(codemapPath);

  const merkle = loadMerkle(repo);
  const updatedMerkle = cloneMerkle(merkle);
  let merkleDirty = false;
  let indexMutated = false;

  const parser = new Parser();
  let processedChunks = 0;
  const errors: any[] = [];
  
  const chunkingStats: ChunkingStats = {
    totalNodes: 0,
    skippedSmall: 0,
    subdivided: 0,
    statementFallback: 0,
    normalChunks: 0,
    mergedSmall: 0
  };

  const db = new Database(dbPath);
  
  // Create batch processor for efficient embedding generation
  const batchProcessor = new BatchEmbeddingProcessor(embeddingProvider, db, BATCH_SIZE);

  async function deleteChunks(chunkIds: string[], metadataLookup = new Map<string, any>()): Promise<void> {
    if (!Array.isArray(chunkIds) || chunkIds.length === 0) {
      return;
    }

    await db.deleteChunks(chunkIds);

    for (const chunkId of chunkIds) {
      const metadata = metadataLookup.get(chunkId) || codemap[chunkId];
      if (metadata && metadata.sha) {
        removeChunkArtifacts(chunkDir, metadata.sha);
      }
      delete codemap[chunkId];
    }
  }

  async function embedAndStore(params: {
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
      // Add to batch processor instead of immediate embedding
      await batchProcessor.addChunk({
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

      indexMutated = true;

      fs.mkdirSync(chunkDir, { recursive: true });
      const writeResult = writeChunkToDisk({
        chunkDir,
        sha: params.sha,
        code: params.code,
        encryption: encryptionPreference
      });

      const previousMetadata = codemap[params.chunkId];
      codemap[params.chunkId] = normalizeChunkMetadata({
        file: params.rel,
        symbol: params.symbol,
        sha: params.sha,
        lang: params.lang,
        chunkType: params.chunkType,
        provider: embeddingProvider.getName(),
        dimensions: embeddingProvider.getDimensions(),
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
      errors.push({ type: 'indexing_error', chunkId: params.chunkId, error: (error as Error).message });
      throw error;
    }
  }

  async function removeFileArtifacts(fileRel: string): Promise<void> {
    const entries = Object.entries(codemap)
      .filter(([, metadata]) => metadata && metadata.file === fileRel);

    if (entries.length > 0) {
      const metadataLookup = new Map(entries as [string, any][]);
      await deleteChunks(entries.map(([chunkId]) => chunkId), metadataLookup);
      indexMutated = true;
    }

    if (removeMerkleEntry(updatedMerkle, fileRel)) {
      merkleDirty = true;
    }
  }

  for (const rel of files) {
    deletedSet.delete(rel);

    const abs = path.join(repo, rel);
    const ext = path.extname(rel).toLowerCase();
    const rule = LANG_RULES[ext];

    if (!rule) continue;

    const existingChunks = new Map(
      Object.entries(codemap)
        .filter(([, metadata]) => metadata && metadata.file === rel) as [string, any][]
    );
    const staleChunkIds = new Set(existingChunks.keys());
    const chunkMerkleHashes: string[] = [];
    let fileHash: string | null = null;

    try {
      const source = fs.readFileSync(abs, 'utf8');
      fileHash = await computeFastHash(source);

      const previousMerkle = merkle[rel];
      if (previousMerkle && previousMerkle.shaFile === fileHash) {
        continue;
      }

      const SIZE_THRESHOLD = 30000;
      const CHUNK_SIZE = 30000;
      
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
      
      function collectNodes(node: TreeSitterNode): void {
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
      }
      
      collectNodes(tree.rootNode);
      
      const nodeGroups = await groupNodesForChunking(
        collectedNodes,
        source,
        modelProfile,
        rule
      );
      
      const processedNodes = new Set<number>();
      
      async function processNodeGroup(nodeGroup: any): Promise<void> {
        if (nodeGroup.nodes.length === 1) {
          await yieldChunk(nodeGroup.nodes[0]);
          return;
        }
        
        const combinedChunk = createCombinedChunk(nodeGroup, source, rel);
        if (combinedChunk) {
          chunkingStats.totalNodes += nodeGroup.nodes.length;
          chunkingStats.fileGrouped = (chunkingStats.fileGrouped || 0) + 1;
          chunkingStats.functionsGrouped = (chunkingStats.functionsGrouped || 0) + nodeGroup.nodes.length;
          
          await processChunk(
            combinedChunk.node,
            combinedChunk.code,
            `group_${nodeGroup.nodes.length}funcs`,
            null
          );
        }
      }

      async function yieldChunk(node: TreeSitterNode, parentNode: TreeSitterNode | null = null): Promise<void> {
        chunkingStats.totalNodes++;
        
        const analysis = await analyzeNodeForChunking(node, source, rule, modelProfile);
        
        if (analysis.size < limits.min && parentNode !== null) {
          chunkingStats.skippedSmall++;
          return;
        }
        
        if (analysis.needsSubdivision && analysis.subdivisionCandidates.length > 0) {
          chunkingStats.subdivided++;
          
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
                processedNodes.add(subNode.id);
              }
            } else {
              if (subNode.id !== undefined) {
                processedNodes.add(subNode.id);
              }
              await yieldChunk(subNode, node);
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
              
              chunkingStats.mergedSmall++;
              await processChunk(mergedNode, mergedCode, suffix, parentNode);
            } else {
              chunkingStats.skippedSmall += smallChunks.length;
            }
          }
          
          return;
        } else if (analysis.size > limits.max) {
          chunkingStats.statementFallback++;
          const code = source.slice(node.startIndex, node.endIndex);
          const statementChunks = await yieldStatementChunks(
            node, 
            source, 
            limits.max, 
            limits.overlap, 
            modelProfile
          );
          
          for (let i = 0; i < statementChunks.length; i++) {
            const stmtChunk = statementChunks[i];
            await processChunk(node, stmtChunk.code, `${i + 1}`, parentNode);
          }
          return;
        }
        
        chunkingStats.normalChunks++;
        const code = source.slice(node.startIndex, node.endIndex);
        await processChunk(node, code, null, parentNode);
      }
      
      async function processChunk(node: TreeSitterNode, code: string, suffix: string | null = null, parentNode: TreeSitterNode | null = null): Promise<void> {
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

        if (codemap[chunkId]?.sha === sha) {
          staleChunkIds.delete(chunkId);
          chunkMerkleHashes.push(chunkMerkleHash);
          return;
        }

        await embedAndStore({
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
        processedChunks++;

        if (onProgress) {
          onProgress({ type: 'chunk_processed', file: rel, symbol, chunkId });
        }
      }

      for (const nodeGroup of nodeGroups) {
        await processNodeGroup(nodeGroup);
      }

      if (staleChunkIds.size > 0) {
        await deleteChunks(Array.from(staleChunkIds), existingChunks);
        indexMutated = true;
      }

      if (fileHash) {
        updatedMerkle[rel] = {
          shaFile: fileHash,
          chunkShas: chunkMerkleHashes
        };
        merkleDirty = true;
      }
    } catch (error) {
      errors.push({ type: 'processing_error', file: rel, error: (error as Error).message });

      try {
        const abs = path.join(repo, rel);
        if (!fs.existsSync(abs)) {
          continue;
        }

        const source = fs.readFileSync(abs, 'utf8');
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

        await embedAndStore({
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

        processedChunks++;
        indexMutated = true;

        if (onProgress) {
          onProgress({ type: 'chunk_processed', file: rel, symbol: fallbackSymbol, chunkId });
        }

        staleChunkIds.delete(chunkId);
        if (staleChunkIds.size > 0) {
          await deleteChunks(Array.from(staleChunkIds), existingChunks);
          indexMutated = true;
        }

        chunkMerkleHashes.length = 0;
        chunkMerkleHashes.push(chunkMerkleHash);
        fileHash = chunkMerkleHash;
        updatedMerkle[rel] = {
          shaFile: chunkMerkleHash,
          chunkShas: [...chunkMerkleHashes]
        };
        merkleDirty = true;
      } catch (fallbackError) {
        errors.push({ type: 'fallback_error', file: rel, error: (fallbackError as Error).message });
      }
    }
  }

  for (const fileRel of deletedSet) {
    await removeFileArtifacts(fileRel);
  }

  if (!isPartialUpdate) {
    const existingFilesSet = new Set(files);
    for (const fileRel of Object.keys(merkle)) {
      if (!existingFilesSet.has(fileRel)) {
        await removeFileArtifacts(fileRel);
      }
    }
  }

  // Notify that we're starting finalization
  if (onProgress) {
    onProgress({ type: 'finalizing' });
  }
  
  // Process any remaining chunks in the batch
  await batchProcessor.flush();
  
  if (merkleDirty) {
    saveMerkle(repo, updatedMerkle);
  }

  db.close();

  attachSymbolGraphToCodemap(codemap);
  codemap = writeCodemap(codemapPath, codemap);

  const tokenStats = getTokenCountStats();
  
  if (!process.env.CODEVAULT_QUIET) {
    if (chunkingStats.totalNodes > 0) {
      console.log(`\n📈 Chunking Statistics:`);
      console.log(`  Total AST nodes analyzed: ${chunkingStats.totalNodes}`);
      
      if (chunkingStats.fileGrouped && chunkingStats.functionsGrouped) {
        console.log(`  🎯 File-grouped chunks: ${chunkingStats.fileGrouped} (${chunkingStats.functionsGrouped} functions combined)`);
      }
      
      console.log(`  Normal chunks (optimal size): ${chunkingStats.normalChunks || 0}`);
      console.log(`  Subdivided (too large): ${chunkingStats.subdivided || 0}`);
      console.log(`  Merged small chunks: ${chunkingStats.mergedSmall || 0}`);
      console.log(`  Statement-level fallback: ${chunkingStats.statementFallback || 0}`);
      console.log(`  Skipped (too small): ${chunkingStats.skippedSmall || 0}`);
      console.log(`  Final chunk count: ${processedChunks}`);
      
      const reductionRatio = chunkingStats.totalNodes > 0
        ? ((1 - processedChunks / chunkingStats.totalNodes) * 100).toFixed(1)
        : 0;
      console.log(`  Chunk reduction: ${reductionRatio}% fewer chunks vs naive approach`);
      console.log('');
    }
    
    if (modelProfile.useTokens && tokenStats.totalRequests > 0) {
      console.log(`⚡ Token Counting Performance:`);
      console.log(`  Total size checks: ${tokenStats.totalRequests}`);
      console.log(`  Character pre-filter: ${tokenStats.charFilterRate} (${tokenStats.charFilterSkips} skipped)`);
      console.log(`  Cache hits: ${tokenStats.cacheHitRate} (${tokenStats.cacheHits} cached)`);
      console.log(`  Actual tokenizations: ${tokenStats.actualTokenizations}`);
      console.log(`  Batch operations: ${tokenStats.batchTokenizations}`);
      
      const efficiency = tokenStats.totalRequests > 0
        ? (((tokenStats.charFilterSkips + tokenStats.cacheHits) / tokenStats.totalRequests) * 100).toFixed(1)
        : 0;
      console.log(`  Overall efficiency: ${efficiency}% avoided expensive tokenization`);
      console.log('');
    }
  }

  return {
    success: true,
    processedChunks,
    totalChunks: Object.keys(codemap).length,
    provider: embeddingProvider.getName(),
    errors,
    chunkingStats,
    tokenStats: modelProfile.useTokens ? tokenStats : undefined
  };
}