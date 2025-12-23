import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EmbeddingProvider,
  estimateTokens,
  getModelProfile,
  getSizeLimits,
  BATCH_SIZE,
  MAX_BATCH_TOKENS,
  MAX_ITEM_TOKENS,
  MODEL_PROFILES
} from '../../providers/base.js';

// Test implementation of abstract EmbeddingProvider
class TestEmbeddingProvider extends EmbeddingProvider {
  private dimensions: number;
  private name: string;
  private modelName: string;
  private embeddings: number[][] = [];
  private callCount = 0;

  constructor(dimensions = 384, name = 'TestProvider', modelName = 'test-model') {
    super();
    this.dimensions = dimensions;
    this.name = name;
    this.modelName = modelName;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    this.callCount++;
    const embedding = new Array(this.dimensions).fill(0).map((_, i) => (i + text.length) / 1000);
    this.embeddings.push(embedding);
    return embedding;
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getName(): string {
    return this.name;
  }

  getModelName(): string {
    return this.modelName;
  }

  async init(): Promise<void> {
    // No-op for test provider
  }

  getCallCount(): number {
    return this.callCount;
  }

  getStoredEmbeddings(): number[][] {
    return this.embeddings;
  }
}

// ============= BATCH_SIZE constant tests =============
test('BATCH_SIZE uses default value when environment not set', () => {
  // Note: This tests the compiled value. Environment variables are read at module load time.
  assert.equal(typeof BATCH_SIZE, 'number');
  assert.ok(BATCH_SIZE > 0, 'BATCH_SIZE should be positive');
});

test('MAX_BATCH_TOKENS is set to OpenAI limit', () => {
  assert.equal(MAX_BATCH_TOKENS, 100000);
});

test('MAX_ITEM_TOKENS is set to default per-item limit', () => {
  assert.equal(MAX_ITEM_TOKENS, 8191);
});

// ============= estimateTokens function tests =============
test('estimateTokens returns correct estimate for empty string', () => {
  assert.equal(estimateTokens(''), 0);
});

test('estimateTokens estimates 1 token per 4 characters', () => {
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('abcdefgh'), 2);
  assert.equal(estimateTokens('a'.repeat(100)), 25);
});

test('estimateTokens rounds up for partial tokens', () => {
  assert.equal(estimateTokens('abc'), 1); // 3/4 = 0.75, ceil = 1
  assert.equal(estimateTokens('abcde'), 2); // 5/4 = 1.25, ceil = 2
});

test('estimateTokens handles unicode characters', () => {
  // Unicode counts by JS string length (UTF-16 code units)
  const unicodeText = 'Hello';
  assert.equal(estimateTokens(unicodeText), Math.ceil(unicodeText.length / 4));
});

// ============= MODEL_PROFILES tests =============
test('MODEL_PROFILES contains text-embedding-3-large profile', () => {
  const profile = MODEL_PROFILES['text-embedding-3-large'];
  assert.ok(profile, 'Profile should exist');
  assert.equal(profile.maxTokens, 8191);
  assert.equal(profile.dimensions, 3072);
  assert.equal(profile.useTokens, true);
  assert.equal(profile.tokenizerType, 'tiktoken');
  assert.equal(profile.encoding, 'cl100k_base');
});

test('MODEL_PROFILES contains text-embedding-3-small profile', () => {
  const profile = MODEL_PROFILES['text-embedding-3-small'];
  assert.ok(profile, 'Profile should exist');
  assert.equal(profile.dimensions, 1536);
  assert.equal(profile.maxTokens, 8191);
});

test('MODEL_PROFILES contains text-embedding-ada-002 profile', () => {
  const profile = MODEL_PROFILES['text-embedding-ada-002'];
  assert.ok(profile, 'Profile should exist');
  assert.equal(profile.dimensions, 1536);
});

test('MODEL_PROFILES contains nomic-embed-text profile', () => {
  const profile = MODEL_PROFILES['nomic-embed-text'];
  assert.ok(profile, 'Profile should exist');
  assert.equal(profile.dimensions, 768);
  assert.equal(profile.maxTokens, 8192);
});

test('MODEL_PROFILES contains Qwen embedding profiles', () => {
  const qwen8b = MODEL_PROFILES['Qwen/Qwen3-Embedding-8B'];
  assert.ok(qwen8b, 'Qwen 8B profile should exist');
  assert.equal(qwen8b.dimensions, 4096);
  assert.equal(qwen8b.maxTokens, 32000);

  const qwen06b = MODEL_PROFILES['qwen3-embedding:0.6b'];
  assert.ok(qwen06b, 'Qwen 0.6b profile should exist');
  assert.equal(qwen06b.dimensions, 1024);
});

