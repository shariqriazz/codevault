import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findSemanticSubdivisions,
  findLastCompleteBoundary,
  extractSignature,
  extractLinesBeforeNode,
  extractParentContext,
  getLineNumber,
  analyzeNodeForChunking,
  batchAnalyzeNodes,
  yieldStatementChunks,
  type NodeAnalysis,
  type StatementChunk
} from '../../chunking/semantic-chunker.js';
import type { ModelProfile } from '../../providers/base.js';
import type { SyntaxNode } from 'tree-sitter';

// Mock node factory for Tree-sitter nodes
interface MockNode {
  type: string;
  startIndex: number;
  endIndex: number;
  childCount: number;
  child: (idx: number) => MockNode | null;
}

function makeNode(
  type: string,
  children: MockNode[] = [],
  startIndex = 0,
  endIndex = 0
): MockNode {
  return {
    type,
    startIndex,
    endIndex,
    childCount: children.length,
    child: (idx: number) => children[idx] ?? null
  };
}

// Base profile without token counting (character-based)
const charProfile: ModelProfile = {
  maxTokens: 1000,
  optimalTokens: 500,
  minChunkTokens: 50,
  maxChunkTokens: 800,
  overlapTokens: 100,
  optimalChars: 2000,
  minChunkChars: 100,
  maxChunkChars: 1600,
  overlapChars: 200,
  dimensions: 1536,
  useTokens: false,
  tokenizerType: 'estimate'
};

// Profile with token counting
const tokenProfile: ModelProfile = {
  ...charProfile,
  useTokens: true,
  tokenCounter: (text: string): number => Math.ceil(text.length / 4) // 4 chars per token
};

// -------------------------------------------------------------------
// Tests for findSemanticSubdivisions
// -------------------------------------------------------------------

test('findSemanticSubdivisions returns empty array for null node', () => {
  const rule = { subdivisionTypes: { class: ['method'] } };
  const subs = findSemanticSubdivisions(null as unknown as SyntaxNode, rule);
  assert.deepEqual(subs, []);
});

test('findSemanticSubdivisions returns empty array for null rule', () => {
  const node = makeNode('class');
  const subs = findSemanticSubdivisions(node as unknown as SyntaxNode, null as never);
  assert.deepEqual(subs, []);
});

test('findSemanticSubdivisions returns empty when no subdivisionTypes defined', () => {
  const child = makeNode('method');
  const parent = makeNode('class', [child]);
  const rule = {};
  const subs = findSemanticSubdivisions(parent as unknown as SyntaxNode, rule);
  assert.deepEqual(subs, []);
});

test('findSemanticSubdivisions returns empty when node type not in subdivisionTypes', () => {
  const child = makeNode('method');
  const parent = makeNode('interface', [child]);
  const rule = { subdivisionTypes: { class: ['method'] } };
  const subs = findSemanticSubdivisions(parent as unknown as SyntaxNode, rule);
  assert.deepEqual(subs, []);
});

test('findSemanticSubdivisions finds direct children matching subdivision types', () => {
  const method1 = makeNode('method');
  const method2 = makeNode('method');
  const parent = makeNode('class', [method1, method2]);
  const rule = { subdivisionTypes: { class: ['method'] } };

  const subs = findSemanticSubdivisions(parent as unknown as SyntaxNode, rule);
  assert.equal(subs.length, 2);
  assert.equal(subs[0], method1);
  assert.equal(subs[1], method2);
});

test('findSemanticSubdivisions finds nested subdivision candidates', () => {
  const method = makeNode('method');
  const body = makeNode('class_body', [method]);
  const parent = makeNode('class', [body]);
  const rule = { subdivisionTypes: { class: ['method'] } };

  const subs = findSemanticSubdivisions(parent as unknown as SyntaxNode, rule);
  assert.equal(subs.length, 1);
  assert.equal(subs[0], method);
});

test('findSemanticSubdivisions does not include root node itself', () => {
  const root = makeNode('method');
  const rule = { subdivisionTypes: { method: ['method'] } };

  const subs = findSemanticSubdivisions(root as unknown as SyntaxNode, rule);
  assert.equal(subs.length, 0);
});

