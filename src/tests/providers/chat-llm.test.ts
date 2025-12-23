import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ChatLLMProvider,
  OpenAIChatProvider,
  createChatLLMProvider,
  type ChatMessage,
  type ChatCompletionOptions
} from '../../providers/chat-llm.js';

// ============= Mock OpenAI client for chat testing =============
interface MockChatCompletionResponse {
  choices: Array<{
    message?: { content: string };
    delta?: { content?: string };
    index: number;
  }>;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface MockOpenAIChatClient {
  chat: {
    completions: {
      create: (params: unknown) => Promise<MockChatCompletionResponse | AsyncIterable<MockChatCompletionResponse>>;
    };
  };
  createCalls: unknown[];
}

function createMockChatOpenAI(responseContent = 'Hello, I am an AI assistant.'): MockOpenAIChatClient {
  const mock: MockOpenAIChatClient = {
    createCalls: [],
    chat: {
      completions: {
        create: async (params: unknown): Promise<MockChatCompletionResponse | AsyncIterable<MockChatCompletionResponse>> => {
          mock.createCalls.push(params);
          const typedParams = params as { stream?: boolean };

          if (typedParams.stream) {
            // Return async iterable for streaming
            return (async function* (): AsyncIterable<MockChatCompletionResponse> {
              const words = responseContent.split(' ');
              for (const word of words) {
                yield {
                  choices: [{ delta: { content: word + ' ' }, index: 0 }],
                  model: 'gpt-4',
                  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
                };
              }
            })();
          }

          return {
            choices: [{ message: { content: responseContent }, index: 0 }],
            model: 'gpt-4',
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
          };
        }
      }
    }
  };
  return mock;
}

function createErrorMockChatOpenAI(error: Error): MockOpenAIChatClient {
  return {
    createCalls: [],
    chat: {
      completions: {
        create: async (): Promise<MockChatCompletionResponse> => {
          throw error;
        }
      }
    }
  };
}

function createEmptyResponseMockChatOpenAI(): MockOpenAIChatClient {
  return {
    createCalls: [],
    chat: {
      completions: {
        create: async (): Promise<MockChatCompletionResponse> => ({
          choices: [{ message: { content: '' }, index: 0 }],
          model: 'gpt-4',
          usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 }
        })
      }
    }
  };
}

// Helper to inject mock OpenAI client
function injectMockChatClient(provider: OpenAIChatProvider, mockClient: MockOpenAIChatClient): void {
  (provider as unknown as { openai: MockOpenAIChatClient }).openai = mockClient;
}

// ============= ChatLLMProvider abstract class tests =============
test('ChatLLMProvider is an abstract class with required methods', () => {
  // ChatLLMProvider defines the interface
  assert.ok(ChatLLMProvider, 'ChatLLMProvider should be exported');
  assert.equal(typeof ChatLLMProvider, 'function');
});

// ============= OpenAIChatProvider constructor tests =============
test('OpenAIChatProvider uses default model when no options provided', () => {
  const originalModel = process.env.CODEVAULT_CHAT_MODEL;
  delete process.env.CODEVAULT_CHAT_MODEL;
  delete process.env.CODEVAULT_OPENAI_CHAT_MODEL;

  try {
    const provider = new OpenAIChatProvider();
    assert.equal(provider.getModelName(), 'gpt-4o');
  } finally {
    if (originalModel) process.env.CODEVAULT_CHAT_MODEL = originalModel;
  }
});

test('OpenAIChatProvider uses model from options', () => {
  const provider = new OpenAIChatProvider({ model: 'gpt-3.5-turbo' });
  assert.equal(provider.getModelName(), 'gpt-3.5-turbo');
});

test('OpenAIChatProvider creates rate limiter', () => {
  const provider = new OpenAIChatProvider();
  assert.ok(provider.rateLimiter, 'Rate limiter should exist');
});

// ============= getName tests =============
test('OpenAIChatProvider.getName returns "OpenAI-Chat"', () => {
  const provider = new OpenAIChatProvider();
  assert.equal(provider.getName(), 'OpenAI-Chat');
});

