import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { resolveProviderContext } from '../../config/resolver.js';
import type { CodevaultConfig } from '../../config/types.js';

/**
 * Helper to create a temporary directory for tests
 */
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codevault-resolver-test-'));
}

/**
 * Helper to clean up temporary directory
 */
function cleanupTempDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Helper to save original env and restore later
 */
function saveEnv(): Record<string, string | undefined> {
  const envVars = [
    'CODEVAULT_EMBEDDING_API_KEY',
    'OPENAI_API_KEY',
    'CODEVAULT_EMBEDDING_BASE_URL',
    'OPENAI_BASE_URL',
    'CODEVAULT_EMBEDDING_MODEL',
    'CODEVAULT_OPENAI_EMBEDDING_MODEL',
    'OPENAI_MODEL',
    'CODEVAULT_EMBEDDING_DIMENSIONS',
    'CODEVAULT_DIMENSIONS',
    'CODEVAULT_EMBEDDING_MAX_TOKENS',
    'CODEVAULT_MAX_TOKENS',
    'CODEVAULT_EMBEDDING_RATE_LIMIT_RPM',
    'CODEVAULT_RATE_LIMIT_RPM',
    'CODEVAULT_RATE_LIMIT',
    'CODEVAULT_EMBEDDING_RATE_LIMIT_TPM',
    'CODEVAULT_RATE_LIMIT_TPM',
    'CODEVAULT_ENCRYPTION_KEY',
    'CODEVAULT_RERANK_API_URL',
    'CODEVAULT_RERANK_API_KEY',
    'CODEVAULT_RERANK_MODEL',
    'CODEVAULT_CHAT_API_KEY',
    'CODEVAULT_CHAT_BASE_URL',
    'CODEVAULT_CHAT_MODEL',
    'CODEVAULT_OPENAI_CHAT_MODEL',
    'CODEVAULT_CHAT_MAX_TOKENS',
    'CODEVAULT_CHAT_TEMPERATURE',
    'CODEVAULT_GLOBAL_CONFIG_DIR',
  ];

  const saved: Record<string, string | undefined> = {};
  for (const key of envVars) {
    saved[key] = process.env[key];
  }
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearEnv(keys: string[]): void {
  for (const key of keys) {
    delete process.env[key];
  }
}

// =============================================================================
// resolveProviderContext tests
// =============================================================================

test('resolveProviderContext returns object with embedding, chat, and reranker', () => {
  const tempDir = createTempDir();
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    const context = resolveProviderContext(tempDir);

    assert.ok('embedding' in context, 'should have embedding property');
    assert.ok('chat' in context, 'should have chat property');
    assert.ok('reranker' in context, 'should have reranker property');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('resolveProviderContext resolves embedding options from config', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    fs.mkdirSync(configDir, { recursive: true });
    const testConfig: CodevaultConfig = {
      maxTokens: 8192,
      providers: {
        openai: {
          apiKey: 'test-embed-key',
          baseUrl: 'https://embed.example.com',
          model: 'text-embedding-3-small',
          dimensions: 1536,
          routing: {
            order: ['openai'],
            allow_fallbacks: true
          }
        }
      },
      rateLimit: {
        rpm: 100,
        tpm: 50000
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(testConfig));

    const context = resolveProviderContext(tempDir);

    assert.equal(context.embedding.apiKey, 'test-embed-key');
    assert.equal(context.embedding.baseUrl, 'https://embed.example.com');
    assert.equal(context.embedding.model, 'text-embedding-3-small');
    assert.equal(context.embedding.dimensions, 1536);
    assert.equal(context.embedding.maxTokens, 8192);
    assert.equal(context.embedding.rpm, 100);
    assert.equal(context.embedding.tpm, 50000);
    assert.deepEqual(context.embedding.routing, {
      order: ['openai'],
      allow_fallbacks: true
    });
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('resolveProviderContext resolves chat options from config', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    fs.mkdirSync(configDir, { recursive: true });
    const testConfig: CodevaultConfig = {
      chatLLM: {
        openai: {
          apiKey: 'test-chat-key',
          baseUrl: 'https://chat.example.com',
          model: 'gpt-4',
          maxTokens: 4096,
          temperature: 0.7,
          routing: {
            sort: 'latency'
          }
        }
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(testConfig));

    const context = resolveProviderContext(tempDir);

    assert.equal(context.chat.apiKey, 'test-chat-key');
    assert.equal(context.chat.baseUrl, 'https://chat.example.com');
    assert.equal(context.chat.model, 'gpt-4');
    assert.equal(context.chat.maxTokens, 4096);
    assert.equal(context.chat.temperature, 0.7);
    assert.deepEqual(context.chat.routing, { sort: 'latency' });
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('resolveProviderContext resolves reranker options from config', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    fs.mkdirSync(configDir, { recursive: true });
    const testConfig: CodevaultConfig = {
      reranker: {
        apiUrl: 'https://reranker.example.com',
        apiKey: 'reranker-key',
        model: 'rerank-v2',
        maxCandidates: 50,
        maxTokens: 8192
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(testConfig));

    const context = resolveProviderContext(tempDir);

    assert.equal(context.reranker.apiUrl, 'https://reranker.example.com');
    assert.equal(context.reranker.apiKey, 'reranker-key');
    assert.equal(context.reranker.model, 'rerank-v2');
    assert.equal(context.reranker.maxCandidates, 50);
    assert.equal(context.reranker.maxTokens, 8192);
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('resolveProviderContext returns ProviderContext structure for missing project config', () => {
  const tempDir = createTempDir();
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    const context = resolveProviderContext(tempDir);

    // Should always return a ProviderContext with embedding, chat, reranker
    assert.ok('embedding' in context);
    assert.ok('chat' in context);
    assert.ok('reranker' in context);

    // Rate limits should default to null when not explicitly set in env
    // (global config may still provide values for other fields)
    // We verify the structure is correct
    assert.ok('rpm' in context.embedding);
    assert.ok('tpm' in context.embedding);
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('resolveProviderContext resolves from environment variables', () => {
  const tempDir = createTempDir();
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    // Set environment variables
    process.env.CODEVAULT_EMBEDDING_API_KEY = 'env-embed-key';
    process.env.CODEVAULT_EMBEDDING_BASE_URL = 'https://env-embed.example.com';
    process.env.CODEVAULT_EMBEDDING_MODEL = 'env-embed-model';
    process.env.CODEVAULT_EMBEDDING_DIMENSIONS = '768';
    process.env.CODEVAULT_EMBEDDING_MAX_TOKENS = '4096';
    process.env.CODEVAULT_EMBEDDING_RATE_LIMIT_RPM = '200';
    process.env.CODEVAULT_EMBEDDING_RATE_LIMIT_TPM = '100000';

    process.env.CODEVAULT_CHAT_API_KEY = 'env-chat-key';
    process.env.CODEVAULT_CHAT_BASE_URL = 'https://env-chat.example.com';
    process.env.CODEVAULT_CHAT_MODEL = 'env-chat-model';
    process.env.CODEVAULT_CHAT_MAX_TOKENS = '2048';
    process.env.CODEVAULT_CHAT_TEMPERATURE = '0.5';

    process.env.CODEVAULT_RERANK_API_URL = 'https://env-rerank.example.com';
    process.env.CODEVAULT_RERANK_API_KEY = 'env-rerank-key';
    process.env.CODEVAULT_RERANK_MODEL = 'env-rerank-model';

    const context = resolveProviderContext(tempDir);

    // Verify embedding
    assert.equal(context.embedding.apiKey, 'env-embed-key');
    assert.equal(context.embedding.baseUrl, 'https://env-embed.example.com');
    assert.equal(context.embedding.model, 'env-embed-model');
    assert.equal(context.embedding.dimensions, 768);
    assert.equal(context.embedding.maxTokens, 4096);
    assert.equal(context.embedding.rpm, 200);
    assert.equal(context.embedding.tpm, 100000);

    // Verify chat
    assert.equal(context.chat.apiKey, 'env-chat-key');
    assert.equal(context.chat.baseUrl, 'https://env-chat.example.com');
    assert.equal(context.chat.model, 'env-chat-model');
    assert.equal(context.chat.maxTokens, 2048);
    assert.equal(context.chat.temperature, 0.5);

    // Verify reranker
    assert.equal(context.reranker.apiUrl, 'https://env-rerank.example.com');
    assert.equal(context.reranker.apiKey, 'env-rerank-key');
    assert.equal(context.reranker.model, 'env-rerank-model');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('resolveProviderContext env overrides project config', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    // Create project config
    fs.mkdirSync(configDir, { recursive: true });
    const testConfig: CodevaultConfig = {
      providers: {
        openai: {
          apiKey: 'project-key',
          model: 'project-model'
        }
      },
      chatLLM: {
        openai: {
          apiKey: 'project-chat-key',
          model: 'project-chat-model'
        }
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(testConfig));

    // Set env to override
    process.env.CODEVAULT_EMBEDDING_API_KEY = 'env-key';
    process.env.CODEVAULT_CHAT_API_KEY = 'env-chat-key';

    const context = resolveProviderContext(tempDir);

    // Env should override
    assert.equal(context.embedding.apiKey, 'env-key');
    assert.equal(context.chat.apiKey, 'env-chat-key');

    // Project values should be preserved where not overridden
    assert.equal(context.embedding.model, 'project-model');
    assert.equal(context.chat.model, 'project-chat-model');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('resolveProviderContext uses default basePath', () => {
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    // Should not throw when called without basePath
    const context = resolveProviderContext();

    assert.ok('embedding' in context);
    assert.ok('chat' in context);
    assert.ok('reranker' in context);
  } finally {
    restoreEnv(saved);
  }
});

test('resolveProviderContext handles partial config correctly', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));
  
  // Set global config dir to temp to avoid reading real global config
  process.env.CODEVAULT_GLOBAL_CONFIG_DIR = tempDir;

  try {
    fs.mkdirSync(configDir, { recursive: true });
    // Only set some fields
    const testConfig: CodevaultConfig = {
      providers: {
        openai: {
          apiKey: 'partial-key'
          // No model, baseUrl, dimensions
        }
      }
      // No chatLLM or reranker
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(testConfig));

    const context = resolveProviderContext(tempDir);

    // Set fields should be present
    assert.equal(context.embedding.apiKey, 'partial-key');

    // Unset fields should be undefined
    assert.equal(context.embedding.model, undefined);
    assert.equal(context.embedding.baseUrl, undefined);
    assert.equal(context.embedding.dimensions, undefined);

    // Chat and reranker should have undefined values
    assert.equal(context.chat.apiKey, undefined);
    assert.equal(context.reranker.apiUrl, undefined);
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('resolveProviderContext handles routing config', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    fs.mkdirSync(configDir, { recursive: true });
    const testConfig: CodevaultConfig = {
      providers: {
        openai: {
          routing: {
            order: ['openai', 'azure'],
            allow_fallbacks: true,
            require_parameters: false,
            data_collection: 'deny',
            zdr: true,
            sort: 'price',
            max_price: {
              prompt: 0.001,
              completion: 0.002
            }
          }
        }
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(testConfig));

    const context = resolveProviderContext(tempDir);

    assert.ok(context.embedding.routing !== undefined);
    assert.deepEqual(context.embedding.routing.order, ['openai', 'azure']);
    assert.equal(context.embedding.routing.allow_fallbacks, true);
    assert.equal(context.embedding.routing.require_parameters, false);
    assert.equal(context.embedding.routing.data_collection, 'deny');
    assert.equal(context.embedding.routing.zdr, true);
    assert.equal(context.embedding.routing.sort, 'price');
    assert.deepEqual(context.embedding.routing.max_price, {
      prompt: 0.001,
      completion: 0.002
    });
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});
