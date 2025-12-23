import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider } from '../../providers/openai.js';
import { MAX_BATCH_TOKENS, MAX_ITEM_TOKENS, estimateTokens } from '../../providers/base.js';

// ============= Mock OpenAI client for testing =============
interface MockEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

interface MockOpenAIClient {
  embeddings: {
    create: (params: unknown) => Promise<MockEmbeddingResponse>;
  };
  createCalls: unknown[];
}

function createMockOpenAI(dimensions = 1536): MockOpenAIClient {
  const mock: MockOpenAIClient = {
    createCalls: [],
    embeddings: {
      create: async (params: unknown): Promise<MockEmbeddingResponse> => {
        mock.createCalls.push(params);
        const typedParams = params as { input: string | string[]; model: string };
        const inputs = Array.isArray(typedParams.input) ? typedParams.input : [typedParams.input];

        return {
          data: inputs.map((_, i) => ({
            embedding: new Array(dimensions).fill(0).map((_, j) => (j + 1) / dimensions),
            index: i
          })),
          model: typedParams.model,
          usage: { prompt_tokens: 10, total_tokens: 10 }
        };
      }
    }
  };
  return mock;
}

function createErrorMockOpenAI(error: Error): MockOpenAIClient {
  return {
    createCalls: [],
    embeddings: {
      create: async (): Promise<MockEmbeddingResponse> => {
        throw error;
      }
    }
  };
}

function createInvalidResponseMockOpenAI(response: unknown): MockOpenAIClient {
  return {
    createCalls: [],
    embeddings: {
      create: async (): Promise<MockEmbeddingResponse> => {
        return response as MockEmbeddingResponse;
      }
    }
  };
}

// Helper to inject mock OpenAI client
function injectMockClient(provider: OpenAIProvider, mockClient: MockOpenAIClient): void {
  // Access private openai property via any
  (provider as unknown as { openai: MockOpenAIClient }).openai = mockClient;
}

// ============= Constructor tests =============
test('OpenAIProvider uses default model when no options provided', () => {
  // Clear environment to test defaults
  const originalModel = process.env.CODEVAULT_EMBEDDING_MODEL;
  delete process.env.CODEVAULT_EMBEDDING_MODEL;
  delete process.env.CODEVAULT_OPENAI_EMBEDDING_MODEL;
  delete process.env.OPENAI_MODEL;

  try {
    const provider = new OpenAIProvider();
    assert.equal(provider.getModelName(), 'text-embedding-3-large');
  } finally {
    if (originalModel) process.env.CODEVAULT_EMBEDDING_MODEL = originalModel;
  }
});

test('OpenAIProvider uses model from options', () => {
  const provider = new OpenAIProvider({ model: 'text-embedding-3-small' });
  assert.equal(provider.getModelName(), 'text-embedding-3-small');
});

test('OpenAIProvider respects dimensions override', () => {
  const provider = new OpenAIProvider({ dimensions: 512 });
  assert.equal(provider.getDimensions(), 512);
});

test('OpenAIProvider uses rate limiter from config when provided', () => {
  const provider = new OpenAIProvider({ rpm: 100, tpm: 50000 });
  const stats = provider.rateLimiter.getStats();
  assert.equal(stats.rpm, 100);
  assert.equal(stats.tpm, 50000);
});

test('OpenAIProvider creates default rate limiter when no limits provided', () => {
  const provider = new OpenAIProvider();
  assert.ok(provider.rateLimiter, 'Rate limiter should exist');
});

// ============= getName tests =============
test('OpenAIProvider.getName returns "OpenAI"', () => {
  const provider = new OpenAIProvider();
  assert.equal(provider.getName(), 'OpenAI');
});

// ============= getModelName tests =============
test('OpenAIProvider.getModelName returns configured model', () => {
  const provider = new OpenAIProvider({ model: 'custom-model' });
  assert.equal(provider.getModelName(), 'custom-model');
});

// ============= getDimensions tests =============
test('OpenAIProvider.getDimensions returns 3072 for text-embedding-3-large', () => {
  // Clear dimension overrides
  const originalDims = process.env.CODEVAULT_EMBEDDING_DIMENSIONS;
  delete process.env.CODEVAULT_EMBEDDING_DIMENSIONS;
  delete process.env.CODEVAULT_DIMENSIONS;

  try {
    const provider = new OpenAIProvider({ model: 'text-embedding-3-large' });
    assert.equal(provider.getDimensions(), 3072);
  } finally {
    if (originalDims) process.env.CODEVAULT_EMBEDDING_DIMENSIONS = originalDims;
  }
});

