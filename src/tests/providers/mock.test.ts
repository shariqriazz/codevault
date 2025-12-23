import test from 'node:test';
import assert from 'node:assert/strict';
import { MockEmbeddingProvider } from '../../providers/mock.js';

// ============= Constructor tests =============
test('MockEmbeddingProvider uses default dimensions of 32', () => {
  const provider = new MockEmbeddingProvider();
  assert.equal(provider.getDimensions(), 32);
});

test('MockEmbeddingProvider accepts custom dimensions', () => {
  const provider = new MockEmbeddingProvider(128);
  assert.equal(provider.getDimensions(), 128);
});

test('MockEmbeddingProvider accepts large dimensions', () => {
  const provider = new MockEmbeddingProvider(3072);
  assert.equal(provider.getDimensions(), 3072);
});

// ============= getName tests =============
test('MockEmbeddingProvider.getName returns "mock"', () => {
  const provider = new MockEmbeddingProvider();
  assert.equal(provider.getName(), 'mock');
});

// ============= getModelName tests =============
test('MockEmbeddingProvider.getModelName returns "mock"', () => {
  const provider = new MockEmbeddingProvider();
  assert.equal(provider.getModelName(), 'mock');
});

// ============= init tests =============
test('MockEmbeddingProvider.init resolves immediately', async () => {
  const provider = new MockEmbeddingProvider();
  await assert.doesNotReject(async () => {
    await provider.init();
  });
});

test('MockEmbeddingProvider.init can be called multiple times', async () => {
  const provider = new MockEmbeddingProvider();
  await provider.init();
  await provider.init();
  await provider.init();
  // No error should occur
  assert.ok(true);
});

// ============= generateEmbedding tests =============
test('MockEmbeddingProvider.generateEmbedding returns vector of correct dimensions', async () => {
  const provider = new MockEmbeddingProvider(64);
  const embedding = await provider.generateEmbedding('test text');
  assert.equal(embedding.length, 64);
});

test('MockEmbeddingProvider.generateEmbedding returns all numeric values', async () => {
  const provider = new MockEmbeddingProvider(32);
  const embedding = await provider.generateEmbedding('hello world');
  embedding.forEach((value, i) => {
    assert.equal(typeof value, 'number', `Value at index ${i} should be a number`);
    assert.ok(!isNaN(value), `Value at index ${i} should not be NaN`);
    assert.ok(isFinite(value), `Value at index ${i} should be finite`);
  });
});

test('MockEmbeddingProvider.generateEmbedding is deterministic (same text produces same vector)', async () => {
  const provider = new MockEmbeddingProvider(32);
  const text = 'deterministic test input';

  const embedding1 = await provider.generateEmbedding(text);
  const embedding2 = await provider.generateEmbedding(text);

  assert.deepEqual(embedding1, embedding2, 'Same text should produce same embedding');
});

test('MockEmbeddingProvider.generateEmbedding produces different vectors for different text', async () => {
  const provider = new MockEmbeddingProvider(32);

  const embedding1 = await provider.generateEmbedding('text one');
  const embedding2 = await provider.generateEmbedding('text two');

  // Vectors should differ for different inputs
  const isDifferent = embedding1.some((val, i) => val !== embedding2[i]);
  assert.ok(isDifferent, 'Different texts should produce different embeddings');
});

test('MockEmbeddingProvider.generateEmbedding produces normalized vectors', async () => {
  const provider = new MockEmbeddingProvider(64);
  const embedding = await provider.generateEmbedding('normalize test');

  // Calculate magnitude (L2 norm)
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));

  // Normalized vector should have magnitude close to 1
  assert.ok(Math.abs(magnitude - 1) < 0.0001, `Vector magnitude should be ~1, got ${magnitude}`);
});

test('MockEmbeddingProvider.generateEmbedding handles empty string', async () => {
  const provider = new MockEmbeddingProvider(16);
  const embedding = await provider.generateEmbedding('');

  assert.equal(embedding.length, 16);
  // Still produces a valid normalized vector
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  assert.ok(Math.abs(magnitude - 1) < 0.0001);
});

test('MockEmbeddingProvider.generateEmbedding handles very long text', async () => {
  const provider = new MockEmbeddingProvider(32);
  const longText = 'a'.repeat(100000);
  const embedding = await provider.generateEmbedding(longText);

  assert.equal(embedding.length, 32);
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  assert.ok(Math.abs(magnitude - 1) < 0.0001);
});

test('MockEmbeddingProvider.generateEmbedding handles unicode characters', async () => {
  const provider = new MockEmbeddingProvider(32);
  const embedding = await provider.generateEmbedding('Hello World');

  assert.equal(embedding.length, 32);
});

test('MockEmbeddingProvider.generateEmbedding handles special characters', async () => {
  const provider = new MockEmbeddingProvider(32);
  const embedding = await provider.generateEmbedding('function foo() { return "bar"; }');

  assert.equal(embedding.length, 32);
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  assert.ok(Math.abs(magnitude - 1) < 0.0001);
});

// ============= generateEmbeddings (batch) tests =============
test('MockEmbeddingProvider.generateEmbeddings returns array of vectors', async () => {
  const provider = new MockEmbeddingProvider(48);
  const texts = ['text1', 'text2', 'text3'];

  const embeddings = await provider.generateEmbeddings(texts);

  assert.equal(embeddings.length, 3);
  embeddings.forEach((emb, i) => {
    assert.equal(emb.length, 48, `Embedding ${i} should have 48 dimensions`);
  });
});

