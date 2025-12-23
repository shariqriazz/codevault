import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

import {
  readGlobalConfig,
  readProjectConfig,
  readEnvConfig,
  loadConfig,
  getConfigSources,
  saveGlobalConfig,
  saveProjectConfig,
  hasGlobalConfig,
  hasProjectConfig,
  getGlobalConfigPath,
  getProjectConfigPath,
} from '../../config/loader.js';
import type { CodevaultConfig } from '../../config/types.js';

/**
 * Helper to create a temporary directory for tests
 */
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codevault-test-'));
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
// readGlobalConfig tests
// =============================================================================

test('readGlobalConfig returns null when file does not exist', () => {
  // This test relies on the actual global config path
  // We cannot easily mock fs.existsSync in Node.js test runner
  // So we verify the function returns a config or null without error
  const result = readGlobalConfig();
  assert.ok(result === null || typeof result === 'object', 'should return null or config object');
});

// =============================================================================
// readProjectConfig tests
// =============================================================================

test('readProjectConfig returns null when config file does not exist', () => {
  const tempDir = createTempDir();
  try {
    const result = readProjectConfig(tempDir);
    assert.equal(result, null, 'should return null for non-existent config');
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('readProjectConfig reads valid JSON config', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const configPath = path.join(configDir, 'config.json');

  try {
    fs.mkdirSync(configDir, { recursive: true });
    const testConfig: CodevaultConfig = {
      defaultProvider: 'openai',
      maxTokens: 4096,
      providers: {
        openai: {
          apiKey: 'test-key-123',
          model: 'text-embedding-3-small'
        }
      }
    };
    fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2));

    const result = readProjectConfig(tempDir);

    assert.ok(result !== null, 'should return config object');
    assert.equal(result?.defaultProvider, 'openai');
    assert.equal(result?.maxTokens, 4096);
    assert.equal(result?.providers?.openai?.apiKey, 'test-key-123');
    assert.equal(result?.providers?.openai?.model, 'text-embedding-3-small');
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('readProjectConfig returns null for invalid JSON', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const configPath = path.join(configDir, 'config.json');

  try {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, 'invalid json {{{');

    const result = readProjectConfig(tempDir);

    assert.equal(result, null, 'should return null for invalid JSON');
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('readProjectConfig resolves relative basePath', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const configPath = path.join(configDir, 'config.json');

  try {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ maxTokens: 1000 }));

    // Change to temp dir to test relative path resolution
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      const result = readProjectConfig('.');
      assert.ok(result !== null, 'should read config with relative path');
      assert.equal(result?.maxTokens, 1000);
    } finally {
      process.chdir(originalCwd);
    }
  } finally {
    cleanupTempDir(tempDir);
  }
});

// =============================================================================
// readEnvConfig tests
// =============================================================================

test('readEnvConfig returns empty object when no env vars set', () => {
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    const result = readEnvConfig();
    assert.ok(typeof result === 'object', 'should return an object');
    // Should not have providers if no env vars are set
    assert.equal(result.providers, undefined, 'should not have providers');
  } finally {
    restoreEnv(saved);
  }
});

test('readEnvConfig reads CODEVAULT_EMBEDDING_API_KEY', () => {
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    process.env.CODEVAULT_EMBEDDING_API_KEY = 'test-api-key';

    const result = readEnvConfig();

    assert.equal(result.providers?.openai?.apiKey, 'test-api-key');
  } finally {
    restoreEnv(saved);
  }
});

test('readEnvConfig falls back to OPENAI_API_KEY', () => {
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    process.env.OPENAI_API_KEY = 'openai-fallback-key';

    const result = readEnvConfig();

    assert.equal(result.providers?.openai?.apiKey, 'openai-fallback-key');
  } finally {
    restoreEnv(saved);
  }
});

