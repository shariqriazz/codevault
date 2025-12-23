/**
 * Unit tests for interactive-config.ts
 * Tests the interactive configuration module exports and function signature
 */
import test from 'node:test';
import assert from 'node:assert/strict';

test('runInteractiveConfig is exported as a function', async () => {
  const { runInteractiveConfig } = await import('../../cli/commands/interactive-config.js');
  assert.equal(typeof runInteractiveConfig, 'function', 'runInteractiveConfig should be a function');
});

test('runInteractiveConfig accepts optional force parameter', async () => {
  const { runInteractiveConfig } = await import('../../cli/commands/interactive-config.js');

  // Check function signature - should accept 0 or 1 argument
  assert.ok(runInteractiveConfig.length <= 1,
    'runInteractiveConfig should accept 0 or 1 parameter');
});

test('runInteractiveConfig returns a Promise', async () => {
  // We cannot actually run the interactive config in tests (requires terminal),
  // but we can verify it returns a promise by checking it's an async function
  const { runInteractiveConfig } = await import('../../cli/commands/interactive-config.js');

  // Async functions have 'AsyncFunction' as constructor name
  assert.equal(runInteractiveConfig.constructor.name, 'AsyncFunction',
    'runInteractiveConfig should be an async function');
});

// Note: The interactive config module cannot be fully tested in automated tests
// because it requires interactive terminal input (readline). The tests below
// verify the module structure and exports.

test('interactive-config module exports runInteractiveConfig', async () => {
  const module = await import('../../cli/commands/interactive-config.js');
  assert.ok('runInteractiveConfig' in module, 'module should export runInteractiveConfig');
});
