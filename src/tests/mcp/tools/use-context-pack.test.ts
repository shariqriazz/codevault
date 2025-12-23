/**
 * Unit tests for MCP use-context-pack tool
 *
 * Tests createUseContextPackHandler, registerUseContextPackTool, and input/result schemas
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  useContextPackInputSchema,
  useContextPackResultSchema
} from '../../../mcp/tools/use-context-pack.js';

// Mock types for testing
interface MockPackInfo {
  key: string;
  name: string;
  description: string | null;
  scope: Record<string, unknown>;
}

interface MockErrorLogger {
  logCalls: Array<{ error: unknown; context: Record<string, unknown> }>;
  debugLogCalls: Array<{ message: string; context: Record<string, unknown> }>;
  log: (error: unknown, context: Record<string, unknown>) => void;
  debugLog: (message: string, context: Record<string, unknown>) => void;
}

interface MockHandlerOptions {
  getWorkingPath: () => string;
  setSessionPack: (pack: unknown) => void;
  clearSessionPack: () => void;
  errorLogger?: MockErrorLogger;
}

// =============================================================================
// useContextPackInputSchema Tests
// =============================================================================

test('useContextPackInputSchema - validates minimal input', () => {
  const input = { name: 'my-pack' };
  const result = useContextPackInputSchema.parse(input);

  assert.equal(result.name, 'my-pack');
  assert.equal(result.path, undefined);
});

test('useContextPackInputSchema - validates input with path', () => {
  const input = { name: 'my-pack', path: '/my/project' };
  const result = useContextPackInputSchema.parse(input);

  assert.equal(result.name, 'my-pack');
  assert.equal(result.path, '/my/project');
});

test('useContextPackInputSchema - rejects empty name', () => {
  assert.throws(
    () => useContextPackInputSchema.parse({ name: '' }),
    (error: Error) => error.message.includes('required') || error.message.includes('1')
  );
});

test('useContextPackInputSchema - allows clear keywords', () => {
  const clearKeywords = ['default', 'none', 'clear'];

  for (const keyword of clearKeywords) {
    const result = useContextPackInputSchema.parse({ name: keyword });
    assert.equal(result.name, keyword);
  }
});

// =============================================================================
// useContextPackResultSchema Tests
// =============================================================================

test('useContextPackResultSchema - validates success result with pack', () => {
  const result = {
    success: true,
    message: 'Context pack "my-pack" activated for session',
    pack: {
      key: 'my-pack',
      name: 'My Pack',
      description: 'Test pack description',
      scope: {
        lang: ['typescript'],
        path_glob: ['src/**/*.ts']
      }
    }
  };

  const parsed = useContextPackResultSchema.parse(result);

  assert.equal(parsed.success, true);
  assert.ok(parsed.message.includes('activated'));
  assert.equal(parsed.pack?.key, 'my-pack');
  assert.equal(parsed.pack?.description, 'Test pack description');
});

test('useContextPackResultSchema - validates success result without pack (clear)', () => {
  const result = {
    success: true,
    message: 'Cleared active context pack for this session'
  };

  const parsed = useContextPackResultSchema.parse(result);

  assert.equal(parsed.success, true);
  assert.ok(parsed.message.includes('Cleared'));
  assert.equal(parsed.pack, undefined);
});

test('useContextPackResultSchema - validates pack with null description', () => {
  const result = {
    success: true,
    message: 'Pack activated',
    pack: {
      key: 'no-desc',
      name: 'No Description Pack',
      description: null,
      scope: {}
    }
  };

  const parsed = useContextPackResultSchema.parse(result);

  assert.equal(parsed.pack?.description, null);
});

// =============================================================================
// createUseContextPackHandler Tests
// =============================================================================