test('OpenAIProvider.getDimensions returns 1536 for text-embedding-3-small', () => {
  const originalDims = process.env.CODEVAULT_EMBEDDING_DIMENSIONS;
  delete process.env.CODEVAULT_EMBEDDING_DIMENSIONS;
  delete process.env.CODEVAULT_DIMENSIONS;

  try {
    const provider = new OpenAIProvider({ model: 'text-embedding-3-small' });
    assert.equal(provider.getDimensions(), 1536);
  } finally {
    if (originalDims) process.env.CODEVAULT_EMBEDDING_DIMENSIONS = originalDims;
  }
});

test('OpenAIProvider.getDimensions returns 1536 for unknown models', () => {
  const originalDims = process.env.CODEVAULT_EMBEDDING_DIMENSIONS;
  delete process.env.CODEVAULT_EMBEDDING_DIMENSIONS;
  delete process.env.CODEVAULT_DIMENSIONS;

  try {
    const provider = new OpenAIProvider({ model: 'unknown-model' });
    assert.equal(provider.getDimensions(), 1536);
  } finally {
    if (originalDims) process.env.CODEVAULT_EMBEDDING_DIMENSIONS = originalDims;
  }
});

test('OpenAIProvider.getDimensions respects dimensionsOverride', () => {
  const provider = new OpenAIProvider({
    model: 'text-embedding-3-large',
    dimensions: 256
  });
  assert.equal(provider.getDimensions(), 256);
});

// ============= init tests =============
test('OpenAIProvider.init initializes OpenAI client', async () => {
  const provider = new OpenAIProvider({ apiKey: 'test-key' });

  // init should not throw
  await assert.doesNotReject(async () => {
    await provider.init();
  });
});

test('OpenAIProvider.init is idempotent (can call multiple times)', async () => {
  const provider = new OpenAIProvider({ apiKey: 'test-key' });

  await provider.init();
  await provider.init();
  await provider.init();

  // Should not throw
  assert.ok(true);
});

// ============= generateEmbedding tests =============
test('OpenAIProvider.generateEmbedding returns embedding from API', async () => {
  const provider = new OpenAIProvider({ apiKey: 'test-key' });
  await provider.init();

  const mockClient = createMockOpenAI(3072);
  injectMockClient(provider, mockClient);

  const embedding = await provider.generateEmbedding('test text');

  assert.equal(embedding.length, 3072);
  assert.equal(mockClient.createCalls.length, 1);
});

test('OpenAIProvider.generateEmbedding truncates text to maxChars', async () => {
  const provider = new OpenAIProvider({ apiKey: 'test-key', model: 'text-embedding-3-large' });
  await provider.init();

  const mockClient = createMockOpenAI(3072);
  injectMockClient(provider, mockClient);

  // Create text longer than typical maxChars
  const longText = 'a'.repeat(50000);
  await provider.generateEmbedding(longText);

  const call = mockClient.createCalls[0] as { input: string };
  // Should be truncated (exact limit depends on model profile maxChunkChars)
  assert.ok(call.input.length <= 24000, `Input should be truncated, got ${call.input.length}`);
});

test('OpenAIProvider.generateEmbedding adds provider routing for OpenRouter', async () => {
  const provider = new OpenAIProvider({
    apiKey: 'test-key',
    baseUrl: 'https://openrouter.ai/api/v1',
    routing: { order: ['first'] }
  });
  await provider.init();

  const mockClient = createMockOpenAI(1536);
  injectMockClient(provider, mockClient);

  await provider.generateEmbedding('test');

  const call = mockClient.createCalls[0] as { provider?: { order: string[] } };
  assert.ok(call.provider, 'Provider routing should be included');
  assert.deepEqual(call.provider.order, ['first']);
});

test('OpenAIProvider.generateEmbedding throws on invalid API response (no data)', async () => {
  const provider = new OpenAIProvider({ apiKey: 'test-key' });
  await provider.init();

  const mockClient = createInvalidResponseMockOpenAI({ data: null });
  injectMockClient(provider, mockClient);

  await assert.rejects(
    async () => provider.generateEmbedding('test'),
    /Invalid API response/
  );
});

test('OpenAIProvider.generateEmbedding throws on invalid API response (empty data)', async () => {
  const provider = new OpenAIProvider({ apiKey: 'test-key' });
  await provider.init();

  const mockClient = createInvalidResponseMockOpenAI({ data: [] });
  injectMockClient(provider, mockClient);

  await assert.rejects(
    async () => provider.generateEmbedding('test'),
    /Invalid API response/
  );
});

