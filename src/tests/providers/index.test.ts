import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmbeddingProvider,
  EmbeddingProvider,
  OpenAIProvider,
  MockEmbeddingProvider
} from '../../providers/index.js';

// ============= Re-exports tests =============
test('index.ts re-exports EmbeddingProvider base class', () => {
  assert.ok(EmbeddingProvider, 'EmbeddingProvider should be exported');
  assert.equal(typeof EmbeddingProvider, 'function');
});

test('index.ts re-exports OpenAIProvider', () => {
  assert.ok(OpenAIProvider, 'OpenAIProvider should be exported');
  assert.equal(typeof OpenAIProvider, 'function');
});

test('index.ts re-exports MockEmbeddingProvider', () => {
  assert.ok(MockEmbeddingProvider, 'MockEmbeddingProvider should be exported');
  assert.equal(typeof MockEmbeddingProvider, 'function');
});

// ============= createEmbeddingProvider factory tests =============
test('createEmbeddingProvider returns OpenAIProvider for "openai"', () => {
  const provider = createEmbeddingProvider('openai');
  assert.ok(provider instanceof OpenAIProvider);
  assert.equal(provider.getName(), 'OpenAI');
});

test('createEmbeddingProvider returns OpenAIProvider for "auto"', () => {
  const provider = createEmbeddingProvider('auto');
  assert.ok(provider instanceof OpenAIProvider);
});

test('createEmbeddingProvider returns MockEmbeddingProvider for "mock"', () => {
  const provider = createEmbeddingProvider('mock');
  assert.ok(provider instanceof MockEmbeddingProvider);
  assert.equal(provider.getName(), 'mock');
});

test('createEmbeddingProvider returns MockEmbeddingProvider for "test"', () => {
  const provider = createEmbeddingProvider('test');
  assert.ok(provider instanceof MockEmbeddingProvider);
  assert.equal(provider.getName(), 'mock');
});

test('createEmbeddingProvider returns OpenAIProvider for unknown provider', () => {
  const provider = createEmbeddingProvider('unknown-provider');
  assert.ok(provider instanceof OpenAIProvider);
});

test('createEmbeddingProvider is case-insensitive', () => {
  const provider1 = createEmbeddingProvider('MOCK');
  const provider2 = createEmbeddingProvider('Mock');
  const provider3 = createEmbeddingProvider('mock');

  assert.ok(provider1 instanceof MockEmbeddingProvider);
  assert.ok(provider2 instanceof MockEmbeddingProvider);
  assert.ok(provider3 instanceof MockEmbeddingProvider);
});

test('createEmbeddingProvider with no arguments uses defaults', () => {
  const provider = createEmbeddingProvider();
  assert.ok(provider instanceof OpenAIProvider);
});

// ============= Options passing tests =============
test('createEmbeddingProvider passes options to OpenAIProvider', () => {
  const provider = createEmbeddingProvider('openai', {
    model: 'text-embedding-3-small',
    dimensions: 512
  });

  assert.ok(provider instanceof OpenAIProvider);
  assert.equal(provider.getModelName(), 'text-embedding-3-small');
  assert.equal(provider.getDimensions(), 512);
});

test('createEmbeddingProvider passes dimensions to MockEmbeddingProvider', () => {
  const provider = createEmbeddingProvider('mock', { dimensions: 128 });

  assert.ok(provider instanceof MockEmbeddingProvider);
  assert.equal(provider.getDimensions(), 128);
});

test('createEmbeddingProvider uses default dimensions for mock when not specified', () => {
  const provider = createEmbeddingProvider('mock');
  assert.equal(provider.getDimensions(), 32);
});

test('createEmbeddingProvider uses default dimensions for mock when options empty', () => {
  const provider = createEmbeddingProvider('mock', {});
  assert.equal(provider.getDimensions(), 32);
});

test('createEmbeddingProvider handles invalid dimensions for mock (non-finite)', () => {
  const provider = createEmbeddingProvider('mock', { dimensions: Infinity });
  assert.equal(provider.getDimensions(), 32); // Falls back to default
});

test('createEmbeddingProvider handles invalid dimensions for mock (NaN)', () => {
  const provider = createEmbeddingProvider('mock', { dimensions: NaN });
  assert.equal(provider.getDimensions(), 32); // Falls back to default
});

test('createEmbeddingProvider handles negative dimensions for mock', () => {
  const provider = createEmbeddingProvider('mock', { dimensions: -10 });
  // Floors to 1 minimum
  assert.equal(provider.getDimensions(), 1);
});

test('createEmbeddingProvider handles zero dimensions for mock', () => {
  const provider = createEmbeddingProvider('mock', { dimensions: 0 });
  // Floors to 1 minimum
  assert.equal(provider.getDimensions(), 1);
});

test('createEmbeddingProvider handles fractional dimensions for mock', () => {
  const provider = createEmbeddingProvider('mock', { dimensions: 64.7 });
  // Floors the value
  assert.equal(provider.getDimensions(), 64);
});