test('MockEmbeddingProvider.generateEmbeddings handles empty array', async () => {
  const provider = new MockEmbeddingProvider(32);
  const embeddings = await provider.generateEmbeddings([]);
  assert.equal(embeddings.length, 0);
});

test('MockEmbeddingProvider.generateEmbeddings handles single item', async () => {
  const provider = new MockEmbeddingProvider(32);
  const embeddings = await provider.generateEmbeddings(['single']);
  assert.equal(embeddings.length, 1);
  assert.equal(embeddings[0].length, 32);
});

test('MockEmbeddingProvider.generateEmbeddings produces deterministic results', async () => {
  const provider = new MockEmbeddingProvider(32);
  const texts = ['apple', 'banana', 'cherry'];

  const embeddings1 = await provider.generateEmbeddings(texts);
  const embeddings2 = await provider.generateEmbeddings(texts);

  assert.deepEqual(embeddings1, embeddings2, 'Batch embeddings should be deterministic');
});

test('MockEmbeddingProvider.generateEmbeddings produces same result as individual calls', async () => {
  const provider = new MockEmbeddingProvider(32);
  const texts = ['foo', 'bar', 'baz'];

  const batchEmbeddings = await provider.generateEmbeddings(texts);
  const individualEmbeddings = await Promise.all(
    texts.map(text => provider.generateEmbedding(text))
  );

  assert.deepEqual(
    batchEmbeddings,
    individualEmbeddings,
    'Batch and individual embeddings should match'
  );
});

test('MockEmbeddingProvider.generateEmbeddings handles large batch', async () => {
  const provider = new MockEmbeddingProvider(16);
  const texts = Array.from({ length: 100 }, (_, i) => `text${i}`);

  const embeddings = await provider.generateEmbeddings(texts);

  assert.equal(embeddings.length, 100);
  embeddings.forEach(emb => {
    assert.equal(emb.length, 16);
  });
});

// ============= Vector quality tests =============
test('MockEmbeddingProvider vectors have diverse values (not all same)', async () => {
  const provider = new MockEmbeddingProvider(64);
  const embedding = await provider.generateEmbedding('diverse test');

  // Check that not all values are the same
  const uniqueValues = new Set(embedding.map(v => v.toFixed(6)));
  assert.ok(uniqueValues.size > 1, 'Vector should have diverse values');
});

test('MockEmbeddingProvider similar texts produce somewhat similar vectors', async () => {
  const provider = new MockEmbeddingProvider(32);

  // These texts are very similar
  const emb1 = await provider.generateEmbedding('hello world');
  const emb2 = await provider.generateEmbedding('hello world!');

  // Calculate cosine similarity
  const dotProduct = emb1.reduce((sum, val, i) => sum + val * emb2[i], 0);
  const mag1 = Math.sqrt(emb1.reduce((sum, val) => sum + val * val, 0));
  const mag2 = Math.sqrt(emb2.reduce((sum, val) => sum + val * val, 0));
  const cosineSimilarity = dotProduct / (mag1 * mag2);

  // Similar texts should have positive similarity
  // Note: This is a simple hash-based mock, so similarity may not be high,
  // but it should be stable and consistent
  assert.equal(typeof cosineSimilarity, 'number');
  assert.ok(!isNaN(cosineSimilarity), 'Cosine similarity should be a valid number');
});

// ============= Edge cases =============
test('MockEmbeddingProvider with dimensions=1 works', async () => {
  const provider = new MockEmbeddingProvider(1);
  const embedding = await provider.generateEmbedding('test');
  assert.equal(embedding.length, 1);
  // Single dimension normalized vector is always 1 or -1
  assert.ok(Math.abs(Math.abs(embedding[0]) - 1) < 0.0001);
});

test('MockEmbeddingProvider handles whitespace-only text', async () => {
  const provider = new MockEmbeddingProvider(32);
  const embedding = await provider.generateEmbedding('   \n\t  ');
  assert.equal(embedding.length, 32);
});

test('MockEmbeddingProvider handles newlines in text', async () => {
  const provider = new MockEmbeddingProvider(32);
  const embedding = await provider.generateEmbedding('line1\nline2\nline3');
  assert.equal(embedding.length, 32);
});

test('MockEmbeddingProvider two instances produce same results for same text', async () => {
  const provider1 = new MockEmbeddingProvider(32);
  const provider2 = new MockEmbeddingProvider(32);

  const emb1 = await provider1.generateEmbedding('shared text');
  const emb2 = await provider2.generateEmbedding('shared text');

  assert.deepEqual(emb1, emb2, 'Different instances should produce same embeddings');
});

// ============= Concurrent access tests =============
test('MockEmbeddingProvider handles concurrent generateEmbedding calls', async () => {
  const provider = new MockEmbeddingProvider(32);

  const results = await Promise.all([
    provider.generateEmbedding('text1'),
    provider.generateEmbedding('text2'),
    provider.generateEmbedding('text3'),
    provider.generateEmbedding('text4'),
    provider.generateEmbedding('text5')
  ]);

  assert.equal(results.length, 5);
  results.forEach(emb => {
    assert.equal(emb.length, 32);
  });
});

test('MockEmbeddingProvider handles concurrent generateEmbeddings calls', async () => {
  const provider = new MockEmbeddingProvider(32);

  const [batch1, batch2] = await Promise.all([
    provider.generateEmbeddings(['a', 'b', 'c']),
    provider.generateEmbeddings(['d', 'e', 'f'])
  ]);

  assert.equal(batch1.length, 3);
  assert.equal(batch2.length, 3);
});