test('findSemanticSubdivisions stops recursion when match found', () => {
  const innerMethod = makeNode('method');
  const outerMethod = makeNode('method', [innerMethod]);
  const parent = makeNode('class', [outerMethod]);
  const rule = { subdivisionTypes: { class: ['method'] } };

  const subs = findSemanticSubdivisions(parent as unknown as SyntaxNode, rule);
  // Should only find outerMethod, not recurse into it
  assert.equal(subs.length, 1);
  assert.equal(subs[0], outerMethod);
});

test('findSemanticSubdivisions handles multiple subdivision types', () => {
  const method = makeNode('method_definition');
  const field = makeNode('field_declaration');
  const parent = makeNode('class_declaration', [method, field]);
  const rule = { subdivisionTypes: { class_declaration: ['method_definition', 'field_declaration'] } };

  const subs = findSemanticSubdivisions(parent as unknown as SyntaxNode, rule);
  assert.equal(subs.length, 2);
});

// -------------------------------------------------------------------
// Tests for findLastCompleteBoundary
// -------------------------------------------------------------------

test('findLastCompleteBoundary finds closing brace boundary', () => {
  const code = 'function foo() {\n  return 1;\n}\nfunction bar() {';
  const result = findLastCompleteBoundary(code, 40);
  // Should find the } followed by newline
  assert.ok(result > 0);
  assert.ok(result <= 40);
  assert.ok(code.substring(0, result).trim().endsWith('}'));
});

test('findLastCompleteBoundary finds semicolon boundary', () => {
  const code = 'const a = 1;\nconst b = 2;\nconst c = 3';
  const result = findLastCompleteBoundary(code, 25);
  // Should find semicolon boundary
  assert.ok(result > 0);
  assert.ok(result <= 25);
});

test('findLastCompleteBoundary finds newline boundary as fallback', () => {
  const code = 'line1\nline2\nline3';
  const result = findLastCompleteBoundary(code, 10);
  // Should find newline
  assert.ok(result > 0);
  assert.ok(result <= 10);
});

test('findLastCompleteBoundary returns maxSize when no boundary found', () => {
  const code = 'abcdefghijklmnopqrstuvwxyz';
  const result = findLastCompleteBoundary(code, 10);
  assert.equal(result, 10);
});

test('findLastCompleteBoundary handles empty code', () => {
  const result = findLastCompleteBoundary('', 10);
  assert.equal(result, 10);
});

test('findLastCompleteBoundary handles code shorter than maxSize', () => {
  const code = 'const a = 1;';
  const result = findLastCompleteBoundary(code, 100);
  // Should find the semicolon
  assert.ok(result <= code.length);
});

// -------------------------------------------------------------------
// Tests for extractSignature
// -------------------------------------------------------------------

test('extractSignature extracts function signature before brace', () => {
  const source = 'function calculate(a, b) {\n  return a + b;\n}';
  const node = makeNode('function', [], 0, source.length);
  const sig = extractSignature(node as unknown as SyntaxNode, source);
  assert.equal(sig, 'function calculate(a, b) {');
});

test('extractSignature handles class signature', () => {
  const source = 'class MyClass extends Base {\n  constructor() {}\n}';
  const node = makeNode('class', [], 0, source.length);
  const sig = extractSignature(node as unknown as SyntaxNode, source);
  assert.equal(sig, 'class MyClass extends Base {');
});

test('extractSignature returns first line when no brace found', () => {
  const source = 'const value = 42\nconst other = 43';
  const node = makeNode('declaration', [], 0, 16);
  const sig = extractSignature(node as unknown as SyntaxNode, source);
  assert.equal(sig, 'const value = 42');
});

test('extractSignature handles arrow functions', () => {
  const source = 'const fn = (x) => {\n  return x * 2;\n}';
  const node = makeNode('arrow_function', [], 0, source.length);
  const sig = extractSignature(node as unknown as SyntaxNode, source);
  assert.equal(sig, 'const fn = (x) => {');
});

test('extractSignature handles single-line code', () => {
  const source = 'const x = 1;';
  const node = makeNode('declaration', [], 0, source.length);
  const sig = extractSignature(node as unknown as SyntaxNode, source);
  assert.equal(sig, 'const x = 1;');
});