// ============= getModelName tests =============
test('OpenAIChatProvider.getModelName returns configured model', () => {
  const provider = new OpenAIChatProvider({ model: 'custom-chat-model' });
  assert.equal(provider.getModelName(), 'custom-chat-model');
});

// ============= init tests =============
test('OpenAIChatProvider.init initializes OpenAI client', async () => {
  const provider = new OpenAIChatProvider({ apiKey: 'test-key' });

  await assert.doesNotReject(async () => {
    await provider.init();
  });
});

test('OpenAIChatProvider.init is idempotent', async () => {
  const provider = new OpenAIChatProvider({ apiKey: 'test-key' });

  await provider.init();
  await provider.init();
  await provider.init();

  assert.ok(true);
});

// ============= generateCompletion tests =============
test('OpenAIChatProvider.generateCompletion returns response content', async () => {
  const provider = new OpenAIChatProvider({ apiKey: 'test-key' });
  await provider.init();

  const mockClient = createMockChatOpenAI('This is the AI response.');
  injectMockChatClient(provider, mockClient);

  const messages: ChatMessage[] = [
    { role: 'user', content: 'Hello' }
  ];
  const response = await provider.generateCompletion(messages);

  assert.equal(response, 'This is the AI response.');
  assert.equal(mockClient.createCalls.length, 1);
});

test('OpenAIChatProvider.generateCompletion handles system messages', async () => {
  const provider = new OpenAIChatProvider({ apiKey: 'test-key' });
  await provider.init();

  const mockClient = createMockChatOpenAI('Response');
  injectMockChatClient(provider, mockClient);

  const messages: ChatMessage[] = [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello' }
  ];
  await provider.generateCompletion(messages);

  const call = mockClient.createCalls[0] as { messages: Array<{ role: string; content: string }> };
  assert.equal(call.messages.length, 2);
  assert.equal(call.messages[0].role, 'system');
  assert.equal(call.messages[1].role, 'user');
});

test('OpenAIChatProvider.generateCompletion handles assistant messages', async () => {
  const provider = new OpenAIChatProvider({ apiKey: 'test-key' });
  await provider.init();

  const mockClient = createMockChatOpenAI('Response');
  injectMockChatClient(provider, mockClient);

  const messages: ChatMessage[] = [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' },
    { role: 'user', content: 'How are you?' }
  ];
  await provider.generateCompletion(messages);

  const call = mockClient.createCalls[0] as { messages: Array<{ role: string }> };
  assert.equal(call.messages.length, 3);
  assert.equal(call.messages[1].role, 'assistant');
});

test('OpenAIChatProvider.generateCompletion uses default temperature', async () => {
  const originalTemp = process.env.CODEVAULT_CHAT_TEMPERATURE;
  delete process.env.CODEVAULT_CHAT_TEMPERATURE;

  try {
    const provider = new OpenAIChatProvider({ apiKey: 'test-key' });
    await provider.init();

    const mockClient = createMockChatOpenAI('Response');
    injectMockChatClient(provider, mockClient);

    await provider.generateCompletion([{ role: 'user', content: 'Hi' }]);

    const call = mockClient.createCalls[0] as { temperature: number };
    assert.equal(call.temperature, 0.7);
  } finally {
    if (originalTemp) process.env.CODEVAULT_CHAT_TEMPERATURE = originalTemp;
  }
});

test('OpenAIChatProvider.generateCompletion uses temperature from options', async () => {
  const provider = new OpenAIChatProvider({ apiKey: 'test-key' });
  await provider.init();

  const mockClient = createMockChatOpenAI('Response');
  injectMockChatClient(provider, mockClient);

  const options: ChatCompletionOptions = { temperature: 0.3 };
  await provider.generateCompletion([{ role: 'user', content: 'Hi' }], options);

  const call = mockClient.createCalls[0] as { temperature: number };
  assert.equal(call.temperature, 0.3);
});

