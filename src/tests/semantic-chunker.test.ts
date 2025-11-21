import test from 'node:test';
import assert from 'node:assert/strict';
import { findSemanticSubdivisions, yieldStatementChunks } from '../chunking/semantic-chunker.js';
import type { ModelProfile } from '../providers/base.js';
import type { TreeSitterNode } from '../types/ast.js';
import type { LanguageRule } from '../languages/rules.js';

const dummyProfile: ModelProfile = {
  maxTokens: 100,
  optimalTokens: 50,
  minChunkTokens: 10,
  maxChunkTokens: 80,
  overlapTokens: 10,
  optimalChars: 100,
  minChunkChars: 10,
  maxChunkChars: 80,
  overlapChars: 10,
  dimensions: 0,
  useTokens: false,
  tokenizerType: 'estimate'
};

function makeNode(type: string, children: any[] = [], startIndex = 0, endIndex = 0): { type: string; startIndex: number; endIndex: number; childCount: number; child: (idx: number) => any } {
  return {
    type,
    startIndex,
    endIndex,
    childCount: children.length,
    child: (idx: number): any => children[idx] ?? null
  };
}

test('findSemanticSubdivisions returns direct subdivision types', () => {
  const child = makeNode('child');
  const parent = makeNode('root', [child]);
  const rule = { subdivisionTypes: { root: ['child'] } } as unknown as LanguageRule;

  const subs = findSemanticSubdivisions(parent as TreeSitterNode, rule);
  assert.equal(subs.length, 1);
  assert.equal(subs[0], child);
});

test('yieldStatementChunks preserves configured overlap', async () => {
  const source = ['line1', 'line2', 'line3', 'line4', 'line5'].join('\n');
  const node = makeNode('function', [], 0, source.length);

  const maxSize = 20; // characters
  const overlapSize = 4; // characters to overlap

  const chunks = await yieldStatementChunks(node as TreeSitterNode, source, maxSize, overlapSize, dummyProfile);
  assert.ok(chunks.length > 1, 'should split into multiple chunks');

  // Verify overlap by checking that the last line of first chunk appears at start of second chunk
  const firstChunkLines = chunks[0].code.split('\n');
  const secondChunkLines = chunks[1].code.split('\n');
  const lastLineFirst = firstChunkLines[firstChunkLines.length - 1];
  assert.equal(lastLineFirst, secondChunkLines[0]);
});

test('yieldStatementChunks batches token counting once per line', async () => {
  const source = ['a', 'bb', 'ccc', 'dddd', 'ee'].join('\n');
  const node = makeNode('function', [], 0, source.length);

  let tokenCounterCalls = 0;
  const tokenCounter = (text: string): number => {
    tokenCounterCalls++;
    return text.length;
  };

  const tokenProfile: ModelProfile = {
    ...dummyProfile,
    useTokens: true,
    tokenCounter
  };

  const maxSize = 5; // forces multiple chunks when using token sizes
  const overlapSize = 2;

  await yieldStatementChunks(node as TreeSitterNode, source, maxSize, overlapSize, tokenProfile);

  assert.equal(tokenCounterCalls, source.split('\n').length);
});