// -------------------------------------------------------------------
// Tests for extractLinesBeforeNode
// -------------------------------------------------------------------

test('extractLinesBeforeNode returns specified number of lines', () => {
  const source = 'line1\nline2\nline3\nline4\nfunction start()';
  // Node starts at position after 'line1\nline2\nline3\nline4\n' (24 chars)
  const node = makeNode('function', [], 24, source.length);
  const lines = extractLinesBeforeNode(node as unknown as SyntaxNode, source, 2);
  // The function takes 'line1\nline2\nline3\nline4\n' (before the node)
  // splits by \n = ['line1', 'line2', 'line3', 'line4', ''] (note empty string after last \n)
  // takes last 2: ['line4', '']
  // joins with \n: 'line4\n' + '' = 'line4\n'
  // Wait, this isn't right. Let me recalculate:
  // Before node (index 24): 'line1\nline2\nline3\nline4\n'
  // Split by \n: ['line1', 'line2', 'line3', 'line4', '']
  // Slice(-2): ['line4', '']
  // Join with \n: 'line4\n'
  assert.equal(lines, 'line4\n');
});

test('extractLinesBeforeNode handles fewer lines than requested', () => {
  const source = 'line1\nfunction start()';
  // Node at index 6 (after 'line1\n')
  const node = makeNode('function', [], 6, source.length);
  const lines = extractLinesBeforeNode(node as unknown as SyntaxNode, source, 5);
  // Before node: 'line1\n'
  // Split: ['line1', '']
  // Slice(-5): ['line1', '']
  // Join: 'line1\n'
  assert.equal(lines, 'line1\n');
});

test('extractLinesBeforeNode handles node at start', () => {
  const source = 'function start() {}';
  const node = makeNode('function', [], 0, source.length);
  const lines = extractLinesBeforeNode(node as unknown as SyntaxNode, source, 2);
  assert.equal(lines, '');
});

test('extractLinesBeforeNode handles empty source', () => {
  const node = makeNode('function', [], 0, 0);
  const lines = extractLinesBeforeNode(node as unknown as SyntaxNode, '', 2);
  assert.equal(lines, '');
});

// -------------------------------------------------------------------
// Tests for getLineNumber
// -------------------------------------------------------------------

test('getLineNumber returns 1 for offset 0', () => {
  const source = 'line1\nline2\nline3';
  assert.equal(getLineNumber(0, source), 1);
});

test('getLineNumber returns correct line for middle of file', () => {
  const source = 'line1\nline2\nline3';
  // 'line1\n' is 6 chars, so offset 6 is start of line 2
  assert.equal(getLineNumber(6, source), 2);
});

test('getLineNumber returns correct line for end of file', () => {
  const source = 'line1\nline2\nline3';
  assert.equal(getLineNumber(source.length, source), 3);
});

test('getLineNumber handles empty source', () => {
  assert.equal(getLineNumber(0, ''), 1);
});

test('getLineNumber handles single line', () => {
  const source = 'single line content';
  assert.equal(getLineNumber(10, source), 1);
});

// -------------------------------------------------------------------
// Tests for extractParentContext
// -------------------------------------------------------------------

test('extractParentContext returns signature and line numbers', () => {
  const source = 'function foo() {\n  return 1;\n}';
  const node = makeNode('function', [], 0, source.length);
  const ctx = extractParentContext(node as unknown as SyntaxNode, source);

  assert.equal(ctx.signature, 'function foo() {');
  assert.equal(ctx.startLine, 1);
  assert.equal(ctx.endLine, 3);
});

test('extractParentContext handles multi-line class', () => {
  const source = 'class MyClass {\n  method1() {}\n  method2() {}\n}';
  const node = makeNode('class', [], 0, source.length);
  const ctx = extractParentContext(node as unknown as SyntaxNode, source);

  assert.equal(ctx.signature, 'class MyClass {');
  assert.equal(ctx.startLine, 1);
  assert.equal(ctx.endLine, 4);
});

// -------------------------------------------------------------------
// Tests for analyzeNodeForChunking
// -------------------------------------------------------------------