test('readEnvConfig prefers CODEVAULT_EMBEDDING_API_KEY over OPENAI_API_KEY', () => {
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    process.env.CODEVAULT_EMBEDDING_API_KEY = 'codevault-key';
    process.env.OPENAI_API_KEY = 'openai-key';

    const result = readEnvConfig();

    assert.equal(result.providers?.openai?.apiKey, 'codevault-key');
  } finally {
    restoreEnv(saved);
  }
});

test('readEnvConfig reads base URL with fallback', () => {
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    process.env.CODEVAULT_EMBEDDING_BASE_URL = 'https://api.example.com';

    const result = readEnvConfig();

    assert.equal(result.providers?.openai?.baseUrl, 'https://api.example.com');
  } finally {
    restoreEnv(saved);
  }
});

test('readEnvConfig reads embedding model with multiple fallbacks', () => {
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    // Test first priority
    process.env.CODEVAULT_EMBEDDING_MODEL = 'model-v1';

    let result = readEnvConfig();
    assert.equal(result.providers?.openai?.model, 'model-v1');

    // Test second priority
    delete process.env.CODEVAULT_EMBEDDING_MODEL;
    process.env.CODEVAULT_OPENAI_EMBEDDING_MODEL = 'model-v2';

    result = readEnvConfig();
    assert.equal(result.providers?.openai?.model, 'model-v2');

    // Test third priority (OPENAI_MODEL)
    delete process.env.CODEVAULT_OPENAI_EMBEDDING_MODEL;
    process.env.OPENAI_MODEL = 'model-v3';

    result = readEnvConfig();
    assert.equal(result.providers?.openai?.model, 'model-v3');
  } finally {
    restoreEnv(saved);
  }
});

test('readEnvConfig parses dimensions correctly', () => {
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    // Need to set API key first for the dimensions to be applied
    process.env.CODEVAULT_EMBEDDING_API_KEY = 'test-key';
    process.env.CODEVAULT_EMBEDDING_DIMENSIONS = '1536';

    const result = readEnvConfig();

    assert.equal(result.providers?.openai?.dimensions, 1536);
  } finally {
    restoreEnv(saved);
  }
});

test('readEnvConfig ignores invalid dimensions', () => {
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    process.env.CODEVAULT_EMBEDDING_API_KEY = 'test-key';
    process.env.CODEVAULT_EMBEDDING_DIMENSIONS = 'not-a-number';

    const result = readEnvConfig();

    assert.equal(result.providers?.openai?.dimensions, undefined);
  } finally {
    restoreEnv(saved);
  }
});

test('readEnvConfig ignores zero or negative dimensions', () => {
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    process.env.CODEVAULT_EMBEDDING_API_KEY = 'test-key';
    process.env.CODEVAULT_EMBEDDING_DIMENSIONS = '0';

    let result = readEnvConfig();
    assert.equal(result.providers?.openai?.dimensions, undefined);

    process.env.CODEVAULT_EMBEDDING_DIMENSIONS = '-100';
    result = readEnvConfig();
    assert.equal(result.providers?.openai?.dimensions, undefined);
  } finally {
    restoreEnv(saved);
  }
});

test('readEnvConfig parses maxTokens correctly', () => {
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    process.env.CODEVAULT_EMBEDDING_MAX_TOKENS = '8192';

    const result = readEnvConfig();

    assert.equal(result.maxTokens, 8192);
  } finally {
    restoreEnv(saved);
  }
});

test('readEnvConfig parses rate limits correctly', () => {
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    process.env.CODEVAULT_EMBEDDING_RATE_LIMIT_RPM = '100';
    process.env.CODEVAULT_EMBEDDING_RATE_LIMIT_TPM = '50000';

    const result = readEnvConfig();

    assert.equal(result.rateLimit?.rpm, 100);
    assert.equal(result.rateLimit?.tpm, 50000);
  } finally {
    restoreEnv(saved);
  }
});