// ============= Rate limit options tests =============
test('createEmbeddingProvider passes rate limit options to OpenAIProvider', () => {
  const provider = createEmbeddingProvider('openai', { rpm: 200, tpm: 100000 });

  assert.ok(provider instanceof OpenAIProvider);
  const stats = provider.rateLimiter?.getStats();
  assert.ok(stats, 'Rate limiter should exist');
  assert.equal(stats.rpm, 200);
  assert.equal(stats.tpm, 100000);
});

test('createEmbeddingProvider passes null rate limits correctly', () => {
  const provider = createEmbeddingProvider('openai', { rpm: null, tpm: null });

  assert.ok(provider instanceof OpenAIProvider);
  const stats = provider.rateLimiter?.getStats();
  assert.ok(stats, 'Rate limiter should exist');
  // When explicitly set to null, should use null
  assert.equal(stats.rpm, null);
  assert.equal(stats.tpm, null);
});

// ============= API key and base URL tests =============
test('createEmbeddingProvider passes apiKey to OpenAIProvider', () => {
  // We can't easily verify the apiKey was passed, but we can verify no error
  const provider = createEmbeddingProvider('openai', { apiKey: 'test-api-key' });
  assert.ok(provider instanceof OpenAIProvider);
});

test('createEmbeddingProvider passes baseUrl to OpenAIProvider', () => {
  const provider = createEmbeddingProvider('openai', {
    baseUrl: 'https://custom-api.example.com/v1'
  });
  assert.ok(provider instanceof OpenAIProvider);
});

// ============= Routing config tests =============
test('createEmbeddingProvider passes routing config to OpenAIProvider', () => {
  const provider = createEmbeddingProvider('openai', {
    routing: { order: ['first', 'second'] }
  });
  assert.ok(provider instanceof OpenAIProvider);
});

// ============= Provider interface tests =============
test('createEmbeddingProvider returns objects with EmbeddingProvider interface', async () => {
  const openaiProvider = createEmbeddingProvider('openai');
  const mockProvider = createEmbeddingProvider('mock');

  // Both should have the required methods
  assert.equal(typeof openaiProvider.generateEmbedding, 'function');
  assert.equal(typeof openaiProvider.generateEmbeddings, 'function');
  assert.equal(typeof openaiProvider.getDimensions, 'function');
  assert.equal(typeof openaiProvider.getName, 'function');

  assert.equal(typeof mockProvider.generateEmbedding, 'function');
  assert.equal(typeof mockProvider.generateEmbeddings, 'function');
  assert.equal(typeof mockProvider.getDimensions, 'function');
  assert.equal(typeof mockProvider.getName, 'function');
});

test('createEmbeddingProvider returns functional providers', async () => {
  const mockProvider = createEmbeddingProvider('mock', { dimensions: 16 });

  const embedding = await mockProvider.generateEmbedding('test');
  assert.equal(embedding.length, 16);

  const embeddings = await mockProvider.generateEmbeddings(['a', 'b']);
  assert.equal(embeddings.length, 2);
});

// ============= Edge cases =============
test('createEmbeddingProvider handles empty string provider name', () => {
  const provider = createEmbeddingProvider('');
  // Empty string goes to default case which returns OpenAIProvider
  assert.ok(provider instanceof OpenAIProvider);
});

test('createEmbeddingProvider handles whitespace provider name', () => {
  const provider = createEmbeddingProvider('  mock  '.trim());
  assert.ok(provider instanceof MockEmbeddingProvider);
});

test('createEmbeddingProvider handles uppercase TEST', () => {
  const provider = createEmbeddingProvider('TEST');
  assert.ok(provider instanceof MockEmbeddingProvider);
});

test('createEmbeddingProvider handles mixed case Auto', () => {
  const provider = createEmbeddingProvider('Auto');
  assert.ok(provider instanceof OpenAIProvider);
});

// ============= Multiple provider instances =============
test('createEmbeddingProvider creates independent instances', () => {
  const provider1 = createEmbeddingProvider('mock', { dimensions: 32 });
  const provider2 = createEmbeddingProvider('mock', { dimensions: 64 });

  assert.equal(provider1.getDimensions(), 32);
  assert.equal(provider2.getDimensions(), 64);
});

test('createEmbeddingProvider OpenAI instances are independent', () => {
  const provider1 = createEmbeddingProvider('openai', { model: 'text-embedding-3-small' });
  const provider2 = createEmbeddingProvider('openai', { model: 'text-embedding-3-large' });

  assert.equal(provider1.getModelName?.(), 'text-embedding-3-small');
  assert.equal(provider2.getModelName?.(), 'text-embedding-3-large');
});

// ============= All options together =============
test('createEmbeddingProvider handles all options together for OpenAI', () => {
  const provider = createEmbeddingProvider('openai', {
    apiKey: 'test-key',
    baseUrl: 'https://api.example.com',
    model: 'custom-model',
    dimensions: 768,
    maxTokens: 4096,
    rpm: 50,
    tpm: 10000,
    routing: { order: ['provider1'] }
  });

  assert.ok(provider instanceof OpenAIProvider);
  assert.equal(provider.getModelName(), 'custom-model');
  assert.equal(provider.getDimensions(), 768);
});
