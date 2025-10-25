import { analyzeCodeSize, batchAnalyzeCodeSize, type CodeSizeAnalysis } from './token-counter.js';
import type { ModelProfile } from '../providers/base.js';
import type { TreeSitterNode } from '../types/ast.js';

interface LanguageRule {
  subdivisionTypes?: Record<string, string[]>;
  [key: string]: any;
}

interface SizeLimits {
  optimal: number;
  min: number;
  max: number;
  overlap: number;
  unit: string;
}

interface NodeAnalysis {
  node: TreeSitterNode;
  size: number;
  code: string;
}

interface SemanticGroup {
  type: string;
  containerType?: string;
  nodes: TreeSitterNode[];
  analyses: NodeAnalysis[];
  parentNode: TreeSitterNode | null;
}

export interface NodeGroup {
  nodes: TreeSitterNode[];
  totalSize: number;
  groupInfo: SemanticGroup[];
}

function getSizeLimits(profile: ModelProfile): SizeLimits {
  if (profile.useTokens && profile.tokenCounter) {
    return {
      optimal: profile.optimalTokens,
      min: profile.minChunkTokens,
      max: profile.maxChunkTokens,
      overlap: profile.overlapTokens,
      unit: 'tokens'
    };
  }
  return {
    optimal: profile.optimalChars,
    min: profile.minChunkChars,
    max: profile.maxChunkChars,
    overlap: profile.overlapChars,
    unit: 'characters'
  };
}

async function batchAnalyzeNodesInternal(nodes: TreeSitterNode[], source: string, profile: ModelProfile): Promise<NodeAnalysis[]> {
  const codes = nodes.map(node => source.slice(node.startIndex, node.endIndex));
  const limits = getSizeLimits(profile);
  
  if (profile.useTokens && profile.tokenCounter) {
    const analyses = await batchAnalyzeCodeSize(codes, limits, profile.tokenCounter, false);
    return nodes.map((node, i) => ({
      node,
      size: analyses[i].size,
      code: codes[i]
    }));
  }
  
  return nodes.map((node, i) => ({
    node,
    size: codes[i].length,
    code: codes[i]
  }));
}

function isContainerNode(node: TreeSitterNode, rule: LanguageRule): boolean {
  const containerTypes = [
    'class_declaration',
    'class_definition',
    'interface_declaration',
    'module_declaration',
    'namespace_declaration',
    'trait_declaration',
    'enum_declaration'
  ];
  
  return containerTypes.includes(node.type);
}

function identifySemanticGroups(nodes: TreeSitterNode[], source: string, nodeAnalyses: NodeAnalysis[], rule: LanguageRule): SemanticGroup[] {
  const groups: SemanticGroup[] = [];
  let currentGroup: SemanticGroup = {
    type: 'file_section',
    nodes: [],
    analyses: [],
    parentNode: null
  };
  
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const analysis = nodeAnalyses[i];
    
    if (isContainerNode(node, rule)) {
      if (currentGroup.nodes.length > 0) {
        groups.push(currentGroup);
      }
      
      currentGroup = {
        type: 'container',
        containerType: node.type,
        nodes: [node],
        analyses: [analysis],
        parentNode: node
      };
      
      groups.push(currentGroup);
      
      currentGroup = {
        type: 'file_section',
        nodes: [],
        analyses: [],
        parentNode: null
      };
    } else {
      currentGroup.nodes.push(node);
      currentGroup.analyses.push(analysis);
    }
  }
  
  if (currentGroup.nodes.length > 0) {
    groups.push(currentGroup);
  }
  
  return groups;
}

async function combineGroupsToOptimalSize(
  semanticGroups: SemanticGroup[],
  source: string,
  profile: ModelProfile,
  limits: SizeLimits
): Promise<NodeGroup[]> {
  const optimalGroups: NodeGroup[] = [];
  let currentCombinedGroup: NodeGroup = {
    nodes: [],
    totalSize: 0,
    groupInfo: []
  };
  
  for (const group of semanticGroups) {
    const groupTotalSize = group.analyses.reduce((sum, a) => sum + a.size, 0);
    
    if (groupTotalSize > limits.optimal) {
      if (currentCombinedGroup.nodes.length > 0) {
        optimalGroups.push(currentCombinedGroup);
      }
      
      optimalGroups.push({
        nodes: group.nodes,
        totalSize: groupTotalSize,
        groupInfo: [group]
      });
      
      currentCombinedGroup = {
        nodes: [],
        totalSize: 0,
        groupInfo: []
      };
      continue;
    }
    
    if (currentCombinedGroup.totalSize + groupTotalSize > limits.max) {
      if (currentCombinedGroup.nodes.length > 0) {
        optimalGroups.push(currentCombinedGroup);
      }
      
      currentCombinedGroup = {
        nodes: group.nodes,
        totalSize: groupTotalSize,
        groupInfo: [group]
      };
      continue;
    }
    
    currentCombinedGroup.nodes.push(...group.nodes);
    currentCombinedGroup.totalSize += groupTotalSize;
    currentCombinedGroup.groupInfo.push(group);
    
    if (currentCombinedGroup.totalSize >= limits.optimal * 0.9) {
      optimalGroups.push(currentCombinedGroup);
      currentCombinedGroup = {
        nodes: [],
        totalSize: 0,
        groupInfo: []
      };
    }
  }
  
  if (currentCombinedGroup.nodes.length > 0) {
    optimalGroups.push(currentCombinedGroup);
  }
  
  return optimalGroups;
}

export async function groupNodesForChunking(
  nodes: TreeSitterNode[],
  source: string,
  profile: ModelProfile,
  rule: LanguageRule
): Promise<NodeGroup[]> {
  if (!nodes || nodes.length === 0) return [];
  
  const limits = getSizeLimits(profile);
  
  if (nodes.length <= 10) {
    return nodes.map(node => ({
      nodes: [node],
      totalSize: 0,
      groupInfo: []
    }));
  }
  
  const nodeAnalyses = await batchAnalyzeNodesInternal(nodes, source, profile);
  const semanticGroups = identifySemanticGroups(nodes, source, nodeAnalyses, rule);
  const optimalGroups = await combineGroupsToOptimalSize(semanticGroups, source, profile, limits);
  
  return optimalGroups;
}

export interface CombinedChunk {
  code: string;
  node: TreeSitterNode & { type: string };
  metadata: {
    isGroup: boolean;
    nodeCount: number;
    totalSize: number;
    groupTypes: string[];
  };
}

export function createCombinedChunk(nodeGroup: NodeGroup, source: string, filerel: string): CombinedChunk | null {
  if (!nodeGroup.nodes || nodeGroup.nodes.length === 0) {
    return null;
  }
  
  const codes = nodeGroup.nodes.map(node => 
    source.slice(node.startIndex, node.endIndex)
  );
  
  const combinedCode = codes.join('\n\n');
  
  const firstNode = nodeGroup.nodes[0];
  const lastNode = nodeGroup.nodes[nodeGroup.nodes.length - 1];
  
  return {
    code: combinedCode,
    node: {
      ...firstNode,
      type: `${firstNode.type}_group_${nodeGroup.nodes.length}`,
      endIndex: lastNode.endIndex
    },
    metadata: {
      isGroup: true,
      nodeCount: nodeGroup.nodes.length,
      totalSize: nodeGroup.totalSize,
      groupTypes: nodeGroup.groupInfo?.map(g => g.type) || ['combined']
    }
  };
}