test('OpenAIChatProvider.generateCompletion uses temperatureOverride from constructor', async () => {
  const provider = new OpenAIChatProvider({ apiKey: 'test-key', temperature: 0.5 });
  await provider.init();

  const mockClient = createMockChatOpenAI('Response');
  injectMockChatClient(provider, mockClient);

  await provider.generateCompletion([{ role: 'user', content: 'Hi' }]);

  const call = mockClient.createCalls[0] as { temperature: number };
  assert.equal(call.temperature, 0.5);
});

test('OpenAIChatProvider.generateCompletion uses maxTokens from options', async () => {
  const provider = new OpenAIChatProvider({ apiKey: 'test-key' });
  await provider.init();

  const mockClient = createMockChatOpenAI('Response');
  injectMockChatClient(provider, mockClient);

  const options: ChatCompletionOptions = { maxTokens: 1000 };
  await provider.generateCompletion([{ role: 'user', content: 'Hi' }], options);

  const call = mockClient.createCalls[0] as { max_tokens: number };
  assert.equal(call.max_tokens, 1000);
});

test('OpenAIChatProvider.generateCompletion uses maxTokensOverride from constructor', async () => {
  const provider = new OpenAIChatProvider({ apiKey: 'test-key', maxTokens: 2000 });
  await provider.init();

  const mockClient = createMockChatOpenAI('Response');
  injectMockChatClient(provider, mockClient);

  await provider.generateCompletion([{ role: 'user', content: 'Hi' }]);

  const call = mockClient.createCalls[0] as { max_tokens: number };
  assert.equal(call.max_tokens, 2000);
});

test('OpenAIChatProvider.generateCompletion adds provider routing for OpenRouter', async () => {
  const provider = new OpenAIChatProvider({
    apiKey: 'test-key',
    baseUrl: 'https://openrouter.ai/api/v1',
    routing: { order: ['anthropic'] }
  });
  await provider.init();

  const mockClient = createMockChatOpenAI('Response');
  injectMockChatClient(provider, mockClient);

  await provider.generateCompletion([{ role: 'user', content: 'Hi' }]);

  const call = mockClient.createCalls[0] as { provider?: { order: string[] } };
  assert.ok(call.provider, 'Provider routing should be included');
  assert.deepEqual(call.provider.order, ['anthropic']);
});

test('OpenAIChatProvider.generateCompletion returns empty string for empty response', async () => {
  const provider = new OpenAIChatProvider({ apiKey: 'test-key' });
  await provider.init();

  const mockClient = createEmptyResponseMockChatOpenAI();
  injectMockChatClient(provider, mockClient);

  const response = await provider.generateCompletion([{ role: 'user', content: 'Hi' }]);
  assert.equal(response, '');
});

test('OpenAIChatProvider.generateCompletion throws if client not initialized', async () => {
  const provider = new OpenAIChatProvider({ apiKey: 'test-key' });
  await provider.init();

  // Inject mock first then null it
  const mockClient = createMockChatOpenAI('Response');
  injectMockChatClient(provider, mockClient);
  (provider as unknown as { openai: null }).openai = null;

  // Mock init to not recreate the client
  const originalInit = provider.init.bind(provider);
  provider.init = async (): Promise<void> => {
    await Promise.resolve();
  };

  await assert.rejects(
    async () => provider.generateCompletion([{ role: 'user', content: 'Hi' }]),
    /OpenAI client not initialized/
  );

  provider.init = originalInit;
});

test('OpenAIChatProvider.generateCompletion propagates API errors', async () => {
  const provider = new OpenAIChatProvider({ apiKey: 'test-key' });
  await provider.init();

  const mockClient = createErrorMockChatOpenAI(new Error('API error'));
  injectMockChatClient(provider, mockClient);

  await assert.rejects(
    async () => provider.generateCompletion([{ role: 'user', content: 'Hi' }]),
    /API error/
  );
});

