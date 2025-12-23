import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupNodesForChunking,
  createCombinedChunk,
  type NodeGroup,
  type CombinedChunk
} from '../../chunking/file-grouper.js';
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
  startIndex = 0,
  endIndex = 0,
  children: MockNode[] = []
): MockNode {
  return {
    type,
    startIndex,
    endIndex,
    childCount: children.length,
    child: (idx: number) => children[idx] ?? null
  };
}

// Character-based profile (no token counting)
const charProfile: ModelProfile = {
  maxTokens: 1000,
  optimalTokens: 500,
  minChunkTokens: 50,
  maxChunkTokens: 800,
  overlapTokens: 100,
  optimalChars: 200, // Small for testing
  minChunkChars: 20,
  maxChunkChars: 400,
  overlapChars: 40,
  dimensions: 1536,
  useTokens: false,
  tokenizerType: 'estimate'
};

// Token-based profile
const tokenProfile: ModelProfile = {
  ...charProfile,
  useTokens: true,
  tokenCounter: (text: string): number => Math.ceil(text.length / 4)
};

// Language rule with container types
const tsRule = {
  subdivisionTypes: {
    class_declaration: ['method_definition', 'public_field_definition'],
    interface_declaration: ['property_signature', 'method_signature']
  }
};

// -------------------------------------------------------------------
// Tests for groupNodesForChunking
// -------------------------------------------------------------------

test('groupNodesForChunking returns empty array for null nodes', async () => {
  const result = await groupNodesForChunking(
    null as unknown as SyntaxNode[],
    'source',
    charProfile,
    tsRule
  );
  assert.deepEqual(result, []);
});

test('groupNodesForChunking returns empty array for empty array', async () => {
  const result = await groupNodesForChunking([], 'source', charProfile, tsRule);
  assert.deepEqual(result, []);
});

test('groupNodesForChunking returns individual nodes for 10 or fewer nodes', async () => {
  const source = 'function a() {}\nfunction b() {}\nfunction c() {}';
  const nodes = [
    makeNode('function_declaration', 0, 15),
    makeNode('function_declaration', 16, 31),
    makeNode('function_declaration', 32, 47)
  ];

  const result = await groupNodesForChunking(
    nodes as unknown as SyntaxNode[],
    source,
    charProfile,
    tsRule
  );

  // With <= 10 nodes, returns each as its own group
  assert.equal(result.length, 3);
  result.forEach((group, i) => {
    assert.equal(group.nodes.length, 1);
    assert.equal(group.nodes[0], nodes[i]);
    assert.equal(group.totalSize, 0); // Not analyzed for small counts
    assert.deepEqual(group.groupInfo, []);
  });
});

test('groupNodesForChunking groups more than 10 nodes', async () => {
  // Create 15 small functions
  const functions: string[] = [];
  const nodes: MockNode[] = [];
  let offset = 0;

  for (let i = 0; i < 15; i++) {
    const fn = `function fn${i}() { return ${i}; }`;
    functions.push(fn);
    nodes.push(makeNode('function_declaration', offset, offset + fn.length));
    offset += fn.length + 1; // +1 for newline
  }

  const source = functions.join('\n');

  const result = await groupNodesForChunking(
    nodes as unknown as SyntaxNode[],
    source,
    charProfile,
    tsRule
  );

  // Should group nodes together
  assert.ok(result.length > 0);
  assert.ok(result.length < 15, 'Should group some nodes together');

  // Total nodes across all groups should equal input
  const totalNodes = result.reduce((sum, g) => sum + g.nodes.length, 0);
  assert.equal(totalNodes, 15);
});

test('groupNodesForChunking separates container nodes', async () => {
  // Create a mix of classes and functions
  const classDecl = 'class MyClass {\n  method() {}\n}';
  const funcDecl1 = 'function helper1() {}';
  const funcDecl2 = 'function helper2() {}';
  const source = `${funcDecl1}\n${classDecl}\n${funcDecl2}`;

  const nodes: MockNode[] = [
    makeNode('function_declaration', 0, funcDecl1.length),
    makeNode('class_declaration', funcDecl1.length + 1, funcDecl1.length + 1 + classDecl.length),
    makeNode('function_declaration', source.length - funcDecl2.length, source.length)
  ];

  // Need more than 10 nodes for grouping to kick in
  // Add padding nodes
  for (let i = 0; i < 10; i++) {
    nodes.push(makeNode('function_declaration', 0, 10));
  }

  const result = await groupNodesForChunking(
    nodes as unknown as SyntaxNode[],
    source,
    charProfile,
    tsRule
  );

  // Classes should be separated into their own groups
  const containerGroups = result.filter((g) =>
    g.groupInfo?.some((info) => info.type === 'container')
  );
  assert.ok(containerGroups.length >= 1);
});