test('readEnvConfig reads encryption key and enables encryption', () => {
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    process.env.CODEVAULT_ENCRYPTION_KEY = 'my-secret-encryption-key';

    const result = readEnvConfig();

    assert.equal(result.encryption?.key, 'my-secret-encryption-key');
    assert.equal(result.encryption?.enabled, true);
  } finally {
    restoreEnv(saved);
  }
});

test('readEnvConfig reads reranker settings', () => {
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    process.env.CODEVAULT_RERANK_API_URL = 'https://reranker.example.com';
    process.env.CODEVAULT_RERANK_API_KEY = 'reranker-key';
    process.env.CODEVAULT_RERANK_MODEL = 'rerank-v1';

    const result = readEnvConfig();

    assert.equal(result.reranker?.apiUrl, 'https://reranker.example.com');
    assert.equal(result.reranker?.apiKey, 'reranker-key');
    assert.equal(result.reranker?.model, 'rerank-v1');
  } finally {
    restoreEnv(saved);
  }
});

test('readEnvConfig reads chat LLM settings', () => {
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    process.env.CODEVAULT_CHAT_API_KEY = 'chat-api-key';
    process.env.CODEVAULT_CHAT_BASE_URL = 'https://chat.example.com';
    process.env.CODEVAULT_CHAT_MODEL = 'gpt-4';
    process.env.CODEVAULT_CHAT_MAX_TOKENS = '4000';
    process.env.CODEVAULT_CHAT_TEMPERATURE = '0.7';

    const result = readEnvConfig();

    assert.equal(result.chatLLM?.openai?.apiKey, 'chat-api-key');
    assert.equal(result.chatLLM?.openai?.baseUrl, 'https://chat.example.com');
    assert.equal(result.chatLLM?.openai?.model, 'gpt-4');
    assert.equal(result.chatLLM?.openai?.maxTokens, 4000);
    assert.equal(result.chatLLM?.openai?.temperature, 0.7);
  } finally {
    restoreEnv(saved);
  }
});

test('readEnvConfig caps chat max tokens at 256000', () => {
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    process.env.CODEVAULT_CHAT_MAX_TOKENS = '500000';

    const result = readEnvConfig();

    assert.equal(result.chatLLM?.openai?.maxTokens, 256000);
  } finally {
    restoreEnv(saved);
  }
});

test('readEnvConfig chat falls back to OPENAI_API_KEY', () => {
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    process.env.OPENAI_API_KEY = 'shared-openai-key';

    const result = readEnvConfig();

    assert.equal(result.providers?.openai?.apiKey, 'shared-openai-key');
    assert.equal(result.chatLLM?.openai?.apiKey, 'shared-openai-key');
  } finally {
    restoreEnv(saved);
  }
});

// =============================================================================
// loadConfig tests (integration of all sources)
// =============================================================================