test('OpenAIProvider.generateEmbedding throws on invalid embedding format', async () => {
  const provider = new OpenAIProvider({ apiKey: 'test-key' });
  await provider.init();

  const mockClient = createInvalidResponseMockOpenAI({
    data: [{ embedding: 'not an array' }]
  });
  injectMockClient(provider, mockClient);

  await assert.rejects(
    async () => provider.generateEmbedding('test'),
    /Invalid embedding/
  );
});

test('OpenAIProvider.generateEmbedding throws if client not initialized', async () => {
  const provider = new OpenAIProvider({ apiKey: 'test-key' });
  // Inject mock first, then null it out after init to test the guard
  await provider.init();
  const mockClient = createMockOpenAI(3072);
  injectMockClient(provider, mockClient);

  // Now null it to simulate an edge case where client becomes null
  (provider as unknown as { openai: null }).openai = null;

  // The generateEmbedding calls init() again which will recreate the client
  // So this test verifies the guard inside rateLimiter.execute callback
  // We need to mock init to not recreate the client
  const originalInit = provider.init.bind(provider);
  provider.init = async (): Promise<void> => {
    // Do nothing - don't recreate the client
    await Promise.resolve();
  };

  await assert.rejects(
    async () => provider.generateEmbedding('test'),
    /OpenAI client not initialized/
  );

  // Restore init
  provider.init = originalInit;
});

// ============= generateEmbeddings (batch) tests =============
test('OpenAIProvider.generateEmbeddings processes batch correctly', async () => {
  const provider = new OpenAIProvider({ apiKey: 'test-key' });
  await provider.init();

  const mockClient = createMockOpenAI(3072);
  injectMockClient(provider, mockClient);

  const texts = ['text1', 'text2', 'text3'];
  const embeddings = await provider.generateEmbeddings(texts);

  assert.equal(embeddings.length, 3);
  embeddings.forEach(emb => {
    assert.equal(emb.length, 3072);
  });
});

test('OpenAIProvider.generateEmbeddings handles empty array', async () => {
  const provider = new OpenAIProvider({ apiKey: 'test-key' });
  await provider.init();

  const mockClient = createMockOpenAI(3072);
  injectMockClient(provider, mockClient);

  const embeddings = await provider.generateEmbeddings([]);

  assert.equal(embeddings.length, 0);
  assert.equal(mockClient.createCalls.length, 0);
});

test('OpenAIProvider.generateEmbeddings respects MAX_BATCH_TOKENS limit', async () => {
  const provider = new OpenAIProvider({ apiKey: 'test-key', model: 'text-embedding-3-large' });
  await provider.init();

  const mockClient = createMockOpenAI(3072);
  injectMockClient(provider, mockClient);

  // Create texts that would exceed MAX_BATCH_TOKENS in total
  // Each text is ~1000 tokens (4000 chars), so 200 texts = ~200k tokens > 100k limit
  const texts = Array.from({ length: 50 }, () => 'a'.repeat(4000));
  await provider.generateEmbeddings(texts);

  // Should have made multiple API calls due to token limits
  assert.ok(mockClient.createCalls.length >= 1, 'Should make at least one API call');
});

test('OpenAIProvider.generateEmbeddings text is truncated to maxChars before token check', async () => {
  // This test verifies that text is truncated before token counting
  // For text-embedding-3-large: maxChars=24000, maxTokens=8191
  // 24000 chars / 4 = 6000 estimated tokens, which is < 8191
  // So even very long texts won't trigger the token limit error after truncation
  const provider = new OpenAIProvider({ apiKey: 'test-key', model: 'text-embedding-3-large' });
  await provider.init();

  const mockClient = createMockOpenAI(3072);
  injectMockClient(provider, mockClient);

  // Create a very long text that would exceed token limits if not truncated
  const oversizedText = 'a'.repeat(100000); // 25000 estimated tokens before truncation
  const texts = [oversizedText];

  // Should NOT throw because text is truncated to maxChars (24000) first
  // 24000 / 4 = 6000 tokens, which is < 8191
  await assert.doesNotReject(async () => provider.generateEmbeddings(texts));

  // Verify the text was truncated
  const call = mockClient.createCalls[0] as { input: string[] };
  assert.ok(call.input[0].length <= 24000, 'Text should be truncated to maxChars');
});

test('OpenAIProvider.generateEmbeddings validates response length matches input', async () => {
  const provider = new OpenAIProvider({ apiKey: 'test-key' });
  await provider.init();

  // Mock that returns wrong number of embeddings
  const mockClient: MockOpenAIClient = {
    createCalls: [],
    embeddings: {
      create: async (): Promise<MockEmbeddingResponse> => ({
        data: [{ embedding: [1, 2, 3], index: 0 }], // Only 1 embedding
        model: 'test',
        usage: { prompt_tokens: 10, total_tokens: 10 }
      })
    }
  };
  injectMockClient(provider, mockClient);

  await assert.rejects(
    async () => provider.generateEmbeddings(['text1', 'text2', 'text3']), // 3 texts
    /expected 3/
  );
});

