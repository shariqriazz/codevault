import test from 'node:test';
import assert from 'node:assert/strict';
import { BM25Index, buildBm25Document } from '../search/bm25.js';

// ============================================================================
// buildBm25Document Tests
// ============================================================================

test('buildBm25Document returns empty string for null chunk', () => {
  const result = buildBm25Document(null, 'some code');
  assert.equal(result, '');
});

test('buildBm25Document returns empty string for null chunk with null code', () => {
  const result = buildBm25Document(null, null);
  assert.equal(result, '');
});

test('buildBm25Document combines all fields with newlines', () => {
  const chunk = {
    symbol: 'processPayment',
    file_path: 'src/payment.ts',
    codevault_description: 'Handles payment processing',
    codevault_intent: 'Process user payments'
  };
  const codeText = 'function processPayment() { ... }';

  const result = buildBm25Document(chunk, codeText);

  assert.ok(result.includes('processPayment'));
  assert.ok(result.includes('src/payment.ts'));
  assert.ok(result.includes('Handles payment processing'));
  assert.ok(result.includes('Process user payments'));
  assert.ok(result.includes('function processPayment'));
  // Verify fields are joined by newlines
  const lines = result.split('\n');
  assert.equal(lines.length, 5);
});

test('buildBm25Document handles partial fields gracefully', () => {
  const chunk = {
    symbol: 'getUser',
    file_path: 'src/user.ts'
    // codevault_description and codevault_intent are undefined
  };
  const codeText = 'function getUser() {}';

  const result = buildBm25Document(chunk, codeText);
  const lines = result.split('\n');

  assert.equal(lines.length, 3);
  assert.ok(result.includes('getUser'));
  assert.ok(result.includes('src/user.ts'));
  assert.ok(result.includes('function getUser'));
});

test('buildBm25Document filters out empty and whitespace-only strings', () => {
  const chunk = {
    symbol: 'testFunc',
    file_path: '   ',
    codevault_description: '',
    codevault_intent: '  \t  '
  };
  const codeText = 'test code';

  const result = buildBm25Document(chunk, codeText);
  const lines = result.split('\n');

  // Only 'testFunc' and 'test code' should remain
  assert.equal(lines.length, 2);
  assert.ok(result.includes('testFunc'));
  assert.ok(result.includes('test code'));
});

test('buildBm25Document handles null code text', () => {
  const chunk = {
    symbol: 'someSymbol',
    file_path: 'path/to/file.ts'
  };

  const result = buildBm25Document(chunk, null);
  const lines = result.split('\n');

  assert.equal(lines.length, 2);
  assert.ok(result.includes('someSymbol'));
  assert.ok(result.includes('path/to/file.ts'));
});

test('buildBm25Document handles empty chunk object', () => {
  const chunk = {};
  const codeText = 'some code text';

  const result = buildBm25Document(chunk, codeText);

  assert.equal(result, 'some code text');
});

// ============================================================================
// BM25Index - Constructor and addDocument Tests
// ============================================================================

test('BM25Index constructor creates empty index', () => {
  const index = new BM25Index();
  // Search on empty index should return empty array
  const results = index.search('test');
  assert.deepEqual(results, []);
});

test('BM25Index addDocument ignores empty id', () => {
  const index = new BM25Index();
  index.addDocument('', 'valid text');
  // Should not throw, and index should remain empty
  const results = index.search('valid');
  assert.deepEqual(results, []);
});

test('BM25Index addDocument ignores non-string text', () => {
  const index = new BM25Index();
  // TypeScript would catch this, but testing runtime behavior
  index.addDocument('id1', 123 as unknown as string);
  const results = index.search('123');
  assert.deepEqual(results, []);
});

test('BM25Index addDocument ignores empty text', () => {
  const index = new BM25Index();
  index.addDocument('id1', '');
  const results = index.search('anything');
  assert.deepEqual(results, []);
});

test('BM25Index addDocument ignores whitespace-only text', () => {
  const index = new BM25Index();
  index.addDocument('id1', '   \t\n  ');
  const results = index.search('anything');
  assert.deepEqual(results, []);
});