// ============= generateStreamingCompletion tests =============
test('OpenAIChatProvider.generateStreamingCompletion yields content chunks', async () => {
  const provider = new OpenAIChatProvider({ apiKey: 'test-key' });
  await provider.init();

  const mockClient = createMockChatOpenAI('Hello world test');
  injectMockChatClient(provider, mockClient);

  const messages: ChatMessage[] = [{ role: 'user', content: 'Hi' }];
  const chunks: string[] = [];

  for await (const chunk of provider.generateStreamingCompletion(messages)) {
    chunks.push(chunk);
  }

  assert.ok(chunks.length > 0, 'Should yield at least one chunk');
  const fullResponse = chunks.join('');
  assert.ok(fullResponse.includes('Hello'), 'Response should contain content');
});

test('OpenAIChatProvider.generateStreamingCompletion uses temperature from options', async () => {
  const provider = new OpenAIChatProvider({ apiKey: 'test-key' });
  await provider.init();

  const mockClient = createMockChatOpenAI('Response');
  injectMockChatClient(provider, mockClient);

  const options: ChatCompletionOptions = { temperature: 0.2 };
  const generator = provider.generateStreamingCompletion(
    [{ role: 'user', content: 'Hi' }],
    options
  );

  // Consume the generator
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for await (const _ of generator) {
    // Just consume
  }

  const call = mockClient.createCalls[0] as { temperature: number; stream: boolean };
  assert.equal(call.temperature, 0.2);
  assert.equal(call.stream, true);
});

test('OpenAIChatProvider.generateStreamingCompletion handles empty chunks', async () => {
  const provider = new OpenAIChatProvider({ apiKey: 'test-key' });
  await provider.init();

  // Mock that returns chunks with empty content
  const mockClient: MockOpenAIChatClient = {
    createCalls: [],
    chat: {
      completions: {
        create: async (): Promise<AsyncIterable<MockChatCompletionResponse>> => {
          return (async function* (): AsyncIterable<MockChatCompletionResponse> {
            yield { choices: [{ delta: { content: undefined }, index: 0 }], model: 'gpt-4', usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
            yield { choices: [{ delta: { content: 'Hello' }, index: 0 }], model: 'gpt-4', usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
            yield { choices: [{ delta: { content: '' }, index: 0 }], model: 'gpt-4', usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
          })();
        }
      }
    }
  };
  injectMockChatClient(provider, mockClient);

  const chunks: string[] = [];
  for await (const chunk of provider.generateStreamingCompletion([{ role: 'user', content: 'Hi' }])) {
    chunks.push(chunk);
  }

  // Should only yield non-empty content
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0], 'Hello');
});

test('OpenAIChatProvider.generateStreamingCompletion throws if client not initialized', async () => {
  const provider = new OpenAIChatProvider({ apiKey: 'test-key' });
  await provider.init();

  // Inject mock first then null it
  const mockClient = createMockChatOpenAI('Response');
  injectMockChatClient(provider, mockClient);
  (provider as unknown as { openai: null }).openai = null;

  // Mock init to not recreate the client
  const originalInit = provider.init.bind(provider);
  provider.init = async (): Promise<void> => {
    await Promise.resolve();
  };

  const generator = provider.generateStreamingCompletion([{ role: 'user', content: 'Hi' }]);

  await assert.rejects(
    async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of generator) {
        // Consume
      }
    },
    /OpenAI client not initialized/
  );

  provider.init = originalInit;
});

