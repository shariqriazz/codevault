import crypto from 'crypto';
import Parser from 'tree-sitter';
import { analyzeNodeForChunking, batchAnalyzeNodes, yieldStatementChunks } from '../../chunking/semantic-chunker.js';
import { groupNodesForChunking, createCombinedChunk, type NodeGroup } from '../../chunking/file-grouper.js';
import { extractSymbolMetadata, type SymbolMetadata } from '../../symbols/extract.js';
import { extractSymbolName } from '../symbol-extractor.js';
import {
  extractCodevaultMetadata,
  extractSemanticTags,
  extractImportantVariables,
  extractDocComments,
  generateEnhancedEmbeddingText,
  type CodevaultMetadata
} from '../metadata.js';
import type { ImportantVariable } from '../metadata.js';
import { computeFastHash } from '../../indexer/merkle.js';
import { SIZE_THRESHOLD, CHUNK_SIZE } from '../../config/constants.js';
import type { TreeSitterNode } from '../../types/ast.js';
import type { LanguageRule } from '../../languages/rules.js';
import type { ModelProfile } from '../../providers/base.js';
import type { CodemapChunk } from '../../types/codemap.js';
import type { ChunkingStats, ProgressEvent } from '../types.js';

type SizeLimits = {
  optimal: number;
  min: number;
  max: number;
  overlap: number;
  unit: string;
};

export interface OversizedChunk {
  code: string;
  part: number;
}

interface ExistingChunks {
  staleChunkIds: Set<string>;
  existingChunks: Map<string, CodemapChunk>;
}

interface ContextInfo {
  nodeType: string;
  startLine: number;
  endLine: number;
  codeLength: number;
  hasDocumentation: boolean;
  variableCount: number;
  isSubdivision: boolean;
  hasParentContext: boolean;
}

interface SmallChunk {
  node: TreeSitterNode;
  code: string;
  size: number;
}

type OnProgressCallback = ((event: ProgressEvent) => void) | null;

interface EmbedStoreParams {
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
  contextInfo: ContextInfo;
  symbolData: SymbolMetadata;
}

/**
 * Collects candidate AST nodes for chunking using a reusable parser instance.
 */
export class ASTTraverser {
  private parser: Parser;

  constructor(parser?: Parser) {
    this.parser = parser ?? new Parser();
  }

  collectNodesForFile(source: string, rule: LanguageRule): TreeSitterNode[] {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    this.parser.setLanguage(rule.ts);
    const tree = this.buildTree(source);
    if (!tree?.rootNode) {
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

  private buildTree(source: string) {
    if (source.length > SIZE_THRESHOLD) {
      return this.parser.parse((index: number) => {
        if (index < source.length) {
          return source.slice(index, Math.min(index + CHUNK_SIZE, source.length));
        }
        return null;
      });
    }
    return this.parser.parse(source);
  }
}

export interface OverlapStrategy {
  split(node: TreeSitterNode, source: string, limits: SizeLimits, profile: ModelProfile): Promise<OversizedChunk[]>;
}

/**
 * Default overlap strategy that falls back to statement-level chunking with 20% overlap.
 */
export class StatementOverlapStrategy implements OverlapStrategy {
  async split(
    node: TreeSitterNode,
    source: string,
    limits: SizeLimits,
    profile: ModelProfile
  ): Promise<OversizedChunk[]> {
    const statementChunks = await yieldStatementChunks(node, source, limits.max, limits.overlap, profile);
    return statementChunks.map((chunk, index) => ({
      code: chunk.code,
      part: index + 1
    }));
  }
}

export class ChunkGrouper {
  async groupNodes(
    nodes: TreeSitterNode[],
    source: string,
    profile: ModelProfile,
    rule: LanguageRule
  ): Promise<NodeGroup[]> {
    return groupNodesForChunking(nodes, source, profile, rule);
  }
}

export interface ChunkPipelineDependencies {
  traverser?: ASTTraverser;
  chunkGrouper?: ChunkGrouper;
  overlapStrategy?: OverlapStrategy;
}

export class ChunkPipeline {
  private processedNodes = new Set<number>();
  private traverser: ASTTraverser;
  private chunkGrouper: ChunkGrouper;
  private overlapStrategy: OverlapStrategy;

  constructor(deps: ChunkPipelineDependencies = {}) {
    this.traverser = deps.traverser ?? new ASTTraverser();
    this.chunkGrouper = deps.chunkGrouper ?? new ChunkGrouper();
    this.overlapStrategy = deps.overlapStrategy ?? new StatementOverlapStrategy();
  }

  async collectNodesForFile(source: string, rule: LanguageRule): Promise<TreeSitterNode[]> {
    return this.traverser.collectNodesForFile(source, rule);
  }

  async groupNodes(nodes: TreeSitterNode[], source: string, profile: ModelProfile, rule: LanguageRule): Promise<NodeGroup[]> {
    return this.chunkGrouper.groupNodes(nodes, source, profile, rule);
  }

  async processGroups(
    nodeGroups: NodeGroup[],
    source: string,
    rule: LanguageRule,
    limits: SizeLimits,
    modelProfile: ModelProfile,
    rel: string,
    existing: ExistingChunks,
    chunkMerkleHashes: string[],
    onProgress: OnProgressCallback,
    embedAndStore: (params: EmbedStoreParams) => Promise<void>,
    chunkingStats: ChunkingStats
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
      onProgress: OnProgressCallback,
      embedAndStore: (params: EmbedStoreParams) => Promise<void>,
      chunkingStats: ChunkingStats,
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
      
      const smallChunks: SmallChunk[] = [];

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
        const totalSmallSize = smallChunks.reduce((sum: number, c: SmallChunk) => sum + c.size, 0);

        if (totalSmallSize >= limits.min || smallChunks.length >= 3) {
          const mergedCode = smallChunks.map((c: SmallChunk) => c.code).join('\n\n');
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
      const oversizedChunks = await this.overlapStrategy.split(
        node,
        source,
        limits,
        modelProfile
      );
      
      for (const stmtChunk of oversizedChunks) {
        await this.processChunk(
          node,
          stmtChunk.code,
          `${stmtChunk.part}`,
          parentNode,
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
      onProgress: OnProgressCallback,
      embedAndStore: (params: EmbedStoreParams) => Promise<void>,
      chunkingStats: ChunkingStats
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
