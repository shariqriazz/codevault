import test from 'node:test';
import assert from 'node:assert/strict';

import type {
  ProviderRoutingConfig,
  ProviderConfig,
  RateLimitConfig,
  EncryptionConfig,
  ChatLLMConfig,
  CodevaultConfig,
  ConfigSource,
} from '../../config/types.js';

/**
 * Tests for types.ts
 *
 * Since types.ts only contains TypeScript type definitions, these tests
 * verify that objects conforming to the interfaces can be created and
 * used correctly at runtime. This ensures the type definitions are
 * valid and usable.
 */

// =============================================================================
// ProviderRoutingConfig interface tests
// =============================================================================

test('ProviderRoutingConfig accepts valid config', () => {
  const config: ProviderRoutingConfig = {
    order: ['openai', 'azure'],
    allow_fallbacks: true,
    require_parameters: false,
    data_collection: 'allow',
    zdr: true,
    enforce_distillable_text: false,
    only: ['openai'],
    ignore: ['azure'],
    quantizations: ['fp16', 'int8'],
    sort: 'price',
    max_price: {
      prompt: 0.001,
      completion: 0.002,
      request: 0.01,
      image: 0.05
    }
  };

  assert.ok(config, 'should create valid ProviderRoutingConfig');
  assert.deepEqual(config.order, ['openai', 'azure']);
  assert.equal(config.allow_fallbacks, true);
  assert.equal(config.data_collection, 'allow');
  assert.equal(config.sort, 'price');
});

test('ProviderRoutingConfig accepts data_collection deny', () => {
  const config: ProviderRoutingConfig = {
    data_collection: 'deny'
  };

  assert.equal(config.data_collection, 'deny');
});

test('ProviderRoutingConfig accepts sort options', () => {
  const priceSort: ProviderRoutingConfig = { sort: 'price' };
  const throughputSort: ProviderRoutingConfig = { sort: 'throughput' };
  const latencySort: ProviderRoutingConfig = { sort: 'latency' };

  assert.equal(priceSort.sort, 'price');
  assert.equal(throughputSort.sort, 'throughput');
  assert.equal(latencySort.sort, 'latency');
});

test('ProviderRoutingConfig accepts partial max_price', () => {
  const config: ProviderRoutingConfig = {
    max_price: {
      prompt: 0.001
      // Other fields optional
    }
  };

  assert.equal(config.max_price?.prompt, 0.001);
  assert.equal(config.max_price?.completion, undefined);
});

test('ProviderRoutingConfig all fields are optional', () => {
  const config: ProviderRoutingConfig = {};

  assert.ok(config, 'empty config should be valid');
  assert.equal(Object.keys(config).length, 0);
});

// =============================================================================
// ProviderConfig interface tests
// =============================================================================

test('ProviderConfig accepts complete config', () => {
  const config: ProviderConfig = {
    apiKey: 'sk-test123',
    model: 'text-embedding-3-small',
    baseUrl: 'https://api.openai.com/v1',
    dimensions: 1536,
    routing: {
      order: ['openai'],
      allow_fallbacks: true
    }
  };

  assert.ok(config, 'should create valid ProviderConfig');
  assert.equal(config.apiKey, 'sk-test123');
  assert.equal(config.model, 'text-embedding-3-small');
  assert.equal(config.baseUrl, 'https://api.openai.com/v1');
  assert.equal(config.dimensions, 1536);
  assert.ok(config.routing);
});

test('ProviderConfig all fields are optional', () => {
  const config: ProviderConfig = {};

  assert.ok(config, 'empty config should be valid');
});

test('ProviderConfig accepts only apiKey', () => {
  const config: ProviderConfig = {
    apiKey: 'sk-minimal'
  };

  assert.equal(config.apiKey, 'sk-minimal');
  assert.equal(config.model, undefined);
});

// =============================================================================
// RateLimitConfig interface tests
// =============================================================================

test('RateLimitConfig accepts rpm and tpm', () => {
  const config: RateLimitConfig = {
    rpm: 100,
    tpm: 50000
  };

  assert.equal(config.rpm, 100);
  assert.equal(config.tpm, 50000);
});

test('RateLimitConfig accepts only rpm', () => {
  const config: RateLimitConfig = {
    rpm: 60
  };

  assert.equal(config.rpm, 60);
  assert.equal(config.tpm, undefined);
});

test('RateLimitConfig accepts only tpm', () => {
  const config: RateLimitConfig = {
    tpm: 100000
  };

  assert.equal(config.rpm, undefined);
  assert.equal(config.tpm, 100000);
});

test('RateLimitConfig all fields are optional', () => {
  const config: RateLimitConfig = {};

  assert.ok(config, 'empty config should be valid');
});

// =============================================================================
// EncryptionConfig interface tests
// =============================================================================