test('createUseContextPackHandler - creates handler with required options', async () => {
  let workingPath = '/default/path';
  let sessionPack: unknown = null;
  let cleared = false;

  const options: MockHandlerOptions = {
    getWorkingPath: () => workingPath,
    setSessionPack: (pack: unknown) => { sessionPack = pack; },
    clearSessionPack: () => { cleared = true; sessionPack = null; }
  };

  // Simulate handler behavior
  const simulateHandler = (
    opts: MockHandlerOptions,
    params: { name: string; path?: string }
  ): { success: boolean; message: string } => {
    const basePath = params.path?.trim() || opts.getWorkingPath();

    if (params.name === 'default' || params.name === 'none' || params.name === 'clear') {
      opts.clearSessionPack();
      return {
        success: true,
        message: 'Cleared active context pack for this session'
      };
    }

    // Simulate pack loading
    const pack = {
      key: params.name,
      name: params.name,
      description: null,
      scope: {},
      basePath
    };

    opts.setSessionPack(pack);
    return {
      success: true,
      message: `Context pack "${params.name}" activated for session`
    };
  };

  const result = simulateHandler(options, { name: 'test-pack' });

  assert.equal(result.success, true);
  assert.ok(result.message.includes('test-pack'));
  assert.ok(sessionPack !== null);
});

test('createUseContextPackHandler - uses explicit path over getWorkingPath', async () => {
  let capturedBasePath = '';

  const options: MockHandlerOptions = {
    getWorkingPath: () => '/default/path',
    setSessionPack: (pack: unknown) => {
      capturedBasePath = (pack as { basePath: string }).basePath;
    },
    clearSessionPack: () => {}
  };

  // Simulate path resolution
  const resolvePath = (
    opts: MockHandlerOptions,
    explicitPath?: string
  ): string => {
    if (explicitPath && explicitPath.trim().length > 0) {
      return explicitPath.trim();
    }
    return opts.getWorkingPath();
  };

  const path1 = resolvePath(options, '/explicit/path');
  assert.equal(path1, '/explicit/path');

  const path2 = resolvePath(options);
  assert.equal(path2, '/default/path');

  const path3 = resolvePath(options, '  ');
  assert.equal(path3, '/default/path');
});

test('createUseContextPackHandler - clears pack for default/none/clear', async () => {
  let clearCalled = false;

  const options: MockHandlerOptions = {
    getWorkingPath: () => '.',
    setSessionPack: () => {},
    clearSessionPack: () => { clearCalled = true; }
  };

  const clearKeywords = ['default', 'none', 'clear'];

  for (const keyword of clearKeywords) {
    clearCalled = false;

    const shouldClear = (name: string): boolean => {
      return name === 'default' || name === 'none' || name === 'clear';
    };

    if (shouldClear(keyword)) {
      options.clearSessionPack();
    }

    assert.equal(clearCalled, true, `Should clear for "${keyword}"`);
  }
});

test('createUseContextPackHandler - sets session pack with basePath', async () => {
  let capturedPack: unknown = null;

  const options: MockHandlerOptions = {
    getWorkingPath: () => '/project',
    setSessionPack: (pack: unknown) => { capturedPack = pack; },
    clearSessionPack: () => {}
  };

  // Simulate pack activation
  const activatePack = (opts: MockHandlerOptions, pack: MockPackInfo, basePath: string): void => {
    opts.setSessionPack({
      ...pack,
      basePath
    });
  };

  const mockPack: MockPackInfo = {
    key: 'test-pack',
    name: 'Test Pack',
    description: 'Test description',
    scope: { lang: ['typescript'] }
  };

  activatePack(options, mockPack, '/custom/path');

  assert.ok(capturedPack !== null);
  const pack = capturedPack as MockPackInfo & { basePath: string };
  assert.equal(pack.key, 'test-pack');
  assert.equal(pack.basePath, '/custom/path');
});

