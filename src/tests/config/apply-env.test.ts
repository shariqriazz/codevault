import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

import {
  getConfigEnvOverrides,
  applyConfigToEnv,
  getEffectiveConfig,
} from '../../config/apply-env.js';
import type { CodevaultConfig } from '../../config/types.js';

/**
 * Helper to create a temporary directory for tests
 */
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codevault-apply-env-test-'));
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
// getConfigEnvOverrides tests
// =============================================================================

test('getConfigEnvOverrides returns object type', () => {
  const tempDir = createTempDir();
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    const overrides = getConfigEnvOverrides(tempDir);

    // Should always return an object
    assert.ok(typeof overrides === 'object');
    // When no project config exists in tempDir and env is cleared,
    // the result depends on whether global config exists
    // We just verify the function returns without error
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('getConfigEnvOverrides generates embedding API key overrides', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    fs.mkdirSync(configDir, { recursive: true });
    const testConfig: CodevaultConfig = {
      providers: {
        openai: {
          apiKey: 'test-api-key'
        }
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(testConfig));

    const overrides = getConfigEnvOverrides(tempDir);

    assert.equal(overrides.CODEVAULT_EMBEDDING_API_KEY, 'test-api-key');
    assert.equal(overrides.OPENAI_API_KEY, 'test-api-key');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('getConfigEnvOverrides generates embedding base URL overrides', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    fs.mkdirSync(configDir, { recursive: true });
    const testConfig: CodevaultConfig = {
      providers: {
        openai: {
          baseUrl: 'https://api.example.com'
        }
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(testConfig));

    const overrides = getConfigEnvOverrides(tempDir);

    assert.equal(overrides.CODEVAULT_EMBEDDING_BASE_URL, 'https://api.example.com');
    assert.equal(overrides.OPENAI_BASE_URL, 'https://api.example.com');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('getConfigEnvOverrides generates embedding model overrides', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    fs.mkdirSync(configDir, { recursive: true });
    const testConfig: CodevaultConfig = {
      providers: {
        openai: {
          model: 'text-embedding-3-large'
        }
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(testConfig));

    const overrides = getConfigEnvOverrides(tempDir);

    assert.equal(overrides.CODEVAULT_EMBEDDING_MODEL, 'text-embedding-3-large');
    assert.equal(overrides.CODEVAULT_OPENAI_EMBEDDING_MODEL, 'text-embedding-3-large');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('getConfigEnvOverrides generates embedding dimensions overrides', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    fs.mkdirSync(configDir, { recursive: true });
    const testConfig: CodevaultConfig = {
      providers: {
        openai: {
          dimensions: 1536
        }
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(testConfig));

    const overrides = getConfigEnvOverrides(tempDir);

    assert.equal(overrides.CODEVAULT_EMBEDDING_DIMENSIONS, '1536');
    assert.equal(overrides.CODEVAULT_DIMENSIONS, '1536');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('getConfigEnvOverrides generates maxTokens overrides', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    fs.mkdirSync(configDir, { recursive: true });
    const testConfig: CodevaultConfig = {
      maxTokens: 8192
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(testConfig));

    const overrides = getConfigEnvOverrides(tempDir);

    assert.equal(overrides.CODEVAULT_EMBEDDING_MAX_TOKENS, '8192');
    assert.equal(overrides.CODEVAULT_MAX_TOKENS, '8192');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('getConfigEnvOverrides generates rate limit overrides', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    fs.mkdirSync(configDir, { recursive: true });
    const testConfig: CodevaultConfig = {
      rateLimit: {
        rpm: 100,
        tpm: 50000
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(testConfig));

    const overrides = getConfigEnvOverrides(tempDir);

    assert.equal(overrides.CODEVAULT_EMBEDDING_RATE_LIMIT_RPM, '100');
    assert.equal(overrides.CODEVAULT_RATE_LIMIT_RPM, '100');
    assert.equal(overrides.CODEVAULT_EMBEDDING_RATE_LIMIT_TPM, '50000');
    assert.equal(overrides.CODEVAULT_RATE_LIMIT_TPM, '50000');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('getConfigEnvOverrides generates encryption key override', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    fs.mkdirSync(configDir, { recursive: true });
    const testConfig: CodevaultConfig = {
      encryption: {
        enabled: true,
        key: 'my-encryption-key'
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(testConfig));

    const overrides = getConfigEnvOverrides(tempDir);

    assert.equal(overrides.CODEVAULT_ENCRYPTION_KEY, 'my-encryption-key');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('getConfigEnvOverrides generates reranker overrides', () => {
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
        model: 'rerank-v1'
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(testConfig));

    const overrides = getConfigEnvOverrides(tempDir);

    assert.equal(overrides.CODEVAULT_RERANK_API_URL, 'https://reranker.example.com');
    assert.equal(overrides.CODEVAULT_RERANK_API_KEY, 'reranker-key');
    assert.equal(overrides.CODEVAULT_RERANK_MODEL, 'rerank-v1');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('getConfigEnvOverrides generates chat LLM overrides', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    fs.mkdirSync(configDir, { recursive: true });
    const testConfig: CodevaultConfig = {
      chatLLM: {
        openai: {
          apiKey: 'chat-api-key',
          baseUrl: 'https://chat.example.com',
          model: 'gpt-4',
          maxTokens: 4096,
          temperature: 0.7
        }
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(testConfig));

    const overrides = getConfigEnvOverrides(tempDir);

    assert.equal(overrides.CODEVAULT_CHAT_API_KEY, 'chat-api-key');
    assert.equal(overrides.CODEVAULT_CHAT_BASE_URL, 'https://chat.example.com');
    assert.equal(overrides.CODEVAULT_CHAT_MODEL, 'gpt-4');
    assert.equal(overrides.CODEVAULT_CHAT_MAX_TOKENS, '4096');
    assert.equal(overrides.CODEVAULT_CHAT_TEMPERATURE, '0.7');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('getConfigEnvOverrides handles temperature of 0', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    fs.mkdirSync(configDir, { recursive: true });
    const testConfig: CodevaultConfig = {
      chatLLM: {
        openai: {
          temperature: 0
        }
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(testConfig));

    const overrides = getConfigEnvOverrides(tempDir);

    // Temperature of 0 should still be included
    assert.equal(overrides.CODEVAULT_CHAT_TEMPERATURE, '0');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('getConfigEnvOverrides generates all overrides for complete config', () => {
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
          apiKey: 'embed-key',
          baseUrl: 'https://embed.example.com',
          model: 'text-embedding-3-small',
          dimensions: 1536
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
        model: 'rerank-v1'
      },
      chatLLM: {
        openai: {
          apiKey: 'chat-key',
          baseUrl: 'https://chat.example.com',
          model: 'gpt-4',
          maxTokens: 4096,
          temperature: 0.5
        }
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(testConfig));

    const overrides = getConfigEnvOverrides(tempDir);

    // Verify all expected keys are present
    const expectedKeys = [
      'CODEVAULT_EMBEDDING_API_KEY',
      'OPENAI_API_KEY',
      'CODEVAULT_EMBEDDING_BASE_URL',
      'OPENAI_BASE_URL',
      'CODEVAULT_EMBEDDING_MODEL',
      'CODEVAULT_OPENAI_EMBEDDING_MODEL',
      'CODEVAULT_EMBEDDING_DIMENSIONS',
      'CODEVAULT_DIMENSIONS',
      'CODEVAULT_EMBEDDING_MAX_TOKENS',
      'CODEVAULT_MAX_TOKENS',
      'CODEVAULT_EMBEDDING_RATE_LIMIT_RPM',
      'CODEVAULT_RATE_LIMIT_RPM',
      'CODEVAULT_EMBEDDING_RATE_LIMIT_TPM',
      'CODEVAULT_RATE_LIMIT_TPM',
      'CODEVAULT_ENCRYPTION_KEY',
      'CODEVAULT_RERANK_API_URL',
      'CODEVAULT_RERANK_API_KEY',
      'CODEVAULT_RERANK_MODEL',
      'CODEVAULT_CHAT_API_KEY',
      'CODEVAULT_CHAT_BASE_URL',
      'CODEVAULT_CHAT_MODEL',
      'CODEVAULT_CHAT_MAX_TOKENS',
      'CODEVAULT_CHAT_TEMPERATURE'
    ];

    for (const key of expectedKeys) {
      assert.ok(key in overrides, `should have ${key} in overrides`);
    }
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

// =============================================================================
// applyConfigToEnv tests
// =============================================================================

test('applyConfigToEnv sets environment variables from config', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    fs.mkdirSync(configDir, { recursive: true });
    const testConfig: CodevaultConfig = {
      providers: {
        openai: {
          apiKey: 'applied-key',
          model: 'applied-model'
        }
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(testConfig));

    applyConfigToEnv(tempDir);

    assert.equal(process.env.CODEVAULT_EMBEDDING_API_KEY, 'applied-key');
    assert.equal(process.env.OPENAI_API_KEY, 'applied-key');
    assert.equal(process.env.CODEVAULT_EMBEDDING_MODEL, 'applied-model');
    assert.equal(process.env.CODEVAULT_OPENAI_EMBEDDING_MODEL, 'applied-model');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('applyConfigToEnv does not override existing environment variables', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    // Set existing env var
    process.env.CODEVAULT_EMBEDDING_API_KEY = 'existing-key';

    fs.mkdirSync(configDir, { recursive: true });
    const testConfig: CodevaultConfig = {
      providers: {
        openai: {
          apiKey: 'config-key',
          model: 'config-model'
        }
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(testConfig));

    applyConfigToEnv(tempDir);

    // Existing key should not be overwritten
    assert.equal(process.env.CODEVAULT_EMBEDDING_API_KEY, 'existing-key');

    // But other keys should be set
    assert.equal(process.env.CODEVAULT_EMBEDDING_MODEL, 'config-model');
    assert.equal(process.env.CODEVAULT_OPENAI_EMBEDDING_MODEL, 'config-model');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('applyConfigToEnv handles empty project config gracefully', () => {
  const tempDir = createTempDir();
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    // Should not throw for no project config in temp dir
    applyConfigToEnv(tempDir);

    // Function should complete without error
    // Note: global config may still set some values
    assert.ok(true, 'applyConfigToEnv should complete without error');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('applyConfigToEnv applies all config sections', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    fs.mkdirSync(configDir, { recursive: true });
    const testConfig: CodevaultConfig = {
      maxTokens: 4096,
      providers: {
        openai: {
          apiKey: 'embed-key'
        }
      },
      rateLimit: {
        rpm: 100
      },
      encryption: {
        key: 'enc-key'
      },
      reranker: {
        apiKey: 'rerank-key'
      },
      chatLLM: {
        openai: {
          apiKey: 'chat-key'
        }
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(testConfig));

    applyConfigToEnv(tempDir);

    assert.equal(process.env.CODEVAULT_EMBEDDING_API_KEY, 'embed-key');
    assert.equal(process.env.CODEVAULT_EMBEDDING_MAX_TOKENS, '4096');
    assert.equal(process.env.CODEVAULT_EMBEDDING_RATE_LIMIT_RPM, '100');
    assert.equal(process.env.CODEVAULT_ENCRYPTION_KEY, 'enc-key');
    assert.equal(process.env.CODEVAULT_RERANK_API_KEY, 'rerank-key');
    assert.equal(process.env.CODEVAULT_CHAT_API_KEY, 'chat-key');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('applyConfigToEnv uses default basePath', () => {
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    // Should not throw when called without basePath
    applyConfigToEnv();
  } finally {
    restoreEnv(saved);
  }
});

// =============================================================================
// getEffectiveConfig tests
// =============================================================================

test('getEffectiveConfig returns merged config', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    fs.mkdirSync(configDir, { recursive: true });
    const testConfig: CodevaultConfig = {
      maxTokens: 4096,
      providers: {
        openai: {
          model: 'project-model'
        }
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(testConfig));

    // Set env override
    process.env.CODEVAULT_EMBEDDING_API_KEY = 'env-key';

    const effective = getEffectiveConfig(tempDir);

    // Should have both project and env values
    assert.equal(effective.maxTokens, 4096);
    assert.equal(effective.providers?.openai?.model, 'project-model');
    assert.equal(effective.providers?.openai?.apiKey, 'env-key');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('getEffectiveConfig returns object for isolated temp dir', () => {
  const tempDir = createTempDir();
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    const effective = getEffectiveConfig(tempDir);

    // Should always return an object
    assert.ok(typeof effective === 'object');
    // Note: global config may still populate some fields
    // We just verify the function returns without error
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('getEffectiveConfig uses default basePath', () => {
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    // Should not throw when called without basePath
    const effective = getEffectiveConfig();

    assert.ok(typeof effective === 'object');
  } finally {
    restoreEnv(saved);
  }
});

test('getEffectiveConfig reflects env priority', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    fs.mkdirSync(configDir, { recursive: true });
    const testConfig: CodevaultConfig = {
      maxTokens: 2000,
      providers: {
        openai: {
          apiKey: 'project-key',
          model: 'project-model'
        }
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(testConfig));

    // Set env to override
    process.env.CODEVAULT_EMBEDDING_MAX_TOKENS = '8000';
    process.env.CODEVAULT_EMBEDDING_API_KEY = 'env-key';

    const effective = getEffectiveConfig(tempDir);

    // Env should override
    assert.equal(effective.maxTokens, 8000);
    assert.equal(effective.providers?.openai?.apiKey, 'env-key');

    // Non-overridden values should remain
    assert.equal(effective.providers?.openai?.model, 'project-model');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

// =============================================================================
// Edge cases
// =============================================================================

test('getConfigEnvOverrides returns overrides based on project config structure', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    fs.mkdirSync(configDir, { recursive: true });
    // Config with empty nested objects - project config with empty values
    const testConfig: CodevaultConfig = {
      providers: {
        openai: {}
      },
      rateLimit: {},
      encryption: {},
      reranker: {},
      chatLLM: {
        openai: {}
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(testConfig));

    const overrides = getConfigEnvOverrides(tempDir);

    // The function returns an object - global config may still contribute values
    // We verify the function runs without error
    assert.ok(typeof overrides === 'object');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('applyConfigToEnv sets project rate limits', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    fs.mkdirSync(configDir, { recursive: true });
    // Only RPM, no TPM in project config
    const testConfig: CodevaultConfig = {
      rateLimit: {
        rpm: 50
        // tpm not set
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(testConfig));

    applyConfigToEnv(tempDir);

    // The project config RPM should be set (or merged with global)
    // We verify the function runs and RPM is set
    const rpm = process.env.CODEVAULT_EMBEDDING_RATE_LIMIT_RPM;
    assert.ok(rpm !== undefined, 'RPM should be set');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('getConfigEnvOverrides does not include encryption key without value', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    fs.mkdirSync(configDir, { recursive: true });
    const testConfig: CodevaultConfig = {
      encryption: {
        enabled: true
        // key not set
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(testConfig));

    const overrides = getConfigEnvOverrides(tempDir);

    assert.ok(!('CODEVAULT_ENCRYPTION_KEY' in overrides));
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});