test('analyzeNodeForChunking identifies small node as single chunk', async () => {
  const source = 'const x = 1;';
  const node = makeNode('declaration', [], 0, source.length);
  const rule = {};

  const analysis = await analyzeNodeForChunking(
    node as unknown as SyntaxNode,
    source,
    rule,
    charProfile
  );

  assert.equal(analysis.isSingleChunk, true);
  assert.equal(analysis.needsSubdivision, false);
  assert.equal(analysis.size, source.length);
  assert.equal(analysis.unit, 'characters');
  assert.equal(analysis.method, 'chars');
});

test('analyzeNodeForChunking identifies large node needing subdivision', async () => {
  // Create source larger than maxChunkChars (1600)
  const source = 'x'.repeat(2000);
  const node = makeNode('class', [], 0, source.length);
  const rule = { subdivisionTypes: { class: ['method'] } };

  const analysis = await analyzeNodeForChunking(
    node as unknown as SyntaxNode,
    source,
    rule,
    charProfile
  );

  assert.equal(analysis.isSingleChunk, false);
  assert.equal(analysis.needsSubdivision, true);
  assert.equal(analysis.size, 2000);
});

test('analyzeNodeForChunking uses token counter when available', async () => {
  const source = 'const variable = "test value";'; // 30 chars = ~7.5 tokens
  const node = makeNode('declaration', [], 0, source.length);

  const analysis = await analyzeNodeForChunking(
    node as unknown as SyntaxNode,
    source,
    {},
    tokenProfile
  );

  assert.equal(analysis.method, 'tokenized');
  assert.equal(analysis.unit, 'tokens');
  // Token count should be ceil(30/4) = 8
  assert.equal(analysis.size, 8);
});

test('analyzeNodeForChunking returns subdivision candidates', async () => {
  const method1 = makeNode('method');
  const method2 = makeNode('method');
  const source = 'class Test {\n  method1() {}\n  method2() {}\n}';
  const classNode = makeNode('class_declaration', [method1, method2], 0, source.length);
  const rule = { subdivisionTypes: { class_declaration: ['method'] } };

  const analysis = await analyzeNodeForChunking(
    classNode as unknown as SyntaxNode,
    source,
    rule,
    charProfile
  );

  assert.equal(analysis.subdivisionCandidates.length, 2);
});

test('analyzeNodeForChunking calculates estimated subchunks', async () => {
  // 4000 chars with optimal of 2000 = 2 subchunks
  const source = 'x'.repeat(4000);
  const node = makeNode('class', [], 0, source.length);

  const analysis = await analyzeNodeForChunking(
    node as unknown as SyntaxNode,
    source,
    {},
    charProfile
  );

  assert.equal(analysis.estimatedSubchunks, 2);
});

// -------------------------------------------------------------------
// Tests for batchAnalyzeNodes
// -------------------------------------------------------------------

test('batchAnalyzeNodes analyzes multiple nodes', async () => {
  const source = 'function a() {}\nfunction b() {}\nfunction c() {}';
  const nodes = [
    makeNode('function', [], 0, 15),
    makeNode('function', [], 16, 31),
    makeNode('function', [], 32, 47)
  ];

  const results = await batchAnalyzeNodes(
    nodes as unknown as SyntaxNode[],
    source,
    {},
    charProfile
  );

  assert.equal(results.length, 3);
  results.forEach((result) => {
    assert.ok('node' in result);
    assert.ok('size' in result);
    assert.ok('isSingleChunk' in result);
  });
});

test('batchAnalyzeNodes uses token counter when available', async () => {
  const source = 'const a = 1;\nconst b = 2;';
  const nodes = [
    makeNode('declaration', [], 0, 12),
    makeNode('declaration', [], 13, 25)
  ];

  let tokenCounterCalls = 0;
  const countingProfile: ModelProfile = {
    ...tokenProfile,
    tokenCounter: (text: string): number => {
      tokenCounterCalls++;
      return Math.ceil(text.length / 4);
    }
  };

  const results = await batchAnalyzeNodes(
    nodes as unknown as SyntaxNode[],
    source,
    {},
    countingProfile
  );

  assert.equal(results.length, 2);
  assert.ok(tokenCounterCalls > 0);
});