test('EncryptionConfig accepts enabled and key', () => {
  const config: EncryptionConfig = {
    enabled: true,
    key: 'my-secret-key-32-bytes-long!!!!!'
  };

  assert.equal(config.enabled, true);
  assert.equal(config.key, 'my-secret-key-32-bytes-long!!!!!');
});

test('EncryptionConfig accepts only enabled', () => {
  const config: EncryptionConfig = {
    enabled: false
  };

  assert.equal(config.enabled, false);
  assert.equal(config.key, undefined);
});

test('EncryptionConfig accepts only key', () => {
  const config: EncryptionConfig = {
    key: 'some-key'
  };

  assert.equal(config.key, 'some-key');
  assert.equal(config.enabled, undefined);
});

test('EncryptionConfig all fields are optional', () => {
  const config: EncryptionConfig = {};

  assert.ok(config, 'empty config should be valid');
});

// =============================================================================
// ChatLLMConfig interface tests
// =============================================================================

test('ChatLLMConfig accepts complete config', () => {
  const config: ChatLLMConfig = {
    apiKey: 'sk-chat-key',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4',
    maxTokens: 4096,
    temperature: 0.7,
    routing: {
      sort: 'latency'
    }
  };

  assert.ok(config, 'should create valid ChatLLMConfig');
  assert.equal(config.apiKey, 'sk-chat-key');
  assert.equal(config.model, 'gpt-4');
  assert.equal(config.maxTokens, 4096);
  assert.equal(config.temperature, 0.7);
});

test('ChatLLMConfig accepts temperature of 0', () => {
  const config: ChatLLMConfig = {
    temperature: 0
  };

  assert.equal(config.temperature, 0);
});

test('ChatLLMConfig accepts high temperature', () => {
  const config: ChatLLMConfig = {
    temperature: 2.0
  };

  assert.equal(config.temperature, 2.0);
});

test('ChatLLMConfig all fields are optional', () => {
  const config: ChatLLMConfig = {};

  assert.ok(config, 'empty config should be valid');
});

// =============================================================================
// CodevaultConfig interface tests
// =============================================================================

test('CodevaultConfig accepts complete config', () => {
  const config: CodevaultConfig = {
    defaultProvider: 'openai',
    providers: {
      openai: {
        apiKey: 'sk-embed-key',
        model: 'text-embedding-3-small',
        baseUrl: 'https://api.openai.com/v1',
        dimensions: 1536
      }
    },
    chatLLM: {
      openai: {
        apiKey: 'sk-chat-key',
        model: 'gpt-4',
        maxTokens: 4096,
        temperature: 0.7
      }
    },
    rateLimit: {
      rpm: 100,
      tpm: 50000
    },
    encryption: {
      enabled: true,
      key: 'encryption-key-here'
    },
    maxTokens: 8192,
    reranker: {
      apiUrl: 'https://reranker.example.com',
      apiKey: 'reranker-key',
      model: 'rerank-v1',
      maxCandidates: 50,
      maxTokens: 8192
    }
  };

  assert.ok(config, 'should create valid CodevaultConfig');
  assert.equal(config.defaultProvider, 'openai');
  assert.ok(config.providers?.openai);
  assert.ok(config.chatLLM?.openai);
  assert.ok(config.rateLimit);
  assert.ok(config.encryption);
  assert.ok(config.reranker);
});

test('CodevaultConfig accepts only defaultProvider', () => {
  const config: CodevaultConfig = {
    defaultProvider: 'openai'
  };

  assert.equal(config.defaultProvider, 'openai');
  assert.equal(config.providers, undefined);
});

test('CodevaultConfig accepts reranker config', () => {
  const config: CodevaultConfig = {
    reranker: {
      apiUrl: 'https://api.cohere.ai/v1/rerank',
      apiKey: 'cohere-key',
      model: 'rerank-english-v2.0',
      maxCandidates: 100,
      maxTokens: 16384
    }
  };

  assert.ok(config.reranker);
  assert.equal(config.reranker.apiUrl, 'https://api.cohere.ai/v1/rerank');
  assert.equal(config.reranker.maxCandidates, 100);
  assert.equal(config.reranker.maxTokens, 16384);
});

test('CodevaultConfig all fields are optional', () => {
  const config: CodevaultConfig = {};

  assert.ok(config, 'empty config should be valid');
  assert.equal(Object.keys(config).length, 0);
});

test('CodevaultConfig accepts partial providers', () => {
  const config: CodevaultConfig = {
    providers: {
      openai: {
        apiKey: 'partial-key'
      }
    }
  };

  assert.equal(config.providers?.openai?.apiKey, 'partial-key');
  assert.equal(config.providers?.openai?.model, undefined);
});

// =============================================================================
// ConfigSource interface tests
// =============================================================================

test('ConfigSource accepts all sources', () => {
  const source: ConfigSource = {
    global: {
      defaultProvider: 'openai',
      maxTokens: 4096
    },
    project: {
      providers: {
        openai: {
          model: 'project-model'
        }
      }
    },
    env: {
      providers: {
        openai: {
          apiKey: 'env-key'
        }
      }
    }
  };

  assert.ok(source, 'should create valid ConfigSource');
  assert.ok(source.global);
  assert.ok(source.project);
  assert.ok(source.env);
});

