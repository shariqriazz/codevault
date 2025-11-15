import { analyzeCodeSize, batchAnalyzeCodeSize, type CodeSizeAnalysis } from './token-counter.js';
import type { ModelProfile } from '../providers/base.js';
import { getSizeLimits } from '../providers/base.js';
import { CHUNKING_CONSTANTS } from '../config/constants.js';
import type { TreeSitterNode } from '../types/ast.js';

interface LanguageRule {
  subdivisionTypes?: Record<string, string[]>;
  [key: string]: any;
}

export function findSemanticSubdivisions(node: TreeSitterNode, rule: LanguageRule): TreeSitterNode[] {
  if (!node || !rule) return [];
  
  const subdivisionTypes = rule.subdivisionTypes?.[node.type] || [];
  if (subdivisionTypes.length === 0) return [];
  
  const candidates: TreeSitterNode[] = [];
  
  function walk(n: TreeSitterNode, depth = 0) {
    if (depth > 0 && subdivisionTypes.includes(n.type)) {
      candidates.push(n);
      return;
    }
    
    for (let i = 0; i < n.childCount; i++) {
      const child = n.child(i);
      if (child) {
        walk(child, depth + 1);
      }
    }
  }
  
  walk(node);
  return candidates;
}

export function findLastCompleteBoundary(code: string, maxSize: number): number {
  const boundaries = [
    { pattern: /\n\s*}\s*$/gm, priority: 1 },
    { pattern: /;\s*$/gm, priority: 2 },
    { pattern: /\n\s*$/gm, priority: 3 }
  ];
  
  for (const boundary of boundaries) {
    const matches = [...code.substring(0, maxSize).matchAll(boundary.pattern)];
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      return lastMatch.index! + lastMatch[0].length;
    }
  }
  
  return maxSize;
}

export function extractSignature(node: TreeSitterNode, source: string): string {
  const code = source.slice(node.startIndex, node.endIndex);
  const firstBrace = code.indexOf('{');
  if (firstBrace !== -1) {
    return code.substring(0, firstBrace).trim() + ' {';
  }
  return code.split('\n')[0];
}

export function extractLinesBeforeNode(node: TreeSitterNode, source: string, numLines: number): string {
  const beforeCode = source.substring(0, node.startIndex);
  const lines = beforeCode.split('\n');
  return lines.slice(-numLines).join('\n');
}

export function extractParentContext(node: TreeSitterNode, source: string): {
  signature: string;
  startLine: number;
  endLine: number;
} {
  return {
    signature: extractSignature(node, source),
    startLine: getLineNumber(node.startIndex, source),
    endLine: getLineNumber(node.endIndex, source)
  };
}

export function getLineNumber(byteOffset: number, source: string): number {
  const before = source.substring(0, byteOffset);
  return before.split('\n').length;
}

export interface NodeAnalysis {
  isSingleChunk: boolean;
  needsSubdivision: boolean;
  subdivisionCandidates: TreeSitterNode[];
  size: number;
  unit: string;
  method: string;
  estimatedSubchunks: number;
}

export async function analyzeNodeForChunking(
  node: TreeSitterNode,
  source: string,
  rule: LanguageRule,
  profile: ModelProfile
): Promise<NodeAnalysis> {
  const code = source.slice(node.startIndex, node.endIndex);
  const limits = getSizeLimits(profile);
  
  let actualSize: number;
  let method: string;
  
  if (profile.useTokens && profile.tokenCounter) {
    const analysis = await analyzeCodeSize(code, limits, profile.tokenCounter);
    actualSize = analysis.size;
    method = analysis.method;
  } else {
    actualSize = code.length;
    method = 'chars';
  }
  
  const subdivisionThreshold = limits.max;
  
  return {
    isSingleChunk: actualSize <= subdivisionThreshold,
    needsSubdivision: actualSize > subdivisionThreshold,
    subdivisionCandidates: findSemanticSubdivisions(node, rule),
    size: actualSize,
    unit: limits.unit,
    method,
    estimatedSubchunks: Math.ceil(actualSize / limits.optimal)
  };
}

export async function batchAnalyzeNodes(
  nodes: TreeSitterNode[],
  source: string,
  rule: LanguageRule,
  profile: ModelProfile,
  isSubdivision = false
): Promise<Array<NodeAnalysis & { node: TreeSitterNode }>> {
  const codes = nodes.map(node => source.slice(node.startIndex, node.endIndex));
  const limits = getSizeLimits(profile);
  
  let analyses: CodeSizeAnalysis[];
  if (profile.useTokens && profile.tokenCounter) {
    analyses = await batchAnalyzeCodeSize(codes, limits, profile.tokenCounter, isSubdivision);
  } else {
    analyses = codes.map(code => ({
      size: code.length,
      decision: code.length < limits.min ? 'too_small' as const
            : code.length > limits.max ? 'too_large' as const
            : code.length <= limits.optimal ? 'optimal' as const
            : 'needs_tokenization' as const,
      method: 'chars'
    }));
  }
  
  return nodes.map((node, i) => {
    const analysis = analyses[i];
    const subdivisionThreshold = limits.max;
    return {
      node,
      isSingleChunk: analysis.size <= subdivisionThreshold,
      needsSubdivision: analysis.size > subdivisionThreshold,
      subdivisionCandidates: findSemanticSubdivisions(node, rule),
      size: analysis.size,
      unit: limits.unit,
      method: analysis.method,
      estimatedSubchunks: Math.ceil(analysis.size / limits.optimal)
    };
  });
}

export interface StatementChunk {
  code: string;
  size: number;
  unit: string;
}

export async function yieldStatementChunks(
  node: TreeSitterNode,
  source: string,
  maxSize: number,
  overlapSize: number,
  profile: ModelProfile
): Promise<StatementChunk[]> {
  const code = source.slice(node.startIndex, node.endIndex);
  const lines = code.split('\n');
  
  const chunks: StatementChunk[] = [];
  let currentChunk: string[] = [];
  let currentSize = 0;
  
  for (const line of lines) {
    const lineSize = profile.useTokens && profile.tokenCounter 
      ? await profile.tokenCounter(line)
      : line.length;
    
    if (currentSize + lineSize > maxSize && currentChunk.length > 0) {
      chunks.push({
        code: currentChunk.join('\n'),
        size: currentSize,
        unit: profile.useTokens ? 'tokens' : 'characters'
      });
      
      const ratioFromConfig = Math.min(1, Math.max(0, CHUNKING_CONSTANTS.LINE_OVERLAP_PERCENTAGE));
      const ratioFromParam = maxSize > 0 ? Math.min(1, Math.max(0, overlapSize / maxSize)) : 0;
      const overlapRatio = ratioFromConfig > 0 ? ratioFromConfig : ratioFromParam;
      const overlapLines = Math.max(1, Math.floor(currentChunk.length * overlapRatio));
      currentChunk = currentChunk.slice(-overlapLines);
      currentSize = profile.useTokens && profile.tokenCounter
        ? await profile.tokenCounter(currentChunk.join('\n'))
        : currentChunk.join('\n').length;
    }
    
    currentChunk.push(line);
    currentSize += lineSize;
  }
  
  if (currentChunk.length > 0) {
    chunks.push({
      code: currentChunk.join('\n'),
      size: currentSize,
      unit: profile.useTokens ? 'tokens' : 'characters'
    });
  }
  
  return chunks;
}