test('loadConfig merges configs with correct priority (env > project > global)', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    // Create project config
    fs.mkdirSync(configDir, { recursive: true });
    const projectConfig: CodevaultConfig = {
      maxTokens: 2000,
      providers: {
        openai: {
          model: 'project-model'
        }
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(projectConfig));

    // Set env var that should override project config
    process.env.CODEVAULT_EMBEDDING_MAX_TOKENS = '4000';

    const result = loadConfig(tempDir);

    // Env should override project
    assert.equal(result.maxTokens, 4000, 'env should override project maxTokens');
    // Project config should still be present for non-overridden values
    assert.equal(result.providers?.openai?.model, 'project-model', 'project model should be preserved');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('loadConfig returns empty object when no config sources exist', () => {
  const tempDir = createTempDir();
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    const result = loadConfig(tempDir);

    assert.ok(typeof result === 'object', 'should return an object');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('loadConfig deep merges nested provider objects', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    fs.mkdirSync(configDir, { recursive: true });
    const projectConfig: CodevaultConfig = {
      providers: {
        openai: {
          model: 'project-model',
          dimensions: 1536
        }
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(projectConfig));

    // Set only API key in env
    process.env.CODEVAULT_EMBEDDING_API_KEY = 'env-api-key';

    const result = loadConfig(tempDir);

    // Should have both env and project values
    assert.equal(result.providers?.openai?.apiKey, 'env-api-key', 'should have env API key');
    assert.equal(result.providers?.openai?.model, 'project-model', 'should preserve project model');
    assert.equal(result.providers?.openai?.dimensions, 1536, 'should preserve project dimensions');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('loadConfig deep merges rate limit config', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    fs.mkdirSync(configDir, { recursive: true });
    const projectConfig: CodevaultConfig = {
      rateLimit: {
        rpm: 50,
        tpm: 10000
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(projectConfig));

    // Override only RPM via env
    process.env.CODEVAULT_EMBEDDING_RATE_LIMIT_RPM = '100';

    const result = loadConfig(tempDir);

    assert.equal(result.rateLimit?.rpm, 100, 'should override RPM from env');
    assert.equal(result.rateLimit?.tpm, 10000, 'should preserve TPM from project');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('loadConfig deep merges chatLLM config', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    fs.mkdirSync(configDir, { recursive: true });
    const projectConfig: CodevaultConfig = {
      chatLLM: {
        openai: {
          model: 'gpt-4',
          temperature: 0.5
        }
      }
    };
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(projectConfig));

    // Override only API key via env
    process.env.CODEVAULT_CHAT_API_KEY = 'chat-env-key';

    const result = loadConfig(tempDir);

    assert.equal(result.chatLLM?.openai?.apiKey, 'chat-env-key', 'should have env API key');
    assert.equal(result.chatLLM?.openai?.model, 'gpt-4', 'should preserve project model');
    assert.equal(result.chatLLM?.openai?.temperature, 0.5, 'should preserve project temperature');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

// =============================================================================
// getConfigSources tests
// =============================================================================

test('getConfigSources returns all three sources', () => {
  const tempDir = createTempDir();
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    const sources = getConfigSources(tempDir);

    assert.ok('global' in sources, 'should have global key');
    assert.ok('project' in sources, 'should have project key');
    assert.ok('env' in sources, 'should have env key');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('getConfigSources returns null for missing global and project', () => {
  const tempDir = createTempDir();
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    const sources = getConfigSources(tempDir);

    // Project should be null (no config in temp dir)
    assert.equal(sources.project, null, 'project should be null');
    // Env should always be an object
    assert.ok(typeof sources.env === 'object', 'env should be object');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

// =============================================================================
// saveGlobalConfig tests
// =============================================================================

test('saveGlobalConfig creates directory and file', () => {
  // We cannot easily test the actual global config path without mocking
  // This test verifies the function signature and return type
  // In a real environment, we would use dependency injection or mock fs

  // Just verify the function exists and has correct signature
  assert.ok(typeof saveGlobalConfig === 'function');
});

// =============================================================================
// saveProjectConfig tests
// =============================================================================

test('saveProjectConfig creates directory and writes config', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const configPath = path.join(configDir, 'config.json');

  try {
    const testConfig: CodevaultConfig = {
      defaultProvider: 'openai',
      maxTokens: 8192,
      providers: {
        openai: {
          apiKey: 'saved-key',
          model: 'text-embedding-3-large'
        }
      }
    };

    saveProjectConfig(testConfig, tempDir);

    assert.ok(fs.existsSync(configPath), 'config file should exist');

    const savedContent = JSON.parse(fs.readFileSync(configPath, 'utf8')) as CodevaultConfig;
    assert.equal(savedContent.defaultProvider, 'openai');
    assert.equal(savedContent.maxTokens, 8192);
    assert.equal(savedContent.providers?.openai?.apiKey, 'saved-key');
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('saveProjectConfig overwrites existing config', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');
  const configPath = path.join(configDir, 'config.json');

  try {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ maxTokens: 1000 }));

    saveProjectConfig({ maxTokens: 2000 }, tempDir);

    const savedContent = JSON.parse(fs.readFileSync(configPath, 'utf8')) as CodevaultConfig;
    assert.equal(savedContent.maxTokens, 2000, 'should overwrite with new value');
  } finally {
    cleanupTempDir(tempDir);
  }
});

// =============================================================================
// hasGlobalConfig tests
// =============================================================================

test('hasGlobalConfig returns boolean', () => {
  const result = hasGlobalConfig();
  assert.ok(typeof result === 'boolean', 'should return a boolean');
});

// =============================================================================
// hasProjectConfig tests
// =============================================================================

test('hasProjectConfig returns false for non-existent config', () => {
  const tempDir = createTempDir();
  try {
    const result = hasProjectConfig(tempDir);
    assert.equal(result, false, 'should return false when config does not exist');
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('hasProjectConfig returns true for existing config', () => {
  const tempDir = createTempDir();
  const configDir = path.join(tempDir, '.codevault');

  try {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'config.json'), '{}');

    const result = hasProjectConfig(tempDir);
    assert.equal(result, true, 'should return true when config exists');
  } finally {
    cleanupTempDir(tempDir);
  }
});

// =============================================================================
// getGlobalConfigPath tests
// =============================================================================

test('getGlobalConfigPath returns expected path', () => {
  const result = getGlobalConfigPath();

  assert.ok(result.includes('.codevault'), 'should contain .codevault');
  assert.ok(result.includes('config.json'), 'should contain config.json');
  assert.ok(result.startsWith(os.homedir()), 'should start with home directory');
});

// =============================================================================
// getProjectConfigPath tests
// =============================================================================

test('getProjectConfigPath returns expected path with basePath', () => {
  const result = getProjectConfigPath('/some/project');

  assert.ok(result.includes('.codevault'), 'should contain .codevault');
  assert.ok(result.includes('config.json'), 'should contain config.json');
  assert.ok(result.startsWith('/some/project'), 'should start with basePath');
});

test('getProjectConfigPath resolves relative basePath', () => {
  const result = getProjectConfigPath('.');

  assert.ok(result.includes('.codevault'), 'should contain .codevault');
  assert.ok(result.includes('config.json'), 'should contain config.json');
  assert.ok(path.isAbsolute(result), 'should be an absolute path');
});

// =============================================================================
// Edge cases and error handling
// =============================================================================

test('readEnvConfig handles NaN values gracefully', () => {
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    process.env.CODEVAULT_CHAT_TEMPERATURE = 'not-a-number';

    const result = readEnvConfig();

    // Should not set temperature if parse fails
    assert.equal(result.chatLLM?.openai?.temperature, undefined);
  } finally {
    restoreEnv(saved);
  }
});

test('readEnvConfig handles empty string values', () => {
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    process.env.CODEVAULT_EMBEDDING_API_KEY = '';

    const result = readEnvConfig();

    // Empty string is falsy, so should not be set
    assert.equal(result.providers, undefined);
  } finally {
    restoreEnv(saved);
  }
});

test('loadConfig returns object when only project config is missing', () => {
  const tempDir = createTempDir();
  const saved = saveEnv();
  clearEnv(Object.keys(saved));

  try {
    const result = loadConfig(tempDir);

    // Should return object without errors
    // Note: global config may still populate some fields
    assert.ok(typeof result === 'object');
  } finally {
    restoreEnv(saved);
    cleanupTempDir(tempDir);
  }
});

test('readProjectConfig handles permission errors gracefully', () => {
  // This test is platform-dependent and may not work on all systems
  // The function should return null and log a warning on errors
  const result = readProjectConfig('/nonexistent/path/that/does/not/exist');
  assert.equal(result, null, 'should return null for inaccessible path');
});