test('ConfigSource global can be null', () => {
  const source: ConfigSource = {
    global: null,
    project: null,
    env: {}
  };

  assert.equal(source.global, null);
  assert.equal(source.project, null);
  assert.ok(source.env);
});

test('ConfigSource project can be null', () => {
  const source: ConfigSource = {
    global: { maxTokens: 1000 },
    project: null,
    env: {}
  };

  assert.ok(source.global);
  assert.equal(source.project, null);
});

test('ConfigSource env is always an object', () => {
  const source: ConfigSource = {
    global: null,
    project: null,
    env: {}
  };

  assert.ok(typeof source.env === 'object');
  assert.ok(source.env !== null);
});

// =============================================================================
// Type composition tests
// =============================================================================

test('ProviderConfig can include full ProviderRoutingConfig', () => {
  const providerConfig: ProviderConfig = {
    apiKey: 'test-key',
    routing: {
      order: ['openai', 'azure', 'anthropic'],
      allow_fallbacks: true,
      require_parameters: false,
      data_collection: 'deny',
      zdr: true,
      enforce_distillable_text: false,
      only: ['openai'],
      ignore: ['azure'],
      quantizations: ['fp16', 'int8', 'bf16'],
      sort: 'throughput',
      max_price: {
        prompt: 0.001,
        completion: 0.002,
        request: 0.01,
        image: 0.05
      }
    }
  };

  assert.ok(providerConfig.routing);
  assert.deepEqual(providerConfig.routing.order, ['openai', 'azure', 'anthropic']);
  assert.equal(providerConfig.routing.sort, 'throughput');
});

test('CodevaultConfig can include all nested configs', () => {
  // This tests the full type composition
  const fullConfig: CodevaultConfig = {
    defaultProvider: 'openai',
    maxTokens: 8192,
    providers: {
      openai: {
        apiKey: 'embed-key',
        model: 'text-embedding-3-small',
        baseUrl: 'https://api.openai.com/v1',
        dimensions: 1536,
        routing: {
          order: ['openai'],
          allow_fallbacks: true
        }
      }
    },
    chatLLM: {
      openai: {
        apiKey: 'chat-key',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4',
        maxTokens: 4096,
        temperature: 0.7,
        routing: {
          sort: 'latency'
        }
      }
    },
    rateLimit: {
      rpm: 100,
      tpm: 50000
    },
    encryption: {
      enabled: true,
      key: 'encryption-key'
    },
    reranker: {
      apiUrl: 'https://reranker.example.com',
      apiKey: 'reranker-key',
      model: 'rerank-v1',
      maxCandidates: 50,
      maxTokens: 8192
    }
  };

  // Verify structure is correct
  assert.equal(fullConfig.defaultProvider, 'openai');
  assert.equal(fullConfig.maxTokens, 8192);
  assert.ok(fullConfig.providers?.openai?.routing);
  assert.ok(fullConfig.chatLLM?.openai?.routing);
  assert.equal(fullConfig.rateLimit?.rpm, 100);
  assert.equal(fullConfig.encryption?.enabled, true);
  assert.equal(fullConfig.reranker?.maxCandidates, 50);
});

// =============================================================================
// Edge case tests
// =============================================================================

test('Numeric fields accept zero', () => {
  const rateLimit: RateLimitConfig = {
    rpm: 0,
    tpm: 0
  };

  assert.equal(rateLimit.rpm, 0);
  assert.equal(rateLimit.tpm, 0);
});

test('String fields accept empty strings', () => {
  const provider: ProviderConfig = {
    apiKey: '',
    model: '',
    baseUrl: ''
  };

  assert.equal(provider.apiKey, '');
  assert.equal(provider.model, '');
  assert.equal(provider.baseUrl, '');
});

test('Dimensions can be various valid values', () => {
  const small: ProviderConfig = { dimensions: 256 };
  const medium: ProviderConfig = { dimensions: 768 };
  const large: ProviderConfig = { dimensions: 1536 };
  const huge: ProviderConfig = { dimensions: 3072 };

  assert.equal(small.dimensions, 256);
  assert.equal(medium.dimensions, 768);
  assert.equal(large.dimensions, 1536);
  assert.equal(huge.dimensions, 3072);
});

test('maxTokens can be various valid values', () => {
  const small: CodevaultConfig = { maxTokens: 512 };
  const medium: CodevaultConfig = { maxTokens: 4096 };
  const large: CodevaultConfig = { maxTokens: 8192 };
  const huge: CodevaultConfig = { maxTokens: 128000 };

  assert.equal(small.maxTokens, 512);
  assert.equal(medium.maxTokens, 4096);
  assert.equal(large.maxTokens, 8192);
  assert.equal(huge.maxTokens, 128000);
});