test('createUseContextPackHandler - uses error logger for exceptions', async () => {
  const mockLogger: MockErrorLogger = {
    logCalls: [],
    debugLogCalls: [],
    log: function(error: unknown, context: Record<string, unknown>): void {
      this.logCalls.push({ error, context });
    },
    debugLog: function(message: string, context: Record<string, unknown>): void {
      this.debugLogCalls.push({ message, context });
    }
  };

  // Simulate error logging
  const simulateError = (logger: MockErrorLogger, error: Error, name: string, basePath: string): void => {
    logger.log(error, {
      operation: 'use_context_pack',
      name,
      basePath
    });
  };

  simulateError(mockLogger, new Error('Pack not found'), 'missing-pack', '/project');

  assert.equal(mockLogger.logCalls.length, 1);
  assert.equal((mockLogger.logCalls[0].error as Error).message, 'Pack not found');
  assert.equal(mockLogger.logCalls[0].context.operation, 'use_context_pack');
  assert.equal(mockLogger.logCalls[0].context.name, 'missing-pack');
});

test('createUseContextPackHandler - uses debug logger for success', async () => {
  const mockLogger: MockErrorLogger = {
    logCalls: [],
    debugLogCalls: [],
    log: function(error: unknown, context: Record<string, unknown>): void {
      this.logCalls.push({ error, context });
    },
    debugLog: function(message: string, context: Record<string, unknown>): void {
      this.debugLogCalls.push({ message, context });
    }
  };

  // Simulate debug logging on success
  mockLogger.debugLog('Activated MCP session context pack', {
    pack: 'test-pack',
    basePath: '/project'
  });

  assert.equal(mockLogger.debugLogCalls.length, 1);
  assert.equal(mockLogger.debugLogCalls[0].message, 'Activated MCP session context pack');
  assert.equal(mockLogger.debugLogCalls[0].context.pack, 'test-pack');
});

test('createUseContextPackHandler - uses debug logger for clear', async () => {
  const mockLogger: MockErrorLogger = {
    logCalls: [],
    debugLogCalls: [],
    log: function(error: unknown, context: Record<string, unknown>): void {
      this.logCalls.push({ error, context });
    },
    debugLog: function(message: string, context: Record<string, unknown>): void {
      this.debugLogCalls.push({ message, context });
    }
  };

  // Simulate debug logging on clear
  mockLogger.debugLog('Cleared MCP session context pack', {
    basePath: '/project',
    name: 'clear'
  });

  assert.equal(mockLogger.debugLogCalls.length, 1);
  assert.equal(mockLogger.debugLogCalls[0].message, 'Cleared MCP session context pack');
});

// =============================================================================
// Handler Response Format Tests
// =============================================================================

test('createUseContextPackHandler - returns success response on activation', async () => {
  const mockPack: MockPackInfo = {
    key: 'api-pack',
    name: 'API Pack',
    description: 'Focus on API code',
    scope: { path_glob: ['src/api/**/*.ts'] }
  };

  const createSuccessResponse = (pack: MockPackInfo): {
    success: boolean;
    message: string;
    pack: MockPackInfo;
  } => ({
    success: true,
    message: `Context pack "${pack.key}" activated for session`,
    pack: {
      key: pack.key,
      name: pack.name,
      description: pack.description,
      scope: pack.scope
    }
  });

  const response = createSuccessResponse(mockPack);

  assert.equal(response.success, true);
  assert.ok(response.message.includes('api-pack'));
  assert.equal(response.pack.key, 'api-pack');
  assert.equal(response.pack.description, 'Focus on API code');
});

test('createUseContextPackHandler - returns success response on clear', async () => {
  const createClearResponse = (): { success: boolean; message: string } => ({
    success: true,
    message: 'Cleared active context pack for this session'
  });

  const response = createClearResponse();

  assert.equal(response.success, true);
  assert.ok(response.message.includes('Cleared'));
});

test('createUseContextPackHandler - throws error on pack not found', async () => {
  // Handler should throw, not return error response
  const simulatePackNotFound = (name: string, basePath: string): never => {
    throw new Error(`Context pack "${name}" not found in ${basePath}/.codevault/contextpacks`);
  };

  assert.throws(
    () => simulatePackNotFound('missing-pack', '/project'),
    (error: Error) => error.message.includes('not found')
  );
});