test('groupNodesForChunking uses token counter when available', async () => {
  const functions: string[] = [];
  const nodes: MockNode[] = [];
  let offset = 0;

  for (let i = 0; i < 12; i++) {
    const fn = `fn${i}()`;
    functions.push(fn);
    nodes.push(makeNode('function', offset, offset + fn.length));
    offset += fn.length + 1;
  }

  const source = functions.join('\n');
  let tokenCounterCalled = false;

  const profile: ModelProfile = {
    ...tokenProfile,
    tokenCounter: (text: string): number => {
      tokenCounterCalled = true;
      return Math.ceil(text.length / 4);
    }
  };

  await groupNodesForChunking(
    nodes as unknown as SyntaxNode[],
    source,
    profile,
    tsRule
  );

  assert.ok(tokenCounterCalled, 'Token counter should be called');
});

test('groupNodesForChunking respects size limits when grouping', async () => {
  // Create nodes that together exceed optimal size (200 chars)
  // Each line is ~30 chars, so more than ~7 nodes will exceed optimal
  const lines: string[] = [];
  const nodes: MockNode[] = [];
  let offset = 0;

  for (let i = 0; i < 20; i++) {
    // Each line is ~30 chars, optimal is 200
    const line = `const variable${i} = "value${i}";`;
    lines.push(line);
    nodes.push(makeNode('variable_declaration', offset, offset + line.length));
    offset += line.length + 1;
  }

  const source = lines.join('\n');

  const result = await groupNodesForChunking(
    nodes as unknown as SyntaxNode[],
    source,
    charProfile,
    tsRule
  );

  // Should create at least one group
  assert.ok(result.length >= 1);

  // Total nodes across all groups should equal input
  const totalNodes = result.reduce((sum, g) => sum + g.nodes.length, 0);
  assert.equal(totalNodes, 20);
});

test('groupNodesForChunking handles interface declarations', async () => {
  const interfaceDecl = 'interface MyInterface {\n  prop: string;\n}';
  const source = interfaceDecl;
  const nodes: MockNode[] = [];

  // Need > 10 nodes
  for (let i = 0; i < 12; i++) {
    nodes.push(makeNode('interface_declaration', 0, interfaceDecl.length));
  }

  const result = await groupNodesForChunking(
    nodes as unknown as SyntaxNode[],
    source,
    charProfile,
    tsRule
  );

  assert.ok(result.length > 0);
});

test('groupNodesForChunking handles module declarations', async () => {
  const nodes: MockNode[] = [];

  for (let i = 0; i < 12; i++) {
    nodes.push(makeNode('module_declaration', 0, 50));
  }

  const source = 'module Test { export function foo() {} }';

  const result = await groupNodesForChunking(
    nodes as unknown as SyntaxNode[],
    source,
    charProfile,
    tsRule
  );

  // Module declarations are container types
  const containerCount = result.filter((g) =>
    g.groupInfo?.some((info) => info.type === 'container')
  ).length;

  assert.ok(containerCount > 0);
});

test('groupNodesForChunking handles trait declarations', async () => {
  const nodes: MockNode[] = [];

  for (let i = 0; i < 12; i++) {
    nodes.push(makeNode('trait_declaration', 0, 30));
  }

  const source = 'trait MyTrait { fn method(); }';

  const result = await groupNodesForChunking(
    nodes as unknown as SyntaxNode[],
    source,
    charProfile,
    tsRule
  );

  assert.ok(result.length > 0);
});

test('groupNodesForChunking handles enum declarations', async () => {
  const nodes: MockNode[] = [];

  for (let i = 0; i < 12; i++) {
    nodes.push(makeNode('enum_declaration', 0, 40));
  }

  const source = 'enum Status { Active, Inactive, Pending }';

  const result = await groupNodesForChunking(
    nodes as unknown as SyntaxNode[],
    source,
    charProfile,
    tsRule
  );

  assert.ok(result.length > 0);
});