test('BM25Index addDocument prevents duplicate ids', () => {
  const index = new BM25Index();

  // Add 3 documents (minimum for consolidation)
  index.addDocument('id1', 'first document content');
  index.addDocument('id1', 'updated document content'); // duplicate - should be ignored
  index.addDocument('id2', 'second document content');
  index.addDocument('id3', 'third document content');

  const results = index.search('first');
  // Should find 'first' because duplicate was ignored
  assert.ok(results.length > 0);
  assert.ok(results.some((r) => r.id === 'id1'));
});

test('BM25Index addDocument successfully adds valid document', () => {
  const index = new BM25Index();

  index.addDocument('doc1', 'apple banana cherry');
  index.addDocument('doc2', 'banana date elderberry');
  index.addDocument('doc3', 'cherry fig grape');

  const results = index.search('banana');

  assert.ok(results.length >= 1);
  // Results should include docs with 'banana'
  const ids = results.map((r) => r.id);
  assert.ok(ids.includes('doc1') || ids.includes('doc2'));
});

// ============================================================================
// BM25Index - addDocuments Tests
// ============================================================================

test('BM25Index addDocuments handles empty array', () => {
  const index = new BM25Index();
  index.addDocuments([]);
  const results = index.search('test');
  assert.deepEqual(results, []);
});

test('BM25Index addDocuments handles undefined/null entries', () => {
  const index = new BM25Index();
  index.addDocuments([
    { id: 'id1', text: 'document one content' },
    null as unknown as { id: string; text: string },
    undefined as unknown as { id: string; text: string },
    { id: 'id2', text: 'document two content' },
    { id: 'id3', text: 'document three content' }
  ]);

  const results = index.search('document');
  assert.ok(results.length >= 1);
});

test('BM25Index addDocuments adds multiple valid documents', () => {
  const index = new BM25Index();
  index.addDocuments([
    { id: 'a', text: 'javascript framework react' },
    { id: 'b', text: 'typescript framework angular' },
    { id: 'c', text: 'python library numpy' }
  ]);

  const results = index.search('framework');
  assert.ok(results.length >= 2);
});

test('BM25Index addDocuments with default undefined parameter', () => {
  const index = new BM25Index();
  // Call with undefined to test default parameter
  index.addDocuments(undefined);
  const results = index.search('test');
  assert.deepEqual(results, []);
});

// ============================================================================
// BM25Index - consolidate Tests
// ============================================================================

test('BM25Index consolidate is idempotent', () => {
  const index = new BM25Index();
  index.addDocuments([
    { id: '1', text: 'apple orange banana' },
    { id: '2', text: 'grape lemon lime' },
    { id: '3', text: 'mango peach plum' }
  ]);

  index.consolidate();
  const results1 = index.search('apple');

  index.consolidate(); // Second call should be no-op
  const results2 = index.search('apple');

  assert.deepEqual(results1, results2);
});

test('BM25Index consolidate handles small collection without error', () => {
  const index = new BM25Index();
  index.addDocument('only1', 'single document');
  index.addDocument('only2', 'another document');

  // Should not throw - wink-bm25 has issues with very small collections
  index.consolidate();

  // Search should still work (returning empty due to MIN_DOCS_FOR_CONSOLIDATION)
  const results = index.search('document');
  assert.deepEqual(results, []);
});

// ============================================================================
// BM25Index - search Tests
// ============================================================================

test('BM25Index search returns empty array for empty query', () => {
  const index = new BM25Index();
  index.addDocuments([
    { id: '1', text: 'test content here' },
    { id: '2', text: 'more test content' },
    { id: '3', text: 'even more content' }
  ]);

  const results = index.search('');
  assert.deepEqual(results, []);
});

test('BM25Index search returns empty array for whitespace-only query', () => {
  const index = new BM25Index();
  index.addDocuments([
    { id: '1', text: 'test content here' },
    { id: '2', text: 'more test content' },
    { id: '3', text: 'even more content' }
  ]);

  const results = index.search('   \t\n  ');
  assert.deepEqual(results, []);
});

test('BM25Index search returns empty array for collection below minimum size', () => {
  const index = new BM25Index();
  index.addDocument('id1', 'test document');
  index.addDocument('id2', 'another test');
  // Only 2 documents, below MIN_DOCS_FOR_CONSOLIDATION (3)

  const results = index.search('test');
  assert.deepEqual(results, []);
});

