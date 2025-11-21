import { analyzeCodeSize, batchAnalyzeCodeSize, type CodeSizeAnalysis } from './token-counter.js';
import type { ModelProfile } from '../providers/base.js';
import { getSizeLimits } from '../providers/base.js';
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

  function walk(n: TreeSitterNode, depth = 0): void {
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
      return lastMatch.index + lastMatch[0].length;
    }
  }
  
  return maxSize;
}

export function extractSignature(node: TreeSitterNode, source: string): string {
  const code = source.slice(node.startIndex, node.endIndex);
  const firstBrace = code.indexOf('{');
  if (firstBrace !== -1) {
    return `${code.substring(0, firstBrace).trim()  } {`;
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
  const tokenCounter = profile.useTokens && profile.tokenCounter ? profile.tokenCounter : null;
  const lineSizes = tokenCounter
    ? await Promise.all(lines.map(async line => tokenCounter(line)))
    : lines.map(line => line.length);
  const unit = tokenCounter ? 'tokens' : 'characters';
  
  const chunks: StatementChunk[] = [];
  let currentChunk: string[] = [];
  let currentChunkSizes: number[] = [];
  let currentSize = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineSize = lineSizes[i];
    
    if (currentSize + lineSize > maxSize && currentChunk.length > 0) {
      chunks.push({
        code: currentChunk.join('\n'),
        size: currentSize,
        unit
      });

      // Ensure minimum 20% overlap by token/character count, not line count
      // This prevents overlap from degrading to 1-2% for large chunks
      const MIN_OVERLAP_RATIO = 0.2;
      const targetOverlapSize = Math.max(
        overlapSize,
        Math.floor(maxSize * MIN_OVERLAP_RATIO)
      );

      // Calculate how many lines we need to achieve target overlap size
      let overlapAccumulatedSize = 0;
      let linesToKeep = 0;

      // Walk backwards through lines to accumulate target overlap size
      for (let j = currentChunkSizes.length - 1; j >= 0 && overlapAccumulatedSize < targetOverlapSize; j--) {
        overlapAccumulatedSize += currentChunkSizes[j];
        linesToKeep++;
      }

      // Keep at least 1 line for overlap
      linesToKeep = Math.max(1, linesToKeep);
      currentChunk = currentChunk.slice(-linesToKeep);
      currentChunkSizes = currentChunkSizes.slice(-linesToKeep);
      currentSize = currentChunkSizes.reduce((sum, size) => sum + size, 0);
    }
    
    currentChunk.push(line);
    currentChunkSizes.push(lineSize);
    currentSize += lineSize;
  }
  
  if (currentChunk.length > 0) {
    chunks.push({
      code: currentChunk.join('\n'),
      size: currentSize,
      unit
    });
  }
  
  return chunks;
}