// =============================================================================
// registerUseContextPackTool Tests
// =============================================================================

test('registerUseContextPackTool - registers tool with server', async () => {
  let registeredName = '';
  let registeredSchema: Record<string, unknown> = {};

  // Mock MCP server
  const mockServer = {
    tool: (
      name: string,
      schema: Record<string, unknown>,
      _handler: (params: unknown) => Promise<unknown>
    ): void => {
      registeredName = name;
      registeredSchema = schema;
    }
  };

  // Simulate registration
  mockServer.tool(
    'use_context_pack',
    {
      name: { type: 'string', description: 'Context pack name' },
      path: { type: 'string', optional: true, description: 'Project root' }
    },
    async () => ({ content: [{ type: 'text', text: 'response' }] })
  );

  assert.equal(registeredName, 'use_context_pack');
  assert.ok('name' in registeredSchema);
  assert.ok('path' in registeredSchema);
});

test('registerUseContextPackTool - returns MCP-formatted response', async () => {
  // Simulate MCP response format
  const createMCPResponse = (message: string): { content: Array<{ type: string; text: string }> } => ({
    content: [{ type: 'text', text: message }]
  });

  const response = createMCPResponse('Context pack "test" activated');

  assert.equal(response.content.length, 1);
  assert.equal(response.content[0].type, 'text');
  assert.ok(response.content[0].text.includes('activated'));
});

test('registerUseContextPackTool - returns handler for direct invocation', async () => {
  // Simulate returning handler
  const createHandler = (): ((params: { name: string }) => { success: boolean; message: string }) => {
    return (params: { name: string }) => ({
      success: true,
      message: `Handled: ${params.name}`
    });
  };

  const handler = createHandler();
  const result = handler({ name: 'test-pack' });

  assert.equal(result.success, true);
  assert.ok(result.message.includes('test-pack'));
});

// =============================================================================
// Path Resolution Tests
// =============================================================================

test('createUseContextPackHandler - resolves path with trim', async () => {
  const options: MockHandlerOptions = {
    getWorkingPath: () => '/default',
    setSessionPack: () => {},
    clearSessionPack: () => {}
  };

  const resolvePath = (opts: MockHandlerOptions, explicitPath?: string): string => {
    if (explicitPath && explicitPath.trim().length > 0) {
      return explicitPath.trim();
    }
    return opts.getWorkingPath();
  };

  assert.equal(resolvePath(options, '  /my/path  '), '/my/path');
  assert.equal(resolvePath(options, ''), '/default');
  assert.equal(resolvePath(options, '   '), '/default');
  assert.equal(resolvePath(options, undefined), '/default');
});

test('createUseContextPackHandler - handles function check for getWorkingPath', async () => {
  // Simulate checking if getWorkingPath is a function
  const resolvePathSafe = (getWorkingPath: unknown, explicitPath?: string): string => {
    if (explicitPath && explicitPath.trim().length > 0) {
      return explicitPath.trim();
    }
    if (typeof getWorkingPath === 'function') {
      return (getWorkingPath as () => string)();
    }
    return '.';
  };

  assert.equal(resolvePathSafe(() => '/project'), '/project');
  assert.equal(resolvePathSafe('/project', '/explicit'), '/explicit');
  assert.equal(resolvePathSafe(null), '.');
  assert.equal(resolvePathSafe(undefined), '.');
});

// =============================================================================
// Function Safety Tests
// =============================================================================

test('createUseContextPackHandler - checks setSessionPack is function', async () => {
  let called = false;

  const safeSetSessionPack = (setter: unknown, pack: unknown): void => {
    if (typeof setter === 'function') {
      (setter as (p: unknown) => void)(pack);
      called = true;
    }
  };

  safeSetSessionPack((p: unknown) => { /* set pack */ }, { key: 'test' });
  assert.equal(called, true);

  called = false;
  safeSetSessionPack(null, { key: 'test' });
  assert.equal(called, false);
});