test('BM25Index search returns results with id and score', () => {
  const index = new BM25Index();
  index.addDocuments([
    { id: 'doc1', text: 'machine learning algorithms' },
    { id: 'doc2', text: 'deep learning neural networks' },
    { id: 'doc3', text: 'natural language processing' }
  ]);

  const results = index.search('learning');

  assert.ok(results.length >= 1);
  for (const result of results) {
    assert.ok(typeof result.id === 'string');
    assert.ok(typeof result.score === 'number');
    assert.ok(result.score >= 0);
  }
});

test('BM25Index search respects limit parameter', () => {
  const index = new BM25Index();
  index.addDocuments([
    { id: 'a', text: 'common word here' },
    { id: 'b', text: 'common word there' },
    { id: 'c', text: 'common word everywhere' },
    { id: 'd', text: 'common word anywhere' },
    { id: 'e', text: 'common word somewhere' }
  ]);

  const results = index.search('common', 2);
  assert.ok(results.length <= 2);
});

test('BM25Index search uses default limit of 60', () => {
  const index = new BM25Index();
  // Add many documents
  const docs = Array.from({ length: 100 }, (_, i) => ({
    id: `doc${i}`,
    text: `document number ${i} with searchable content`
  }));
  index.addDocuments(docs);

  const results = index.search('document');
  assert.ok(results.length <= 60);
});

test('BM25Index search ranks more relevant documents higher', () => {
  const index = new BM25Index();
  index.addDocuments([
    { id: 'highly-relevant', text: 'javascript javascript javascript code' },
    { id: 'somewhat-relevant', text: 'javascript programming language' },
    { id: 'less-relevant', text: 'python programming language' }
  ]);

  const results = index.search('javascript');

  assert.ok(results.length >= 2);
  // Document with more occurrences of 'javascript' should rank higher
  const topResult = results[0];
  assert.ok(topResult.id === 'highly-relevant' || topResult.id === 'somewhat-relevant');
});

test('BM25Index search handles query with special characters', () => {
  const index = new BM25Index();
  index.addDocuments([
    { id: 'id1', text: 'function processData() returns number' },
    { id: 'id2', text: 'class UserController extends BaseController' },
    { id: 'id3', text: 'const config = { key: value }' }
  ]);

  // Query with special characters should be processed by defaultPrep
  const results = index.search('processData()');
  assert.ok(Array.isArray(results));
});

test('BM25Index search handles unicode characters', () => {
  const index = new BM25Index();
  index.addDocuments([
    { id: 'id1', text: 'fonction traitement donnees' },
    { id: 'id2', text: 'funktion verarbeitung daten' },
    { id: 'id3', text: 'function processing data' }
  ]);

  const results = index.search('traitement');
  assert.ok(Array.isArray(results));
});

// ============================================================================
// BM25Index - Integration/Edge Case Tests
// ============================================================================

test('BM25Index handles mixed case queries via defaultPrep normalization', () => {
  const index = new BM25Index();
  index.addDocuments([
    { id: 'id1', text: 'JavaScript TypeScript' },
    { id: 'id2', text: 'Python Ruby' },
    { id: 'id3', text: 'Golang Rust' }
  ]);

  const results1 = index.search('javascript');
  const results2 = index.search('JAVASCRIPT');
  const results3 = index.search('JavaScript');

  // All should find the same document due to case normalization
  assert.equal(results1.length, results2.length);
  assert.equal(results2.length, results3.length);
  if (results1.length > 0) {
    assert.equal(results1[0].id, results2[0].id);
    assert.equal(results2[0].id, results3[0].id);
  }
});

test('BM25Index workflow: add, consolidate, search', () => {
  const index = new BM25Index();

  // Add documents - use word boundaries for BM25 tokenization
  index.addDocument('chunk-1', 'async function fetch user data userId');
  index.addDocument('chunk-2', 'class user service get user by id');
  index.addDocument('chunk-3', 'const calculate tax amount rate multiply');

  // Explicit consolidation (though search auto-consolidates)
  index.consolidate();

  // Search for 'user' - should match documents with standalone 'user' token
  const results = index.search('user');

  assert.ok(results.length >= 1);
  const resultIds = results.map((r) => r.id);
  // Should find chunks mentioning 'user'
  assert.ok(resultIds.includes('chunk-1') || resultIds.includes('chunk-2'));
});