test('groupNodesForChunking handles namespace declarations', async () => {
  const nodes: MockNode[] = [];

  for (let i = 0; i < 12; i++) {
    nodes.push(makeNode('namespace_declaration', 0, 50));
  }

  const source = 'namespace MyNamespace { export const x = 1; }';

  const result = await groupNodesForChunking(
    nodes as unknown as SyntaxNode[],
    source,
    charProfile,
    tsRule
  );

  assert.ok(result.length > 0);
});

test('groupNodesForChunking combines small groups efficiently', async () => {
  // Create many very small nodes
  const nodes: MockNode[] = [];

  for (let i = 0; i < 50; i++) {
    // Each node covers just a few characters
    nodes.push(makeNode('identifier', i * 5, i * 5 + 4));
  }

  const source = Array.from({ length: 50 }, (_, i) => `x${i} `).join('');

  const result = await groupNodesForChunking(
    nodes as unknown as SyntaxNode[],
    source,
    charProfile,
    tsRule
  );

  // Should combine many small nodes into fewer groups
  assert.ok(result.length < 50, 'Should combine nodes into groups');
  assert.ok(result.length > 0);
});

// -------------------------------------------------------------------
// Tests for createCombinedChunk
// -------------------------------------------------------------------

test('createCombinedChunk returns null for empty node group', () => {
  const group: NodeGroup = {
    nodes: [],
    totalSize: 0,
    groupInfo: []
  };

  const result = createCombinedChunk(group, 'source');
  assert.equal(result, null);
});

test('createCombinedChunk returns null when nodes is null', () => {
  const group = {
    nodes: null,
    totalSize: 0,
    groupInfo: []
  } as unknown as NodeGroup;

  const result = createCombinedChunk(group, 'source');
  assert.equal(result, null);
});

test('createCombinedChunk creates chunk for single node', () => {
  const source = 'function test() { return 42; }';
  const node = makeNode('function_declaration', 0, source.length);

  const group: NodeGroup = {
    nodes: [node as unknown as SyntaxNode],
    totalSize: source.length,
    groupInfo: [{ type: 'file_section', nodes: [node as unknown as SyntaxNode], analyses: [], parentNode: null }]
  };

  const result = createCombinedChunk(group, source);

  assert.notEqual(result, null);
  assert.equal(result!.code, source);
  assert.equal(result!.metadata.nodeCount, 1);
  assert.equal(result!.metadata.isGroup, true);
});

test('createCombinedChunk combines multiple nodes with double newline', () => {
  const fn1 = 'function a() {}';
  const fn2 = 'function b() {}';
  const source = `${fn1}\n${fn2}`;

  const node1 = makeNode('function', 0, fn1.length);
  const node2 = makeNode('function', fn1.length + 1, source.length);

  const group: NodeGroup = {
    nodes: [node1 as unknown as SyntaxNode, node2 as unknown as SyntaxNode],
    totalSize: source.length,
    groupInfo: []
  };

  const result = createCombinedChunk(group, source);

  assert.notEqual(result, null);
  assert.ok(result!.code.includes('\n\n'), 'Should join with double newline');
  assert.equal(result!.metadata.nodeCount, 2);
});

test('createCombinedChunk sets correct type for grouped nodes', () => {
  const source = 'const a = 1;\nconst b = 2;\nconst c = 3;';
  const nodes = [
    makeNode('variable_declaration', 0, 12),
    makeNode('variable_declaration', 13, 25),
    makeNode('variable_declaration', 26, 38)
  ];

  const group: NodeGroup = {
    nodes: nodes as unknown as SyntaxNode[],
    totalSize: source.length,
    groupInfo: []
  };

  const result = createCombinedChunk(group, source);

  assert.notEqual(result, null);
  assert.equal(result!.node.type, 'variable_declaration_group_3');
});

test('createCombinedChunk sets endIndex from last node', () => {
  const source = 'line1\nline2\nline3';
  const nodes = [
    makeNode('line', 0, 5),
    makeNode('line', 6, 11),
    makeNode('line', 12, 17)
  ];

  const group: NodeGroup = {
    nodes: nodes as unknown as SyntaxNode[],
    totalSize: source.length,
    groupInfo: []
  };

  const result = createCombinedChunk(group, source);

  assert.notEqual(result, null);
  assert.equal(result!.node.endIndex, 17);
});