test('batchAnalyzeNodes handles empty node array', async () => {
  const results = await batchAnalyzeNodes(
    [],
    'some source',
    {},
    charProfile
  );
  assert.deepEqual(results, []);
});

test('batchAnalyzeNodes finds subdivisions for each node', async () => {
  const method1 = makeNode('method');
  const method2 = makeNode('method');
  const source = 'class A { m1() {} }\nclass B { m2() {} }';
  const classA = makeNode('class', [method1], 0, 19);
  const classB = makeNode('class', [method2], 20, 39);

  const rule = { subdivisionTypes: { class: ['method'] } };
  const results = await batchAnalyzeNodes(
    [classA, classB] as unknown as SyntaxNode[],
    source,
    rule,
    charProfile
  );

  assert.equal(results[0].subdivisionCandidates.length, 1);
  assert.equal(results[1].subdivisionCandidates.length, 1);
});

test('batchAnalyzeNodes respects isSubdivision parameter', async () => {
  const source = 'const x = 1;';
  const nodes = [makeNode('declaration', [], 0, 12)];

  // Test with isSubdivision = true
  const results = await batchAnalyzeNodes(
    nodes as unknown as SyntaxNode[],
    source,
    {},
    tokenProfile,
    true
  );

  assert.equal(results.length, 1);
});

// -------------------------------------------------------------------
// Tests for yieldStatementChunks
// -------------------------------------------------------------------