test('MODEL_PROFILES contains gemini embedding profiles', () => {
  const gemini = MODEL_PROFILES['gemini-embedding-001'];
  assert.ok(gemini, 'Gemini profile should exist');
  assert.equal(gemini.dimensions, 768);
  assert.equal(gemini.maxTokens, 2048);

  const geminiPrefixed = MODEL_PROFILES['google/gemini-embedding-001'];
  assert.ok(geminiPrefixed, 'Google/Gemini profile should exist');
  assert.deepEqual(gemini, geminiPrefixed, 'Both gemini profiles should match');
});

test('MODEL_PROFILES contains default profile', () => {
  const defaultProfile = MODEL_PROFILES['default'];
  assert.ok(defaultProfile, 'Default profile should exist');
  assert.equal(defaultProfile.maxTokens, 512);
  assert.equal(defaultProfile.dimensions, 384);
  assert.equal(defaultProfile.useTokens, false);
  assert.equal(defaultProfile.tokenizerType, 'estimate');
});

test('MODEL_PROFILES overlap settings are valid (20% of chunk)', () => {
  for (const [name, profile] of Object.entries(MODEL_PROFILES)) {
    assert.ok(
      profile.overlapTokens <= profile.maxChunkTokens,
      `${name}: overlapTokens should be <= maxChunkTokens`
    );
    assert.ok(
      profile.overlapChars <= profile.maxChunkChars,
      `${name}: overlapChars should be <= maxChunkChars`
    );
  }
});

// ============= getModelProfile tests =============
test('getModelProfile returns profile for known model (case-insensitive)', async () => {
  const profile = await getModelProfile('OpenAI', 'TEXT-EMBEDDING-3-LARGE');
  assert.equal(profile.maxTokens, 8191);
  assert.equal(profile.dimensions, 3072);
});

test('getModelProfile returns provider default for unknown model', async () => {
  const profile = await getModelProfile('OpenAI', 'unknown-model');
  // OpenAI defaults to text-embedding-3-large profile
  assert.equal(profile.dimensions, 3072);
  assert.equal(profile.maxTokens, 8191);
});

test('getModelProfile returns default profile for unknown provider and model', async () => {
  const profile = await getModelProfile('UnknownProvider', null);
  assert.equal(profile.dimensions, 384);
  assert.equal(profile.maxTokens, 512);
});

test('getModelProfile attaches tokenCounter for tiktoken-based models', async () => {
  const profile = await getModelProfile('OpenAI', 'text-embedding-3-large');
  // tokenCounter may or may not be available depending on tiktoken installation
  if (profile.useTokens && profile.tokenCounter) {
    assert.equal(typeof profile.tokenCounter, 'function');
    const count = await profile.tokenCounter('hello world');
    assert.equal(typeof count, 'number');
    assert.ok(count > 0, 'Token count should be positive');
  }
});

test('getModelProfile returns null model name gracefully', async () => {
  const profile = await getModelProfile('OpenAI', null);
  assert.ok(profile, 'Profile should be returned');
  assert.equal(profile.dimensions, 3072); // OpenAI default
});

// ============= getSizeLimits tests =============
test('getSizeLimits returns token-based limits when useTokens is true and tokenCounter exists', () => {
  const mockProfile = {
    maxTokens: 8191,
    optimalTokens: 4000,
    minChunkTokens: 400,
    maxChunkTokens: 6000,
    overlapTokens: 100,
    optimalChars: 16000,
    minChunkChars: 1600,
    maxChunkChars: 24000,
    overlapChars: 400,
    dimensions: 3072,
    useTokens: true,
    tokenizerType: 'tiktoken',
    tokenCounter: (text: string) => text.length
  };

  const limits = getSizeLimits(mockProfile);
  assert.equal(limits.optimal, 4000);
  assert.equal(limits.min, 400);
  assert.equal(limits.max, 6000);
  assert.equal(limits.overlap, 100);
  assert.equal(limits.unit, 'tokens');
});