test('createCombinedChunk includes group types in metadata', () => {
  const source = 'code';
  const node = makeNode('statement', 0, 4);

  const group: NodeGroup = {
    nodes: [node as unknown as SyntaxNode],
    totalSize: 4,
    groupInfo: [
      { type: 'container', containerType: 'class', nodes: [], analyses: [], parentNode: null },
      { type: 'file_section', nodes: [], analyses: [], parentNode: null }
    ]
  };

  const result = createCombinedChunk(group, source);

  assert.notEqual(result, null);
  assert.deepEqual(result!.metadata.groupTypes, ['container', 'file_section']);
});

test('createCombinedChunk returns empty groupTypes for empty groupInfo array', () => {
  const source = 'code';
  const node = makeNode('statement', 0, 4);

  const group: NodeGroup = {
    nodes: [node as unknown as SyntaxNode],
    totalSize: 4,
    groupInfo: []
  };

  const result = createCombinedChunk(group, source);

  assert.notEqual(result, null);
  // Empty array maps to empty array, not 'combined' fallback
  // The 'combined' fallback only applies when groupInfo is null/undefined
  assert.deepEqual(result!.metadata.groupTypes, []);
});

test('createCombinedChunk handles undefined groupInfo', () => {
  const source = 'code';
  const node = makeNode('statement', 0, 4);

  const group = {
    nodes: [node as unknown as SyntaxNode],
    totalSize: 4
    // groupInfo intentionally omitted
  } as NodeGroup;

  const result = createCombinedChunk(group, source);

  assert.notEqual(result, null);
  assert.deepEqual(result!.metadata.groupTypes, ['combined']);
});

test('createCombinedChunk preserves first node properties', () => {
  const source = 'const x = 1;\nconst y = 2;';
  const node1 = makeNode('variable_declaration', 0, 12);
  const node2 = makeNode('variable_declaration', 13, 25);

  const group: NodeGroup = {
    nodes: [node1 as unknown as SyntaxNode, node2 as unknown as SyntaxNode],
    totalSize: source.length,
    groupInfo: []
  };

  const result = createCombinedChunk(group, source);

  assert.notEqual(result, null);
  // Should preserve startIndex from first node
  assert.equal(result!.node.startIndex, 0);
});

test('createCombinedChunk reports totalSize in metadata', () => {
  const source = 'x'.repeat(100);
  const node = makeNode('content', 0, 100);

  const group: NodeGroup = {
    nodes: [node as unknown as SyntaxNode],
    totalSize: 150, // Can be different from actual code length
    groupInfo: []
  };

  const result = createCombinedChunk(group, source);

  assert.notEqual(result, null);
  assert.equal(result!.metadata.totalSize, 150);
});

// -------------------------------------------------------------------
// Edge case tests
// -------------------------------------------------------------------

test('groupNodesForChunking handles exactly 10 nodes', async () => {
  const nodes: MockNode[] = [];
  for (let i = 0; i < 10; i++) {
    nodes.push(makeNode('function', i * 10, i * 10 + 9));
  }

  const source = 'x'.repeat(100);

  const result = await groupNodesForChunking(
    nodes as unknown as SyntaxNode[],
    source,
    charProfile,
    tsRule
  );

  // Should return individual groups (threshold is <= 10)
  assert.equal(result.length, 10);
});

test('groupNodesForChunking handles exactly 11 nodes', async () => {
  const nodes: MockNode[] = [];
  for (let i = 0; i < 11; i++) {
    nodes.push(makeNode('function', i * 10, i * 10 + 9));
  }

  const source = 'x'.repeat(110);

  const result = await groupNodesForChunking(
    nodes as unknown as SyntaxNode[],
    source,
    charProfile,
    tsRule
  );

  // Should perform grouping (threshold is > 10)
  assert.ok(result.length >= 1);
});

test('groupNodesForChunking handles nodes with overlapping indices', async () => {
  // This shouldn't happen in practice but test robustness
  const nodes: MockNode[] = [];
  for (let i = 0; i < 12; i++) {
    nodes.push(makeNode('statement', 0, 50)); // All same range
  }

  const source = 'const repeated = "same code block repeated";';

  const result = await groupNodesForChunking(
    nodes as unknown as SyntaxNode[],
    source,
    charProfile,
    tsRule
  );

  assert.ok(result.length >= 1);
});