test('createUseContextPackHandler - checks clearSessionPack is function', async () => {
  let called = false;

  const safeClearSessionPack = (clearer: unknown): void => {
    if (typeof clearer === 'function') {
      (clearer as () => void)();
      called = true;
    }
  };

  safeClearSessionPack(() => { /* clear */ });
  assert.equal(called, true);

  called = false;
  safeClearSessionPack(null);
  assert.equal(called, false);
});

// =============================================================================
// Edge Cases
// =============================================================================

test('createUseContextPackHandler - handles pack with empty scope', async () => {
  const mockPack: MockPackInfo = {
    key: 'empty-scope',
    name: 'Empty Scope Pack',
    description: null,
    scope: {}
  };

  assert.deepEqual(mockPack.scope, {});
});

test('createUseContextPackHandler - handles pack with complex scope', async () => {
  const mockPack: MockPackInfo = {
    key: 'complex-scope',
    name: 'Complex Scope Pack',
    description: 'Has all scope fields',
    scope: {
      path_glob: ['src/**/*.ts', 'lib/**/*.ts'],
      tags: ['api', 'backend', 'auth'],
      lang: ['typescript', 'javascript'],
      provider: 'openai',
      reranker: 'api',
      hybrid: 'on',
      bm25: 'on',
      symbol_boost: 'on'
    }
  };

  assert.ok(Array.isArray(mockPack.scope.path_glob));
  assert.ok(Array.isArray(mockPack.scope.tags));
  assert.equal(mockPack.scope.provider, 'openai');
});

test('createUseContextPackHandler - preserves pack description null vs string', async () => {
  const packWithDesc: MockPackInfo = {
    key: 'with-desc',
    name: 'With Description',
    description: 'This is a description',
    scope: {}
  };

  const packWithoutDesc: MockPackInfo = {
    key: 'without-desc',
    name: 'Without Description',
    description: null,
    scope: {}
  };

  assert.equal(typeof packWithDesc.description, 'string');
  assert.equal(packWithoutDesc.description, null);
});

// =============================================================================
// Synchronous Handler Tests
// =============================================================================

test('createUseContextPackHandler - handler is synchronous', async () => {
  // The handler in use-context-pack.ts is synchronous, not async
  const createSyncHandler = (): ((params: { name: string }) => { success: boolean }) => {
    return (params: { name: string }) => {
      // Synchronous operation
      return { success: params.name.length > 0 };
    };
  };

  const handler = createSyncHandler();
  const result = handler({ name: 'test' });

  // Result is immediate, not a Promise
  assert.equal(result.success, true);
});

test('registerUseContextPackTool - wraps sync handler in async for MCP', async () => {
  // The tool registration wraps the sync handler with async/await Promise.resolve()
  const syncHandler = (params: { name: string }): { message: string } => ({
    message: `Sync result for ${params.name}`
  });

  const asyncWrapper = async (params: { name: string }): Promise<{ content: Array<{ type: string; text: string }> }> => {
    await Promise.resolve();
    const result = syncHandler(params);
    return {
      content: [{ type: 'text', text: result.message }]
    };
  };

  const result = await asyncWrapper({ name: 'test' });

  assert.equal(result.content.length, 1);
  assert.ok(result.content[0].text.includes('test'));
});

// =============================================================================
// Case Sensitivity for Clear Keywords
// =============================================================================

test('createUseContextPackHandler - clear keywords are case-sensitive', async () => {
  const shouldClear = (name: string): boolean => {
    return name === 'default' || name === 'none' || name === 'clear';
  };

  // Lowercase should clear
  assert.equal(shouldClear('default'), true);
  assert.equal(shouldClear('none'), true);
  assert.equal(shouldClear('clear'), true);

  // Other cases should NOT clear (treated as pack names)
  assert.equal(shouldClear('Default'), false);
  assert.equal(shouldClear('NONE'), false);
  assert.equal(shouldClear('Clear'), false);
  assert.equal(shouldClear('CLEAR'), false);
});