test('OpenAIChatProvider.generateStreamingCompletion adds provider routing for OpenRouter', async () => {
  const provider = new OpenAIChatProvider({
    apiKey: 'test-key',
    baseUrl: 'https://openrouter.ai/api/v1',
    routing: { order: ['openai'] }
  });
  await provider.init();

  const mockClient = createMockChatOpenAI('Response');
  injectMockChatClient(provider, mockClient);

  const generator = provider.generateStreamingCompletion([{ role: 'user', content: 'Hi' }]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for await (const _ of generator) {
    // Consume
  }

  const call = mockClient.createCalls[0] as { provider?: { order: string[] } };
  assert.ok(call.provider, 'Provider routing should be included');
});

// ============= createChatLLMProvider factory tests =============
test('createChatLLMProvider returns OpenAIChatProvider for "openai"', () => {
  const provider = createChatLLMProvider('openai');
  assert.ok(provider instanceof OpenAIChatProvider);
  assert.equal(provider.getName(), 'OpenAI-Chat');
});

test('createChatLLMProvider returns OpenAIChatProvider for "auto"', () => {
  const provider = createChatLLMProvider('auto');
  assert.ok(provider instanceof OpenAIChatProvider);
});

test('createChatLLMProvider returns OpenAIChatProvider for unknown provider', () => {
  const provider = createChatLLMProvider('unknown-provider');
  assert.ok(provider instanceof OpenAIChatProvider);
});

test('createChatLLMProvider passes options to provider', () => {
  const provider = createChatLLMProvider('openai', { model: 'gpt-4-turbo' });
  assert.equal(provider.getModelName?.(), 'gpt-4-turbo');
});

test('createChatLLMProvider is case-insensitive', () => {
  const provider1 = createChatLLMProvider('OPENAI');
  const provider2 = createChatLLMProvider('OpenAI');
  const provider3 = createChatLLMProvider('openai');

  assert.ok(provider1 instanceof OpenAIChatProvider);
  assert.ok(provider2 instanceof OpenAIChatProvider);
  assert.ok(provider3 instanceof OpenAIChatProvider);
});

test('createChatLLMProvider with no arguments uses defaults', () => {
  const provider = createChatLLMProvider();
  assert.ok(provider instanceof OpenAIChatProvider);
});

// ============= Rate limiting integration tests =============
test('OpenAIChatProvider.generateCompletion uses rate limiter', async () => {
  const provider = new OpenAIChatProvider({ apiKey: 'test-key' });
  await provider.init();

  const mockClient = createMockChatOpenAI('Response');
  injectMockChatClient(provider, mockClient);

  await provider.generateCompletion([{ role: 'user', content: 'Hi' }]);

  const stats = provider.rateLimiter.getStats();
  assert.ok(stats.requestsInLastMinute >= 0);
});

// ============= Edge cases =============
test('OpenAIChatProvider handles empty messages array', async () => {
  const provider = new OpenAIChatProvider({ apiKey: 'test-key' });
  await provider.init();

  const mockClient = createMockChatOpenAI('Response');
  injectMockChatClient(provider, mockClient);

  // Empty messages array - API should handle this
  await assert.doesNotReject(async () => {
    await provider.generateCompletion([]);
  });

  const call = mockClient.createCalls[0] as { messages: unknown[] };
  assert.equal(call.messages.length, 0);
});

test('OpenAIChatProvider handles very long message content', async () => {
  const provider = new OpenAIChatProvider({ apiKey: 'test-key' });
  await provider.init();

  const mockClient = createMockChatOpenAI('Response');
  injectMockChatClient(provider, mockClient);

  const longContent = 'a'.repeat(100000);
  await provider.generateCompletion([{ role: 'user', content: longContent }]);

  const call = mockClient.createCalls[0] as { messages: Array<{ content: string }> };
  assert.equal(call.messages[0].content, longContent);
});

// ============= Concurrent access tests =============
test('OpenAIChatProvider handles concurrent generateCompletion calls', async () => {
  const provider = new OpenAIChatProvider({ apiKey: 'test-key' });
  await provider.init();

  const mockClient = createMockChatOpenAI('Response');
  injectMockChatClient(provider, mockClient);

  const results = await Promise.all([
    provider.generateCompletion([{ role: 'user', content: 'Message 1' }]),
    provider.generateCompletion([{ role: 'user', content: 'Message 2' }]),
    provider.generateCompletion([{ role: 'user', content: 'Message 3' }])
  ]);

  assert.equal(results.length, 3);
  results.forEach(result => {
    assert.equal(result, 'Response');
  });
});