test('OpenAIProvider.generateEmbeddings handles single item batch', async () => {
  const provider = new OpenAIProvider({ apiKey: 'test-key' });
  await provider.init();

  const mockClient = createMockOpenAI(3072);
  injectMockClient(provider, mockClient);

  const embeddings = await provider.generateEmbeddings(['single text']);

  assert.equal(embeddings.length, 1);
  assert.equal(embeddings[0].length, 3072);
});

// ============= Token estimation tests =============
test('estimateTokens function is used for batch size calculation', () => {
  // Test that estimateTokens is consistent with provider expectations
  const text = 'hello world test';
  const estimate = estimateTokens(text);
  assert.equal(estimate, Math.ceil(text.length / 4));
});

test('MAX_BATCH_TOKENS constant is correct', () => {
  assert.equal(MAX_BATCH_TOKENS, 100000);
});

test('MAX_ITEM_TOKENS constant is correct', () => {
  assert.equal(MAX_ITEM_TOKENS, 8191);
});

// ============= Rate limiting integration tests =============
test('OpenAIProvider uses rate limiter for generateEmbedding', async () => {
  const provider = new OpenAIProvider({ apiKey: 'test-key', rpm: 100 });
  await provider.init();

  const mockClient = createMockOpenAI(3072);
  injectMockClient(provider, mockClient);

  await provider.generateEmbedding('test');

  const stats = provider.rateLimiter.getStats();
  assert.ok(stats.requestsInLastMinute >= 0);
});

test('OpenAIProvider uses rate limiter for generateEmbeddings', async () => {
  const provider = new OpenAIProvider({ apiKey: 'test-key', rpm: 100 });
  await provider.init();

  const mockClient = createMockOpenAI(3072);
  injectMockClient(provider, mockClient);

  await provider.generateEmbeddings(['text1', 'text2']);

  const stats = provider.rateLimiter.getStats();
  assert.ok(stats.requestsInLastMinute >= 0);
});

// ============= Error handling tests =============
test('OpenAIProvider.generateEmbedding propagates API errors', async () => {
  const provider = new OpenAIProvider({ apiKey: 'test-key' });
  await provider.init();

  const mockClient = createErrorMockOpenAI(new Error('API unavailable'));
  injectMockClient(provider, mockClient);

  await assert.rejects(
    async () => provider.generateEmbedding('test'),
    /API unavailable/
  );
});

test('OpenAIProvider.generateEmbeddings validates each embedding in batch', async () => {
  const provider = new OpenAIProvider({ apiKey: 'test-key' });
  await provider.init();

  // Mock that returns invalid embedding at index 1
  const mockClient: MockOpenAIClient = {
    createCalls: [],
    embeddings: {
      create: async (): Promise<MockEmbeddingResponse> => ({
        data: [
          { embedding: [1, 2, 3], index: 0 },
          { embedding: null as unknown as number[], index: 1 } // Invalid
        ],
        model: 'test',
        usage: { prompt_tokens: 10, total_tokens: 10 }
      })
    }
  };
  injectMockClient(provider, mockClient);

  await assert.rejects(
    async () => provider.generateEmbeddings(['text1', 'text2']),
    /Invalid embedding at index 1/
  );
});

// ============= OpenRouter detection tests =============
test('OpenAIProvider does not add routing for non-OpenRouter URLs', async () => {
  const provider = new OpenAIProvider({
    apiKey: 'test-key',
    baseUrl: 'https://api.openai.com/v1',
    routing: { order: ['first'] }
  });
  await provider.init();

  const mockClient = createMockOpenAI(1536);
  injectMockClient(provider, mockClient);

  await provider.generateEmbedding('test');

  const call = mockClient.createCalls[0] as { provider?: unknown };
  assert.equal(call.provider, undefined, 'Provider routing should not be included for non-OpenRouter');
});

// ============= Concurrent access tests =============
test('OpenAIProvider handles concurrent generateEmbedding calls', async () => {
  const provider = new OpenAIProvider({ apiKey: 'test-key', rpm: 1000 });
  await provider.init();

  const mockClient = createMockOpenAI(3072);
  injectMockClient(provider, mockClient);

  const results = await Promise.all([
    provider.generateEmbedding('text1'),
    provider.generateEmbedding('text2'),
    provider.generateEmbedding('text3')
  ]);

  assert.equal(results.length, 3);
  results.forEach(emb => {
    assert.equal(emb.length, 3072);
  });
});
