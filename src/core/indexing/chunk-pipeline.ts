import Parser from 'tree-sitter';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { analyzeNodeForChunking, batchAnalyzeNodes, yieldStatementChunks } from '../../chunking/semantic-chunker.js';
import { groupNodesForChunking, createCombinedChunk } from '../../chunking/file-grouper.js';
import { extractSymbolMetadata } from '../../symbols/extract.js';
import { extractSymbolName } from '../symbol-extractor.js';
import {
  extractCodevaultMetadata,
  extractSemanticTags,
  extractImportantVariables,
  extractDocComments,
  generateEnhancedEmbeddingText
} from '../metadata.js';
import { computeFastHash } from '../../indexer/merkle.js';
import { SIZE_THRESHOLD, CHUNK_SIZE } from '../../config/constants.js';
import type { TreeSitterNode } from '../../types/ast.js';
import type { LanguageRule } from '../../languages/rules.js';
import type { ModelProfile } from '../../providers/base.js';

type SizeLimits = {
  optimal: number;
  min: number;
  max: number;
  overlap: number;
  unit: string;
};

interface ExistingChunks {
  staleChunkIds: Set<string>;
  existingChunks: Map<string, any>;
}

interface EmbedStoreParams {
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
}

export class ChunkPipeline {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
  }

  async collectNodesForFile(source: string, rule: LanguageRule) {
    this.parser.setLanguage(rule.ts);
    let tree;
    if (source.length > SIZE_THRESHOLD) {
      tree = this.parser.parse((index: number) => {
        if (index < source.length) {
          return source.slice(index, Math.min(index + CHUNK_SIZE, source.length));
        }
        return null;
      });
    } else {
      tree = this.parser.parse(source);
    }

    if (!tree || !tree.rootNode) {
      throw new Error('Failed to create syntax tree');
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
    return collectedNodes;
  }

  async processGroups(
    nodeGroups: any[],
    source: string,
    rule: LanguageRule,
    limits: SizeLimits,
    modelProfile: ModelProfile,
    rel: string,
    existing: ExistingChunks,
    chunkMerkleHashes: string[],
    onProgress: any,
    embedAndStore: (params: EmbedStoreParams) => Promise<void>,
    chunkingStats: any
  ): Promise<void> {
    this.processedNodes = new Set<number>();

    for (const nodeGroup of nodeGroups) {
      if (nodeGroup.nodes.length === 1) {
        await this.yieldChunk(nodeGroup.nodes[0], source, rule, limits, modelProfile, rel, existing, chunkMerkleHashes, onProgress, embedAndStore, chunkingStats);
      } else {
        const combinedChunk = createCombinedChunk(nodeGroup, source);
        if (combinedChunk) {
          chunkingStats.totalNodes += nodeGroup.nodes.length;
          chunkingStats.fileGrouped = (chunkingStats.fileGrouped || 0) + 1;
          chunkingStats.functionsGrouped = (chunkingStats.functionsGrouped || 0) + nodeGroup.nodes.length;
          
          await this.processChunk(
            combinedChunk.node,
            combinedChunk.code,
            `group_${nodeGroup.nodes.length}funcs`,
            null,
            source,
            rel,
            rule,
            existing,
            chunkMerkleHashes,
            onProgress,
            embedAndStore,
            chunkingStats
          );
        }
      }
    }
  }

  private async yieldChunk(
      node: TreeSitterNode, 
      source: string, 
      rule: LanguageRule, 
      limits: SizeLimits, 
      modelProfile: ModelProfile, 
      rel: string,
      existing: ExistingChunks,
      chunkMerkleHashes: string[],
      onProgress: any,
      embedAndStore: (params: EmbedStoreParams) => Promise<void>,
      chunkingStats: any,
      parentNode: TreeSitterNode | null = null
  ): Promise<void> {
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
            this.processedNodes.add(subNode.id);
          }
        } else {
          if (subNode.id !== undefined) {
            this.processedNodes.add(subNode.id);
          }
          await this.yieldChunk(subNode, source, rule, limits, modelProfile, rel, existing, chunkMerkleHashes, onProgress, embedAndStore, chunkingStats, node);
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
          await this.processChunk(mergedNode, mergedCode, suffix, parentNode, source, rel, rule, existing, chunkMerkleHashes, onProgress, embedAndStore, chunkingStats);
        } else {
          chunkingStats.skippedSmall += smallChunks.length;
        }
      }
      
      return;
    } else if (analysis.size > limits.max) {
      chunkingStats.statementFallback++;
      const statementChunks = await yieldStatementChunks(
        node, 
        source, 
        limits.max, 
        limits.overlap, 
        modelProfile
      );
      
      for (let i = 0; i < statementChunks.length; i++) {
        const stmtChunk = statementChunks[i];
        await this.processChunk(node, stmtChunk.code, `${i + 1}`, parentNode, source, rel, rule, existing, chunkMerkleHashes, onProgress, embedAndStore, chunkingStats);
      }
      return;
    }
    
    chunkingStats.normalChunks++;
    const code = source.slice(node.startIndex, node.endIndex);
    await this.processChunk(node, code, null, parentNode, source, rel, rule, existing, chunkMerkleHashes, onProgress, embedAndStore, chunkingStats);
  }

  private async processChunk(
      node: TreeSitterNode, 
      code: string, 
      suffix: string | null, 
      parentNode: TreeSitterNode | null,
      source: string,
      rel: string,
      rule: LanguageRule,
      existing: ExistingChunks,
      chunkMerkleHashes: string[],
      onProgress: any,
      embedAndStore: (params: EmbedStoreParams) => Promise<void>,
      chunkingStats: any
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

    if (existing.existingChunks.has(chunkId)) {
      existing.staleChunkIds.delete(chunkId);
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
    
    existing.staleChunkIds.delete(chunkId);
    chunkMerkleHashes.push(chunkMerkleHash);
    if (onProgress) {
      onProgress({ type: 'chunk_processed', file: rel, symbol, chunkId });
    }
  }
}
