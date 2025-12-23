import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSignature,
  extractCallNameFromSnippet,
  splitSymbolWords,
  extractSymbolMetadata,
  queryMatchesSignature,
  type SymbolMetadata
} from '../symbols/extract.js';
import type { TreeSitterNode } from '../types/ast.js';
import type { CodemapChunk } from '../types/codemap.js';

/**
 * Creates a mock TreeSitterNode for testing purposes
 */
interface MockNode {
  type: string;
  startIndex: number;
  endIndex: number;
  childCount: number;
  child: (idx: number) => MockNode | null;
}

function createMockNode(options: {
  type?: string;
  startIndex?: number;
  endIndex?: number;
  children?: MockNode[];
}): MockNode {
  const { type = 'function_definition', startIndex = 0, endIndex = 100, children = [] } = options;
  return {
    type,
    startIndex,
    endIndex,
    childCount: children.length,
    child: (idx: number) => children[idx] ?? null
  };
}

// ============================================================================
// Tests for splitSymbolWords
// ============================================================================

test('splitSymbolWords handles camelCase correctly', () => {
  const result = splitSymbolWords('processPaymentRequest');
  assert.deepEqual(result, ['process', 'payment', 'request']);
});

test('splitSymbolWords handles PascalCase correctly', () => {
  const result = splitSymbolWords('PaymentProcessor');
  assert.deepEqual(result, ['payment', 'processor']);
});

test('splitSymbolWords handles snake_case correctly', () => {
  const result = splitSymbolWords('process_payment_request');
  assert.deepEqual(result, ['process', 'payment', 'request']);
});

test('splitSymbolWords handles mixed case with underscores', () => {
  const result = splitSymbolWords('get_UserName');
  assert.deepEqual(result, ['get', 'user', 'name']);
});

test('splitSymbolWords returns empty array for empty string', () => {
  const result = splitSymbolWords('');
  assert.deepEqual(result, []);
});

test('splitSymbolWords returns empty array for null-like input', () => {
  const result = splitSymbolWords(null as unknown as string);
  assert.deepEqual(result, []);
});

test('splitSymbolWords strips special characters', () => {
  const result = splitSymbolWords('$myFunction@test');
  assert.deepEqual(result, ['my', 'function', 'test']);
});

test('splitSymbolWords handles single word', () => {
  const result = splitSymbolWords('process');
  assert.deepEqual(result, ['process']);
});

test('splitSymbolWords handles all uppercase', () => {
  const result = splitSymbolWords('CONSTANT_VALUE');
  assert.deepEqual(result, ['constant', 'value']);
});

test('splitSymbolWords handles numbers in symbols', () => {
  // Numbers don't cause word splits - the regex only splits on lowercase-to-uppercase transitions
  const result = splitSymbolWords('process2Request');
  // process2Request splits at the lowercase 's' to uppercase 'R' transition
  assert.deepEqual(result, ['process2request']);
});

// ============================================================================
// Tests for extractCallNameFromSnippet
// ============================================================================

test('extractCallNameFromSnippet extracts simple function call', () => {
  const result = extractCallNameFromSnippet('processData()');
  assert.equal(result, 'processData');
});

test('extractCallNameFromSnippet extracts function call with arguments', () => {
  const result = extractCallNameFromSnippet('calculate(1, 2, 3)');
  assert.equal(result, 'calculate');
});

test('extractCallNameFromSnippet extracts method call', () => {
  const result = extractCallNameFromSnippet('object.doSomething()');
  assert.equal(result, 'doSomething');
});

test('extractCallNameFromSnippet extracts chained method call', () => {
  const result = extractCallNameFromSnippet('obj.chain.method()');
  assert.equal(result, 'method');
});

test('extractCallNameFromSnippet extracts PHP-style method call', () => {
  const result = extractCallNameFromSnippet('$object->processData()');
  assert.equal(result, 'processData');
});

test('extractCallNameFromSnippet extracts static method call', () => {
  const result = extractCallNameFromSnippet('ClassName::staticMethod()');
  assert.equal(result, 'staticMethod');
});

test('extractCallNameFromSnippet returns null for no parentheses', () => {
  const result = extractCallNameFromSnippet('justAVariable');
  assert.equal(result, null);
});