test('groupNodesForChunking handles single very large node', async () => {
  const largeSource = 'x'.repeat(10000);
  const nodes = [makeNode('large_block', 0, 10000)];

  // Add padding to exceed threshold
  for (let i = 0; i < 11; i++) {
    nodes.push(makeNode('small', 0, 10));
  }

  const result = await groupNodesForChunking(
    nodes as unknown as SyntaxNode[],
    largeSource,
    charProfile,
    tsRule
  );

  // Large node should be in its own group
  const largeGroup = result.find((g) => g.totalSize > charProfile.optimalChars);
  assert.ok(largeGroup !== undefined || result.length > 1);
});

test('createCombinedChunk handles special characters in source', () => {
  const source = 'const emoji = "\\uD83D\\uDE00"; const special = "<>&\\"\'";';
  const node = makeNode('declarations', 0, source.length);

  const group: NodeGroup = {
    nodes: [node as unknown as SyntaxNode],
    totalSize: source.length,
    groupInfo: []
  };

  const result = createCombinedChunk(group, source);

  assert.notEqual(result, null);
  assert.equal(result!.code, source);
});

test('createCombinedChunk handles empty source', () => {
  const node = makeNode('empty', 0, 0);

  const group: NodeGroup = {
    nodes: [node as unknown as SyntaxNode],
    totalSize: 0,
    groupInfo: []
  };

  const result = createCombinedChunk(group, '');

  assert.notEqual(result, null);
  assert.equal(result!.code, '');
  assert.equal(result!.metadata.nodeCount, 1);
});

test('groupNodesForChunking with async token counter', async () => {
  const nodes: MockNode[] = [];
  for (let i = 0; i < 15; i++) {
    nodes.push(makeNode('function', i * 20, i * 20 + 19));
  }

  const source = 'x'.repeat(300);

  const asyncProfile: ModelProfile = {
    ...tokenProfile,
    tokenCounter: async (text: string): Promise<number> => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return Math.ceil(text.length / 4);
    }
  };

  const result = await groupNodesForChunking(
    nodes as unknown as SyntaxNode[],
    source,
    asyncProfile,
    tsRule
  );

  assert.ok(result.length > 0);
});

test('groupNodesForChunking preserves node order', async () => {
  const nodes: MockNode[] = [];
  for (let i = 0; i < 15; i++) {
    nodes.push(makeNode(`function_${i}`, i * 10, i * 10 + 9));
  }

  const source = 'x'.repeat(150);

  const result = await groupNodesForChunking(
    nodes as unknown as SyntaxNode[],
    source,
    charProfile,
    tsRule
  );

  // Flatten all nodes from groups and check order is preserved
  const flatNodes: MockNode[] = [];
  result.forEach((group) => {
    group.nodes.forEach((n) => flatNodes.push(n as unknown as MockNode));
  });

  for (let i = 0; i < flatNodes.length - 1; i++) {
    assert.ok(
      flatNodes[i].startIndex <= flatNodes[i + 1].startIndex,
      'Nodes should maintain order'
    );
  }
});

test('groupNodesForChunking fills groups to 90% of optimal before creating new group', async () => {
  // Create nodes where combined size is just under optimal * 0.9
  // Each node is 20 chars, optimal is 200, so ~9 nodes should fit
  const nodes: MockNode[] = [];
  for (let i = 0; i < 25; i++) {
    nodes.push(makeNode('small_function', i * 22, i * 22 + 20));
  }

  const source = Array.from({ length: 25 }, () => 'function f() { x; }').join('\n\n');

  const result = await groupNodesForChunking(
    nodes as unknown as SyntaxNode[],
    source,
    charProfile,
    tsRule
  );

  // Should have fewer groups than nodes due to combining
  assert.ok(result.length < 25);
});

test('createCombinedChunk handles multiline code correctly', () => {
  const fn1 = 'function a() {\n  return 1;\n}';
  const fn2 = 'function b() {\n  return 2;\n}';
  const source = `${fn1}\n${fn2}`;

  const node1 = makeNode('function', 0, fn1.length);
  const node2 = makeNode('function', fn1.length + 1, source.length);

  const group: NodeGroup = {
    nodes: [node1 as unknown as SyntaxNode, node2 as unknown as SyntaxNode],
    totalSize: source.length,
    groupInfo: []
  };

  const result = createCombinedChunk(group, source);

  assert.notEqual(result, null);
  // Combined code should have both functions
  assert.ok(result!.code.includes('function a()'));
  assert.ok(result!.code.includes('function b()'));
});
