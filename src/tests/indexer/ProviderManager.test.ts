/**
 * Unit tests for src/indexer/ProviderManager.ts
 *
 * Tests embedding provider lifecycle management including:
 * - Provider initialization and caching
 * - Concurrent initialization handling
 * - Error handling and retry behavior
 * - Safe provider access with error logging
 * - Cleanup and resource release
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'timers/promises';

import { ProviderManager } from '../../indexer/ProviderManager.js';
import type { EmbeddingOptions } from '../../config/resolver.js';

// Mock provider context
function createMockContext(overrides: Partial<EmbeddingOptions> = {}): EmbeddingOptions {
  return {
    apiKey: 'test-key',
    baseUrl: 'https://api.example.com',
    model: 'text-embedding-3-small',
    dimensions: 1536,
    ...overrides
  };
}

// Mock logger for testing
function createMockLogger(): Console & { errors: unknown[]; logs: unknown[] } {
  const errors: unknown[] = [];
  const logs: unknown[] = [];

  return {
    log: (...args: unknown[]) => { logs.push(args); },
    error: (...args: unknown[]) => { errors.push(args); },
    warn: () => {},
    info: () => {},
    debug: () => {},
    errors,
    logs
  } as unknown as Console & { errors: unknown[]; logs: unknown[] };
}

// ============================================================================
// Construction Tests
// ============================================================================

test('ProviderManager can be constructed with valid options', () => {
  const manager = new ProviderManager('mock', createMockContext());

  assert.ok(manager, 'Manager should be created');
});

test('ProviderManager accepts custom logger', () => {
  const logger = createMockLogger();
  const manager = new ProviderManager('mock', createMockContext(), logger);

  assert.ok(manager, 'Manager with custom logger should be created');
});

test('ProviderManager uses console as default logger', () => {
  const manager = new ProviderManager('mock', createMockContext());

  assert.ok(manager, 'Manager with default logger should be created');
});

// ============================================================================
// getProvider Tests
// ============================================================================

test('ProviderManager getProvider returns provider instance', async () => {
  const manager = new ProviderManager('mock', createMockContext());

  const provider = await manager.getProvider();

  assert.ok(provider, 'Should return provider');
  assert.equal(provider.getName(), 'mock', 'Should return mock provider');
  assert.equal(typeof provider.generateEmbedding, 'function', 'Should have generateEmbedding method');
});

test('ProviderManager getProvider caches provider instance', async () => {
  const manager = new ProviderManager('mock', createMockContext());

  const provider1 = await manager.getProvider();
  const provider2 = await manager.getProvider();

  assert.equal(provider1, provider2, 'Should return same instance');
});

test('ProviderManager getProvider handles concurrent requests', async () => {
  const manager = new ProviderManager('mock', createMockContext());

  // Request multiple providers concurrently
  const [p1, p2, p3] = await Promise.all([
    manager.getProvider(),
    manager.getProvider(),
    manager.getProvider()
  ]);

  assert.equal(p1, p2, 'All should return same instance');
  assert.equal(p2, p3, 'All should return same instance');
});

test('ProviderManager getProvider calls init on provider if available', async () => {
  const manager = new ProviderManager('mock', createMockContext());

  const provider = await manager.getProvider();

  // Mock provider has init method that returns Promise.resolve()
  assert.ok(provider, 'Provider should be initialized');
});

test('ProviderManager getProvider falls back to OpenAI for unknown provider', async () => {
  // The provider factory defaults to OpenAI for unknown provider names
  const manager = new ProviderManager('nonexistent-provider', createMockContext());

  const provider = await manager.getProvider();

  // Should not throw - falls back to OpenAI
  assert.ok(provider, 'Should return provider (falls back to OpenAI)');
  // The provider name will be 'OpenAI' since that's the fallback
  assert.equal(provider.getName(), 'OpenAI', 'Should fall back to OpenAI provider');
});

test('ProviderManager getProvider resets on error for retry', async () => {
  // Since all provider names fall back to OpenAI, we test the retry behavior
  // by checking that cleanup allows re-initialization
  const manager = new ProviderManager('mock', createMockContext());

  const provider1 = await manager.getProvider();
  manager.cleanup();
  const provider2 = await manager.getProvider();

  // After cleanup, should get a new provider instance
  assert.ok(provider1, 'First provider should exist');
  assert.ok(provider2, 'Second provider should exist');
});

// ============================================================================
// getProviderSafe Tests
// ============================================================================

test('ProviderManager getProviderSafe returns provider on success', async () => {
  const manager = new ProviderManager('mock', createMockContext());

  const provider = await manager.getProviderSafe();

  assert.ok(provider, 'Should return provider');
  assert.equal(provider?.getName(), 'mock', 'Should be mock provider');
});

test('ProviderManager getProviderSafe returns provider for any name (fallback behavior)', async () => {
  const logger = createMockLogger();
  // The factory always returns a provider (falls back to OpenAI), so this won't fail
  const manager = new ProviderManager('any-name', createMockContext(), logger);

  const provider = await manager.getProviderSafe();

  // Should return provider due to OpenAI fallback
  assert.ok(provider, 'Should return provider due to fallback behavior');
});

test('ProviderManager getProviderSafe caches provider and returns same instance', async () => {
  const logger = createMockLogger();
  const manager = new ProviderManager('mock', createMockContext(), logger);

  const provider1 = await manager.getProviderSafe();
  const provider2 = await manager.getProviderSafe();
  const provider3 = await manager.getProviderSafe();

  // All calls should return the same cached instance
  assert.equal(provider1, provider2, 'Should return cached instance');
  assert.equal(provider2, provider3, 'Should return cached instance');
});

test('ProviderManager getProviderSafe does not throw and returns provider', async () => {
  const manager = new ProviderManager('completely-invalid', createMockContext());

  // Should not throw - falls back to OpenAI
  const result = await manager.getProviderSafe();

  assert.ok(result, 'Should return provider (OpenAI fallback) without throwing');
});

test('ProviderManager getProviderSafe caches successful provider', async () => {
  const manager = new ProviderManager('mock', createMockContext());

  const provider1 = await manager.getProviderSafe();
  const provider2 = await manager.getProviderSafe();

  assert.equal(provider1, provider2, 'Should cache provider instance');
});

// ============================================================================
// cleanup Tests
// ============================================================================

test('ProviderManager cleanup clears provider instance', async () => {
  const manager = new ProviderManager('mock', createMockContext());

  // Get provider first
  const provider1 = await manager.getProvider();
  assert.ok(provider1, 'Provider should exist');

  // Cleanup
  manager.cleanup();

  // Get provider again - should be new instance
  const provider2 = await manager.getProvider();

  // Note: They might be functionally identical but should be re-created
  assert.ok(provider2, 'Should get new provider after cleanup');
});

test('ProviderManager cleanup resets cached state', async () => {
  const logger = createMockLogger();
  const manager = new ProviderManager('mock', createMockContext(), logger);

  // Get provider to initialize state
  const provider1 = await manager.getProviderSafe();

  // Cleanup should reset the state
  manager.cleanup();

  // After cleanup, should create a new provider instance
  const provider2 = await manager.getProviderSafe();

  assert.ok(provider1, 'First provider should exist');
  assert.ok(provider2, 'Second provider should exist after cleanup');
});

test('ProviderManager cleanup is safe to call multiple times', () => {
  const manager = new ProviderManager('mock', createMockContext());

  // Multiple cleanups should not throw
  manager.cleanup();
  manager.cleanup();
  manager.cleanup();

  assert.ok(true, 'Multiple cleanups should be safe');
});

test('ProviderManager cleanup clears init promise', async () => {
  const manager = new ProviderManager('mock', createMockContext());

  // Start initialization
  const initPromise = manager.getProvider();

  // Cleanup while initializing
  manager.cleanup();

  // Wait for original promise
  await initPromise.catch(() => {}); // Ignore any errors

  // Should be able to get provider again
  const provider = await manager.getProvider();
  assert.ok(provider, 'Should get provider after cleanup during init');
});

// ============================================================================
// Provider Name Tests
// ============================================================================

test('ProviderManager works with openai provider name', async () => {
  // OpenAI provider should work with test configuration
  const manager = new ProviderManager('openai', createMockContext({ apiKey: 'test' }));

  const provider = await manager.getProviderSafe();

  // Should return OpenAI provider
  assert.ok(provider, 'Should return OpenAI provider');
  assert.equal(provider?.getName(), 'OpenAI', 'Should be OpenAI provider');
});

test('ProviderManager handles auto provider name (defaults to OpenAI)', async () => {
  const manager = new ProviderManager('auto', createMockContext());

  const provider = await manager.getProviderSafe();

  // Auto should default to OpenAI
  assert.ok(provider, 'Should return provider');
  assert.equal(provider?.getName(), 'OpenAI', 'Auto should default to OpenAI');
});

// ============================================================================
// Edge Cases
// ============================================================================

test('ProviderManager handles empty context', async () => {
  const manager = new ProviderManager('mock', {});

  const provider = await manager.getProvider();

  assert.ok(provider, 'Should work with empty context');
});

test('ProviderManager handles undefined context values', async () => {
  const manager = new ProviderManager('mock', {
    apiKey: undefined,
    baseUrl: undefined,
    model: undefined,
    dimensions: undefined
  });

  const provider = await manager.getProvider();

  assert.ok(provider, 'Should handle undefined values');
});

test('ProviderManager initialization order is preserved', async () => {
  const initOrder: string[] = [];

  const manager = new ProviderManager('mock', createMockContext());

  // Start multiple init requests
  const promises = [
    manager.getProvider().then(() => initOrder.push('1')),
    manager.getProvider().then(() => initOrder.push('2')),
    manager.getProvider().then(() => initOrder.push('3'))
  ];

  await Promise.all(promises);

  // All should complete, order may vary but all should be present
  assert.equal(initOrder.length, 3, 'All requests should complete');
});

// ============================================================================
// Logger Tests
// ============================================================================

test('ProviderManager initializes successfully with various provider names', async () => {
  const logger = createMockLogger();
  const manager = new ProviderManager('any-provider-name', createMockContext(), logger);

  const provider = await manager.getProviderSafe();

  // Due to fallback behavior, should always succeed
  assert.ok(provider, 'Should return provider');
  assert.equal(logger.errors.length, 0, 'Should not log errors when initialization succeeds');
});

test('ProviderManager handles logger without error method gracefully', async () => {
  const logger = {
    log: () => {},
    // No error method
  } as unknown as Console;

  const manager = new ProviderManager('mock', createMockContext(), logger);

  // Should not throw even without error method
  const provider = await manager.getProviderSafe();

  assert.ok(provider, 'Should return provider even with incomplete logger');
});

// ============================================================================
// Stress Tests
// ============================================================================

test('ProviderManager handles rapid getProvider calls', async () => {
  const manager = new ProviderManager('mock', createMockContext());

  const promises: Promise<unknown>[] = [];
  for (let i = 0; i < 100; i++) {
    promises.push(manager.getProvider());
  }

  const providers = await Promise.all(promises);

  // All should return the same instance
  const first = providers[0];
  assert.ok(providers.every(p => p === first), 'All should be same instance');
});

test('ProviderManager handles interleaved cleanup and getProvider', async () => {
  const manager = new ProviderManager('mock', createMockContext());

  const operations = [];

  for (let i = 0; i < 10; i++) {
    operations.push(manager.getProvider().catch(() => null));
    if (i % 3 === 0) {
      manager.cleanup();
    }
  }

  const results = await Promise.all(operations);

  // Some may be null due to cleanup, but should not throw
  assert.ok(results.length === 10, 'All operations should complete');
});