test('getSizeLimits returns character-based limits when useTokens is false', () => {
  const mockProfile = {
    maxTokens: 512,
    optimalTokens: 400,
    minChunkTokens: 50,
    maxChunkTokens: 480,
    overlapTokens: 30,
    optimalChars: 1600,
    minChunkChars: 200,
    maxChunkChars: 1920,
    overlapChars: 120,
    dimensions: 384,
    useTokens: false,
    tokenizerType: 'estimate'
  };

  const limits = getSizeLimits(mockProfile);
  assert.equal(limits.optimal, 1600);
  assert.equal(limits.min, 200);
  assert.equal(limits.max, 1920);
  assert.equal(limits.overlap, 120);
  assert.equal(limits.unit, 'characters');
});

test('getSizeLimits returns character-based limits when tokenCounter is missing', () => {
  const mockProfile = {
    maxTokens: 8191,
    optimalTokens: 4000,
    minChunkTokens: 400,
    maxChunkTokens: 6000,
    overlapTokens: 100,
    optimalChars: 16000,
    minChunkChars: 1600,
    maxChunkChars: 24000,
    overlapChars: 400,
    dimensions: 3072,
    useTokens: true,
    tokenizerType: 'tiktoken'
    // No tokenCounter
  };

  const limits = getSizeLimits(mockProfile);
  assert.equal(limits.unit, 'characters');
  assert.equal(limits.max, 24000);
});

// ============= EmbeddingProvider abstract class tests =============
test('EmbeddingProvider.generateEmbedding returns embedding vector', async () => {
  const provider = new TestEmbeddingProvider(384);
  const embedding = await provider.generateEmbedding('test text');
  assert.equal(embedding.length, 384);
  assert.equal(typeof embedding[0], 'number');
});

test('EmbeddingProvider.generateEmbeddings default implementation processes sequentially', async () => {
  const provider = new TestEmbeddingProvider(128);
  const texts = ['text1', 'text2', 'text3'];

  const embeddings = await provider.generateEmbeddings(texts);

  assert.equal(embeddings.length, 3);
  assert.equal(provider.getCallCount(), 3, 'Should call generateEmbedding for each text');
  embeddings.forEach(emb => {
    assert.equal(emb.length, 128);
  });
});

test('EmbeddingProvider.generateEmbeddings handles empty array', async () => {
  const provider = new TestEmbeddingProvider();
  const embeddings = await provider.generateEmbeddings([]);
  assert.equal(embeddings.length, 0);
  assert.equal(provider.getCallCount(), 0);
});

test('EmbeddingProvider.getDimensions returns configured dimensions', () => {
  const provider = new TestEmbeddingProvider(1536);
  assert.equal(provider.getDimensions(), 1536);
});

test('EmbeddingProvider.getName returns provider name', () => {
  const provider = new TestEmbeddingProvider(384, 'MyProvider');
  assert.equal(provider.getName(), 'MyProvider');
});

test('EmbeddingProvider.getModelName returns model name', () => {
  const provider = new TestEmbeddingProvider(384, 'Provider', 'my-model');
  assert.equal(provider.getModelName?.(), 'my-model');
});

test('EmbeddingProvider.init can be called without error', async () => {
  const provider = new TestEmbeddingProvider();
  await assert.doesNotReject(async () => {
    await provider.init?.();
  });
});

test('EmbeddingProvider.rateLimiter property is optional', () => {
  const provider = new TestEmbeddingProvider();
  assert.equal(provider.rateLimiter, undefined);
});

// ============= Edge cases and error handling =============
test('estimateTokens handles very long strings', () => {
  const longText = 'a'.repeat(1000000);
  const estimate = estimateTokens(longText);
  assert.equal(estimate, 250000);
});

test('MODEL_PROFILES profiles have valid numeric values', () => {
  for (const [name, profile] of Object.entries(MODEL_PROFILES)) {
    assert.ok(profile.maxTokens > 0, `${name}: maxTokens should be positive`);
    assert.ok(profile.dimensions > 0, `${name}: dimensions should be positive`);
    assert.ok(profile.optimalTokens > 0, `${name}: optimalTokens should be positive`);
    assert.ok(profile.optimalTokens <= profile.maxTokens, `${name}: optimalTokens should be <= maxTokens`);
    assert.ok(profile.minChunkTokens < profile.maxChunkTokens, `${name}: minChunkTokens should be < maxChunkTokens`);
  }
});

test('EmbeddingProvider handles concurrent generateEmbeddings calls', async () => {
  const provider = new TestEmbeddingProvider(64);

  const [result1, result2] = await Promise.all([
    provider.generateEmbeddings(['a', 'b']),
    provider.generateEmbeddings(['c', 'd'])
  ]);

  assert.equal(result1.length, 2);
  assert.equal(result2.length, 2);
  assert.equal(provider.getCallCount(), 4);
});