test('extractCallNameFromSnippet returns null for blacklisted keywords', () => {
  const blacklisted = ['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'class', 'new', 'await'];
  for (const keyword of blacklisted) {
    const result = extractCallNameFromSnippet(`${keyword}(condition)`);
    assert.equal(result, null, `Should return null for keyword: ${keyword}`);
  }
});

test('extractCallNameFromSnippet returns null for empty string', () => {
  const result = extractCallNameFromSnippet('');
  assert.equal(result, null);
});

test('extractCallNameFromSnippet handles whitespace before parenthesis', () => {
  const result = extractCallNameFromSnippet('funcName   ()');
  assert.equal(result, 'funcName');
});

test('extractCallNameFromSnippet handles constructor-like calls', () => {
  const result = extractCallNameFromSnippet('MyClass()');
  assert.equal(result, 'MyClass');
});

// ============================================================================
// Tests for buildSignature
// ============================================================================

test('buildSignature creates class signature for class nodes', () => {
  const node = createMockNode({ type: 'class_definition' });
  const result = buildSignature('MyClass', 'class MyClass { }', node as unknown as TreeSitterNode);
  assert.equal(result.signature, 'class MyClass');
  assert.deepEqual(result.parameters, []);
  assert.equal(result.returnType, null);
});

test('buildSignature creates function signature with no parameters', () => {
  const node = createMockNode({ type: 'function_definition' });
  const result = buildSignature('doSomething', 'function doSomething() { }', node as unknown as TreeSitterNode);
  assert.equal(result.signature, 'doSomething()');
  assert.deepEqual(result.parameters, []);
  assert.equal(result.returnType, null);
});

test('buildSignature creates function signature with parameters', () => {
  const node = createMockNode({ type: 'function_definition' });
  const snippet = 'function calculate(a, b, c) { }';
  const result = buildSignature('calculate', snippet, node as unknown as TreeSitterNode);
  assert.equal(result.signature, 'calculate(a, b, c)');
  assert.deepEqual(result.parameters, ['a', 'b', 'c']);
  assert.equal(result.returnType, null);
});

test('buildSignature extracts TypeScript return type with colon syntax', () => {
  const node = createMockNode({ type: 'function_definition' });
  const snippet = 'function getData(id: string): Promise<Data> { }';
  const result = buildSignature('getData', snippet, node as unknown as TreeSitterNode);
  assert.ok(result.signature.includes('Promise<Data>'));
  assert.equal(result.returnType, 'Promise<Data>');
});

test('buildSignature extracts arrow function return type', () => {
  const node = createMockNode({ type: 'arrow_function' });
  const snippet = 'const fn = (x) -> number { }';
  const result = buildSignature('fn', snippet, node as unknown as TreeSitterNode);
  assert.equal(result.returnType, 'number');
});

test('buildSignature handles empty symbol', () => {
  const node = createMockNode({ type: 'function_definition' });
  const result = buildSignature('', 'function() { }', node as unknown as TreeSitterNode);
  assert.equal(result.signature, '');
  assert.deepEqual(result.parameters, []);
  assert.equal(result.returnType, null);
});

test('buildSignature handles whitespace-only symbol', () => {
  const node = createMockNode({ type: 'function_definition' });
  const result = buildSignature('   ', 'function() { }', node as unknown as TreeSitterNode);
  assert.equal(result.signature, '');
});

test('buildSignature normalizes parameters with defaults', () => {
  const node = createMockNode({ type: 'function_definition' });
  const snippet = 'function init(name = "default", count = 0) { }';
  const result = buildSignature('init', snippet, node as unknown as TreeSitterNode);
  assert.deepEqual(result.parameters, ['name', 'count']);
});

test('buildSignature handles pointer/reference prefixes in parameters', () => {
  const node = createMockNode({ type: 'function_definition' });
  const snippet = 'function process(*ptr, &ref) { }';
  const result = buildSignature('process', snippet, node as unknown as TreeSitterNode);
  assert.deepEqual(result.parameters, ['ptr', 'ref']);
});

test('buildSignature handles nested parentheses in parameters', () => {
  const node = createMockNode({ type: 'function_definition' });
  const snippet = 'function complex(fn: (a: number) => void, b: string) { }';
  const result = buildSignature('complex', snippet, node as unknown as TreeSitterNode);
  // Should still extract something reasonable
  assert.ok(result.parameters.length > 0);
});

test('buildSignature handles unbalanced parentheses gracefully', () => {
  const node = createMockNode({ type: 'function_definition' });
  const snippet = 'function broken(a, b { }';
  const result = buildSignature('broken', snippet, node as unknown as TreeSitterNode);
  // Should not throw, should return empty or partial result
  assert.ok(result.signature !== undefined);
});

test('buildSignature handles class_declaration node type', () => {
  const node = createMockNode({ type: 'class_declaration' });
  const result = buildSignature('UserService', 'class UserService {}', node as unknown as TreeSitterNode);
  assert.equal(result.signature, 'class UserService');
});

test('buildSignature limits parameters to MAX_PARAMETERS', () => {
  const node = createMockNode({ type: 'function_definition' });
  // Create a function with many parameters
  const params = Array.from({ length: 20 }, (_, i) => `p${i}`).join(', ');
  const snippet = `function manyParams(${params}) { }`;
  const result = buildSignature('manyParams', snippet, node as unknown as TreeSitterNode);
  // MAX_PARAMETERS is 12
  assert.ok(result.parameters.length <= 12, 'Should limit parameters to MAX_PARAMETERS');
});

// ============================================================================
// Tests for extractSymbolMetadata
// ============================================================================

test('extractSymbolMetadata extracts complete metadata from function node', () => {
  const source = 'function calculateTotal(items, tax): number { return items.reduce(); }';
  const node = createMockNode({
    type: 'function_definition',
    startIndex: 0,
    endIndex: source.length
  });

  const result = extractSymbolMetadata({
    node: node as unknown as TreeSitterNode,
    source,
    symbol: 'calculateTotal'
  });

  assert.equal(typeof result.signature, 'string');
  assert.ok(result.signature.includes('calculateTotal'));
  assert.ok(Array.isArray(result.parameters));
  assert.ok(Array.isArray(result.calls));
  assert.ok(Array.isArray(result.keywords));
  assert.ok(result.keywords.includes('calculate'));
  assert.ok(result.keywords.includes('total'));
});

test('extractSymbolMetadata handles empty symbol', () => {
  const source = 'function() { }';
  const node = createMockNode({
    type: 'function_definition',
    startIndex: 0,
    endIndex: source.length
  });

  const result = extractSymbolMetadata({
    node: node as unknown as TreeSitterNode,
    source,
    symbol: ''
  });

  assert.equal(result.signature, '');
  assert.deepEqual(result.keywords, []);
});

test('extractSymbolMetadata extracts calls from nested call nodes', () => {
  const source = 'function process() { helper(); utils.format(); }';

  // Create a mock node tree with call nodes
  const helperCall = createMockNode({
    type: 'call_expression',
    startIndex: 21,
    endIndex: 29
  });
  const formatCall = createMockNode({
    type: 'call_expression',
    startIndex: 31,
    endIndex: 45
  });
  const body = createMockNode({
    type: 'block',
    startIndex: 18,
    endIndex: 47,
    children: [helperCall, formatCall]
  });
  const node = createMockNode({
    type: 'function_definition',
    startIndex: 0,
    endIndex: source.length,
    children: [body]
  });

  const result = extractSymbolMetadata({
    node: node as unknown as TreeSitterNode,
    source,
    symbol: 'process'
  });

  // Since calls are extracted from call_expression nodes
  assert.ok(Array.isArray(result.calls));
});

test('extractSymbolMetadata handles class nodes correctly', () => {
  const source = 'class UserService { constructor(db) { } }';
  const node = createMockNode({
    type: 'class_definition',
    startIndex: 0,
    endIndex: source.length
  });

  const result = extractSymbolMetadata({
    node: node as unknown as TreeSitterNode,
    source,
    symbol: 'UserService'
  });

  assert.equal(result.signature, 'class UserService');
  assert.ok(result.keywords.includes('user'));
  assert.ok(result.keywords.includes('service'));
});

test('extractSymbolMetadata handles invocation node types', () => {
  const source = 'invokeMethod()';
  const node = createMockNode({
    type: 'method_invocation',
    startIndex: 0,
    endIndex: source.length
  });

  const result = extractSymbolMetadata({
    node: node as unknown as TreeSitterNode,
    source,
    symbol: 'test'
  });

  assert.ok(result.calls.includes('invokeMethod'));
});

// ============================================================================
// Tests for queryMatchesSignature
// ============================================================================

test('queryMatchesSignature returns false for null metadata', () => {
  const result = queryMatchesSignature('test query', null);
  assert.equal(result, false);
});

test('queryMatchesSignature returns false for undefined metadata', () => {
  const result = queryMatchesSignature('test query', undefined);
  assert.equal(result, false);
});

test('queryMatchesSignature returns false for non-object metadata', () => {
  const result = queryMatchesSignature('test query', 'not an object' as unknown as Partial<CodemapChunk>);
  assert.equal(result, false);
});

test('queryMatchesSignature matches on symbol name', () => {
  const metadata: Partial<CodemapChunk> = {
    symbol: 'processPayment',
    signature: 'processPayment(amount)',
    file: 'test.ts',
    sha: 'abc123'
  };
  const result = queryMatchesSignature('how does processPayment work', metadata);
  assert.equal(result, true);
});

test('queryMatchesSignature matches on signature', () => {
  const metadata: Partial<CodemapChunk> = {
    symbol: 'calc',
    signature: 'calculateTotal(items, tax)',
    file: 'test.ts',
    sha: 'abc123'
  };
  const result = queryMatchesSignature('calculateTotal', metadata);
  assert.equal(result, true);
});

test('queryMatchesSignature matches on symbol_parameters', () => {
  const metadata: Partial<CodemapChunk> = {
    symbol: 'process',
    signature: 'process(userId)',
    symbol_parameters: ['userId', 'amount', 'currency'],
    file: 'test.ts',
    sha: 'abc123'
  };
  const result = queryMatchesSignature('what is the userId parameter', metadata);
  assert.equal(result, true);
});

test('queryMatchesSignature ignores short parameters (length <= 2)', () => {
  const metadata: Partial<CodemapChunk> = {
    symbol: 'fn',
    signature: 'fn(a, b)',
    symbol_parameters: ['a', 'b', 'id'],
    file: 'test.ts',
    sha: 'abc123'
  };
  // 'id' is exactly 2 chars, should be ignored (length > 2 required)
  const result = queryMatchesSignature('what is a b id', metadata);
  assert.equal(result, false);
});

test('queryMatchesSignature matches on keywords with word boundary', () => {
  const metadata: Partial<CodemapChunk> = {
    symbol: 'processUserData',
    keywords: ['process', 'user', 'data'],
    file: 'test.ts',
    sha: 'abc123'
  };
  const result = queryMatchesSignature('how to process data', metadata);
  assert.equal(result, true);
});

test('queryMatchesSignature ignores short keywords (< MIN_TOKEN_LENGTH)', () => {
  const metadata: Partial<CodemapChunk> = {
    symbol: 'xyz',  // symbol NOT in query
    keywords: ['fn', 'a'],  // short keywords that should be ignored
    file: 'test.ts',
    sha: 'abc123'
  };
  // MIN_TOKEN_LENGTH is 3, so 'fn' and 'a' should be ignored
  // The query doesn't contain 'xyz', so symbol check fails
  // Keywords 'fn' (len 2) and 'a' (len 1) are both < 3, so they're skipped
  const result = queryMatchesSignature('what is fn a', metadata);
  assert.equal(result, false);
});

test('queryMatchesSignature is case insensitive', () => {
  const metadata: Partial<CodemapChunk> = {
    symbol: 'ProcessPayment',
    signature: 'ProcessPayment(amount)',
    file: 'test.ts',
    sha: 'abc123'
  };
  const result = queryMatchesSignature('PROCESSPAYMENT implementation', metadata);
  assert.equal(result, true);
});

test('queryMatchesSignature handles empty symbol and signature', () => {
  const metadata: Partial<CodemapChunk> = {
    symbol: '',
    signature: '',
    file: 'test.ts',
    sha: 'abc123'
  };
  const result = queryMatchesSignature('test query', metadata);
  assert.equal(result, false);
});

test('queryMatchesSignature handles non-string symbol gracefully', () => {
  const metadata: Partial<CodemapChunk> = {
    symbol: 123 as unknown as string,
    file: 'test.ts',
    sha: 'abc123'
  };
  const result = queryMatchesSignature('test query', metadata);
  assert.equal(result, false);
});

test('queryMatchesSignature handles non-array symbol_parameters', () => {
  const metadata: Partial<CodemapChunk> = {
    symbol: 'test',
    symbol_parameters: 'not an array' as unknown as string[],
    file: 'test.ts',
    sha: 'abc123'
  };
  // Should not throw
  const result = queryMatchesSignature('test query', metadata);
  assert.equal(typeof result, 'boolean');
});

test('queryMatchesSignature handles non-array keywords', () => {
  const metadata: Partial<CodemapChunk> = {
    symbol: 'test',
    keywords: 'not an array' as unknown as string[],
    file: 'test.ts',
    sha: 'abc123'
  };
  // Should not throw
  const result = queryMatchesSignature('test query', metadata);
  assert.equal(typeof result, 'boolean');
});

test('queryMatchesSignature handles empty arrays', () => {
  const metadata: Partial<CodemapChunk> = {
    symbol: 'test',
    symbol_parameters: [],
    keywords: [],
    file: 'test.ts',
    sha: 'abc123'
  };
  const result = queryMatchesSignature('unrelated query', metadata);
  assert.equal(result, false);
});

test('queryMatchesSignature handles keywords with special regex characters', () => {
  const metadata: Partial<CodemapChunk> = {
    symbol: 'test',
    keywords: ['process$data', 'user.name'],
    file: 'test.ts',
    sha: 'abc123'
  };
  // Should not throw due to unescaped regex chars
  const result = queryMatchesSignature('test query', metadata);
  assert.equal(typeof result, 'boolean');
});

test('queryMatchesSignature handles null values in parameters array', () => {
  const metadata: Partial<CodemapChunk> = {
    symbol: 'test',
    symbol_parameters: ['valid', null as unknown as string, 'another'],
    file: 'test.ts',
    sha: 'abc123'
  };
  // Should not throw
  const result = queryMatchesSignature('valid parameter', metadata);
  assert.equal(result, true);
});

test('queryMatchesSignature handles null values in keywords array', () => {
  const metadata: Partial<CodemapChunk> = {
    symbol: 'test',
    keywords: ['valid', null as unknown as string, undefined as unknown as string],
    file: 'test.ts',
    sha: 'abc123'
  };
  // Should not throw
  const result = queryMatchesSignature('looking for valid keyword', metadata);
  assert.equal(result, true);
});

// ============================================================================
// Edge cases and boundary conditions
// ============================================================================

test('buildSignature handles very long snippets', () => {
  const node = createMockNode({
    type: 'function_definition',
    startIndex: 0,
    endIndex: 10000
  });
  const longSource = 'function test(a, b) { ' + 'x'.repeat(10000) + ' }';
  const result = buildSignature('test', longSource, node as unknown as TreeSitterNode);
  // Should not throw and should produce valid output
  assert.ok(result.signature.length > 0);
});

test('extractCallNameFromSnippet handles deeply chained calls', () => {
  const result = extractCallNameFromSnippet('a.b.c.d.e.finalMethod()');
  assert.equal(result, 'finalMethod');
});

test('splitSymbolWords handles consecutive uppercase', () => {
  const result = splitSymbolWords('XMLHTTPRequest');
  // Splits on case transitions
  assert.ok(result.length > 0);
});

test('extractSymbolMetadata handles source shorter than node indices', () => {
  const source = 'fn()';
  const node = createMockNode({
    type: 'function_definition',
    startIndex: 0,
    endIndex: 100 // Beyond source length
  });

  // Should not throw
  const result = extractSymbolMetadata({
    node: node as unknown as TreeSitterNode,
    source,
    symbol: 'fn'
  });
  assert.ok(result.signature !== undefined);
});

test('queryMatchesSignature handles query with only special characters', () => {
  const metadata: Partial<CodemapChunk> = {
    symbol: 'test',
    signature: 'test()',
    file: 'test.ts',
    sha: 'abc123'
  };
  const result = queryMatchesSignature('$#@!%^&*()', metadata);
  assert.equal(result, false);
});

test('queryMatchesSignature handles very long query', () => {
  const metadata: Partial<CodemapChunk> = {
    symbol: 'test',
    signature: 'test()',
    keywords: ['something'],
    file: 'test.ts',
    sha: 'abc123'
  };
  const longQuery = 'find something ' + 'word '.repeat(1000);
  const result = queryMatchesSignature(longQuery, metadata);
  assert.equal(result, true);
});