test('yieldStatementChunks splits large code into chunks', async () => {
  const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}: const x = ${i};`);
  const source = lines.join('\n');
  const node = makeNode('function', [], 0, source.length);

  const chunks = await yieldStatementChunks(
    node as unknown as SyntaxNode,
    source,
    100, // maxSize in characters
    20,  // overlapSize
    charProfile
  );

  assert.ok(chunks.length > 1);
  chunks.forEach((chunk) => {
    assert.ok(chunk.code.length > 0);
    assert.ok(chunk.size > 0);
    assert.equal(chunk.unit, 'characters');
  });
});

test('yieldStatementChunks maintains 20% minimum overlap', async () => {
  const lines = Array.from({ length: 50 }, (_, i) => `line${i + 1}`);
  const source = lines.join('\n');
  const node = makeNode('function', [], 0, source.length);

  const chunks = await yieldStatementChunks(
    node as unknown as SyntaxNode,
    source,
    100,
    10,
    charProfile
  );

  // Verify overlap exists between consecutive chunks
  for (let i = 0; i < chunks.length - 1; i++) {
    const currentLines = chunks[i].code.split('\n');
    const nextLines = chunks[i + 1].code.split('\n');

    // Last line of current should appear in next chunk
    const lastLine = currentLines[currentLines.length - 1];
    const foundOverlap = nextLines.some((line) => line === lastLine);
    assert.ok(foundOverlap, `Expected overlap between chunk ${i} and ${i + 1}`);
  }
});

test('yieldStatementChunks uses token counter when profile has it', async () => {
  const source = 'line1\nline2\nline3\nline4\nline5';
  const node = makeNode('function', [], 0, source.length);

  let tokenCounterCalls = 0;
  const profile: ModelProfile = {
    ...tokenProfile,
    tokenCounter: (text: string): number => {
      tokenCounterCalls++;
      return text.length; // 1:1 mapping for test
    }
  };

  await yieldStatementChunks(
    node as unknown as SyntaxNode,
    source,
    10,
    2,
    profile
  );

  // Should call token counter once per line
  assert.equal(tokenCounterCalls, 5);
});

test('yieldStatementChunks handles single line code', async () => {
  const source = 'const x = 1;';
  const node = makeNode('declaration', [], 0, source.length);

  const chunks = await yieldStatementChunks(
    node as unknown as SyntaxNode,
    source,
    100,
    10,
    charProfile
  );

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].code, source);
});

test('yieldStatementChunks handles empty code', async () => {
  const node = makeNode('empty', [], 0, 0);

  const chunks = await yieldStatementChunks(
    node as unknown as SyntaxNode,
    '',
    100,
    10,
    charProfile
  );

  // Empty input still produces one chunk with empty content
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].code, '');
});

test('yieldStatementChunks reports correct unit for tokens', async () => {
  const source = 'line1\nline2\nline3';
  const node = makeNode('function', [], 0, source.length);

  const chunks = await yieldStatementChunks(
    node as unknown as SyntaxNode,
    source,
    20,
    4,
    tokenProfile
  );

  chunks.forEach((chunk) => {
    assert.equal(chunk.unit, 'tokens');
  });
});

test('yieldStatementChunks respects maxSize limit', async () => {
  const lines = Array.from({ length: 100 }, () => 'x'.repeat(10));
  const source = lines.join('\n');
  const node = makeNode('function', [], 0, source.length);
  const maxSize = 50;

  const chunks = await yieldStatementChunks(
    node as unknown as SyntaxNode,
    source,
    maxSize,
    10,
    charProfile
  );

  // First chunk should respect maxSize, allowing some flexibility due to line-based splitting
  chunks.slice(0, -1).forEach((chunk, i) => {
    // Allow some slack for line-based chunking
    assert.ok(
      chunk.size <= maxSize + 20,
      `Chunk ${i} exceeds maxSize: ${chunk.size} > ${maxSize + 20}`
    );
  });
});

test('yieldStatementChunks handles very long lines', async () => {
  const longLine = 'x'.repeat(500);
  const source = `${longLine}\nshort\n${longLine}`;
  const node = makeNode('function', [], 0, source.length);

  const chunks = await yieldStatementChunks(
    node as unknown as SyntaxNode,
    source,
    100,
    20,
    charProfile
  );

  // Should still produce chunks, even if individual lines exceed maxSize
  assert.ok(chunks.length >= 1);
});

test('yieldStatementChunks with async token counter', async () => {
  const source = 'line1\nline2\nline3';
  const node = makeNode('function', [], 0, source.length);

  const asyncProfile: ModelProfile = {
    ...tokenProfile,
    tokenCounter: async (text: string): Promise<number> => {
      // Simulate async operation
      await new Promise((resolve) => setTimeout(resolve, 1));
      return text.length;
    }
  };

  const chunks = await yieldStatementChunks(
    node as unknown as SyntaxNode,
    source,
    20,
    4,
    asyncProfile
  );

  assert.ok(chunks.length >= 1);
  assert.equal(chunks[0].unit, 'tokens');
});

// -------------------------------------------------------------------
// Edge case tests
// -------------------------------------------------------------------

test('handles node with very small code', async () => {
  const source = 'x';
  const node = makeNode('identifier', [], 0, 1);

  const analysis = await analyzeNodeForChunking(
    node as unknown as SyntaxNode,
    source,
    {},
    charProfile
  );

  assert.equal(analysis.isSingleChunk, true);
  assert.equal(analysis.size, 1);
});

test('handles deeply nested subdivisions', () => {
  const innermost = makeNode('method');
  const inner = makeNode('class_body', [innermost]);
  const outer = makeNode('class_body', [inner]);
  const root = makeNode('class', [outer]);
  const rule = { subdivisionTypes: { class: ['method'] } };

  const subs = findSemanticSubdivisions(root as unknown as SyntaxNode, rule);
  assert.equal(subs.length, 1);
  assert.equal(subs[0], innermost);
});

test('handles code with special characters', async () => {
  const source = 'const emoji = "\\uD83D\\uDE00";\nconst special = "<>&";';
  const node = makeNode('declarations', [], 0, source.length);

  const analysis = await analyzeNodeForChunking(
    node as unknown as SyntaxNode,
    source,
    {},
    charProfile
  );

  assert.equal(analysis.size, source.length);
});

test('handles code with Windows line endings', async () => {
  const source = 'line1\r\nline2\r\nline3';
  const node = makeNode('function', [], 0, source.length);

  const chunks = await yieldStatementChunks(
    node as unknown as SyntaxNode,
    source,
    20,
    5,
    charProfile
  );

  assert.ok(chunks.length >= 1);
});

test('handles mixed indentation', async () => {
  const source = '  line1\n\t\tline2\n    line3';
  const node = makeNode('function', [], 0, source.length);

  const chunks = await yieldStatementChunks(
    node as unknown as SyntaxNode,
    source,
    30,
    5,
    charProfile
  );

  assert.ok(chunks.length >= 1);
});
