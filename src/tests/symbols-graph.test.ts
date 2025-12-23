import test from 'node:test';
import assert from 'node:assert/strict';
import { attachSymbolGraphToCodemap } from '../symbols/graph.js';
import type { Codemap, CodemapChunk } from '../types/codemap.js';

/**
 * Helper to create a minimal valid CodemapChunk for testing
 */
function createChunk(options: {
  file: string;
  symbol: string | null;
  sha: string;
  symbol_calls?: string[];
}): CodemapChunk {
  return {
    file: options.file,
    symbol: options.symbol,
    sha: options.sha,
    lang: 'typescript',
    symbol_calls: options.symbol_calls ?? []
  };
}

// ============================================================================
// Tests for attachSymbolGraphToCodemap - Basic functionality
// ============================================================================

test('attachSymbolGraphToCodemap returns empty codemap unchanged', () => {
  const codemap: Codemap = {};
  const result = attachSymbolGraphToCodemap(codemap);
  assert.deepEqual(result, {});
});

test('attachSymbolGraphToCodemap handles null input gracefully', () => {
  const result = attachSymbolGraphToCodemap(null as unknown as Codemap);
  assert.equal(result, null);
});

test('attachSymbolGraphToCodemap handles undefined input gracefully', () => {
  const result = attachSymbolGraphToCodemap(undefined as unknown as Codemap);
  assert.equal(result, undefined);
});

test('attachSymbolGraphToCodemap handles non-object input gracefully', () => {
  const result = attachSymbolGraphToCodemap('not an object' as unknown as Codemap);
  assert.equal(result, 'not an object');
});

test('attachSymbolGraphToCodemap adds symbol_call_targets for direct calls', () => {
  const codemap: Codemap = {
    chunk1: createChunk({
      file: 'src/a.ts',
      symbol: 'caller',
      sha: 'sha-caller',
      symbol_calls: ['callee']
    }),
    chunk2: createChunk({
      file: 'src/b.ts',
      symbol: 'callee',
      sha: 'sha-callee',
      symbol_calls: []
    })
  };

  const result = attachSymbolGraphToCodemap(codemap);

  assert.ok(Array.isArray(result.chunk1.symbol_call_targets));
  assert.ok(result.chunk1.symbol_call_targets!.includes('sha-callee'));
});

test('attachSymbolGraphToCodemap adds symbol_callers for reverse references', () => {
  const codemap: Codemap = {
    chunk1: createChunk({
      file: 'src/a.ts',
      symbol: 'caller',
      sha: 'sha-caller',
      symbol_calls: ['callee']
    }),
    chunk2: createChunk({
      file: 'src/b.ts',
      symbol: 'callee',
      sha: 'sha-callee',
      symbol_calls: []
    })
  };

  const result = attachSymbolGraphToCodemap(codemap);

  assert.ok(Array.isArray(result.chunk2.symbol_callers));
  assert.ok(result.chunk2.symbol_callers!.includes('sha-caller'));
});

test('attachSymbolGraphToCodemap adds symbol_neighbors combining both directions', () => {
  const codemap: Codemap = {
    chunk1: createChunk({
      file: 'src/a.ts',
      symbol: 'caller',
      sha: 'sha-caller',
      symbol_calls: ['callee']
    }),
    chunk2: createChunk({
      file: 'src/b.ts',
      symbol: 'callee',
      sha: 'sha-callee',
      symbol_calls: []
    })
  };

  const result = attachSymbolGraphToCodemap(codemap);

  // caller's neighbors should include callee (outgoing)
  assert.ok(result.chunk1.symbol_neighbors!.includes('sha-callee'));
  // callee's neighbors should include caller (incoming)
  assert.ok(result.chunk2.symbol_neighbors!.includes('sha-caller'));
});

// ============================================================================
// Tests for symbol resolution
// ============================================================================

test('attachSymbolGraphToCodemap resolves symbols case-insensitively', () => {
  // Use unique symbols that don't collide
  const codemap: Codemap = {
    chunk1: createChunk({
      file: 'src/a.ts',
      symbol: 'callerFunc',
      sha: 'sha-1',
      symbol_calls: ['TARGETFUNC'] // uppercase call to lowercase symbol
    }),
    chunk2: createChunk({
      file: 'src/b.ts',
      symbol: 'targetFunc', // lowercase symbol
      sha: 'sha-2',
      symbol_calls: []
    })
  };

  const result = attachSymbolGraphToCodemap(codemap);

  // 'TARGETFUNC'.toLowerCase() === 'targetfunc' === 'targetFunc'.toLowerCase()
  assert.ok(result.chunk1.symbol_call_targets!.includes('sha-2'));
});

test('attachSymbolGraphToCodemap handles multiple chunks with same symbol name', () => {
  const codemap: Codemap = {
    chunk1: createChunk({
      file: 'src/a.ts',
      symbol: 'caller',
      sha: 'sha-caller',
      symbol_calls: ['helper']
    }),
    chunk2: createChunk({
      file: 'src/a.ts', // same file
      symbol: 'helper',
      sha: 'sha-helper-1',
      symbol_calls: []
    }),
    chunk3: createChunk({
      file: 'src/b.ts', // different file
      symbol: 'helper',
      sha: 'sha-helper-2',
      symbol_calls: []
    })
  };

  const result = attachSymbolGraphToCodemap(codemap);

  // Should prefer the helper in the same file
  assert.ok(result.chunk1.symbol_call_targets!.includes('sha-helper-1'));
  assert.ok(!result.chunk1.symbol_call_targets!.includes('sha-helper-2'));
});

test('attachSymbolGraphToCodemap falls back to first candidate when no same-file match', () => {
  const codemap: Codemap = {
    chunk1: createChunk({
      file: 'src/a.ts',
      symbol: 'caller',
      sha: 'sha-caller',
      symbol_calls: ['helper']
    }),
    chunk2: createChunk({
      file: 'src/b.ts', // different file
      symbol: 'helper',
      sha: 'sha-helper',
      symbol_calls: []
    })
  };

  const result = attachSymbolGraphToCodemap(codemap);

  assert.ok(result.chunk1.symbol_call_targets!.includes('sha-helper'));
});

test('attachSymbolGraphToCodemap ignores calls to non-existent symbols', () => {
  const codemap: Codemap = {
    chunk1: createChunk({
      file: 'src/a.ts',
      symbol: 'caller',
      sha: 'sha-caller',
      symbol_calls: ['nonExistentFunction']
    })
  };

  const result = attachSymbolGraphToCodemap(codemap);

  assert.deepEqual(result.chunk1.symbol_call_targets, []);
});

test('attachSymbolGraphToCodemap ignores self-references', () => {
  const codemap: Codemap = {
    chunk1: createChunk({
      file: 'src/a.ts',
      symbol: 'recursive',
      sha: 'sha-recursive',
      symbol_calls: ['recursive'] // calls itself
    })
  };

  const result = attachSymbolGraphToCodemap(codemap);

  // Should not include self in call targets
  assert.ok(!result.chunk1.symbol_call_targets!.includes('sha-recursive'));
});

// ============================================================================
// Tests for edge cases and malformed data
// ============================================================================

test('attachSymbolGraphToCodemap handles entries with null symbol', () => {
  const codemap: Codemap = {
    chunk1: createChunk({
      file: 'src/a.ts',
      symbol: null,
      sha: 'sha-1',
      symbol_calls: []
    }),
    chunk2: createChunk({
      file: 'src/b.ts',
      symbol: 'helper',
      sha: 'sha-2',
      symbol_calls: []
    })
  };

  // Should not throw
  const result = attachSymbolGraphToCodemap(codemap);
  assert.ok(result.chunk1 !== undefined);
});

test('attachSymbolGraphToCodemap handles entries with empty string symbol', () => {
  const codemap: Codemap = {
    chunk1: createChunk({
      file: 'src/a.ts',
      symbol: '',
      sha: 'sha-1',
      symbol_calls: []
    })
  };

  // Should not throw
  const result = attachSymbolGraphToCodemap(codemap);
  assert.deepEqual(result.chunk1.symbol_call_targets, []);
});

test('attachSymbolGraphToCodemap handles entries with whitespace-only symbol', () => {
  const codemap: Codemap = {
    chunk1: createChunk({
      file: 'src/a.ts',
      symbol: '   ',
      sha: 'sha-1',
      symbol_calls: []
    })
  };

  const result = attachSymbolGraphToCodemap(codemap);
  assert.deepEqual(result.chunk1.symbol_call_targets, []);
});

test('attachSymbolGraphToCodemap handles entries without sha', () => {
  const codemap: Codemap = {
    chunk1: {
      file: 'src/a.ts',
      symbol: 'test',
      sha: undefined as unknown as string // missing sha
    }
  };

  // Should not throw
  const result = attachSymbolGraphToCodemap(codemap);
  assert.ok(result !== null);
});

test('attachSymbolGraphToCodemap handles null entries in codemap', () => {
  const codemap: Codemap = {
    chunk1: null as unknown as CodemapChunk,
    chunk2: createChunk({
      file: 'src/b.ts',
      symbol: 'valid',
      sha: 'sha-2',
      symbol_calls: []
    })
  };

  // Should not throw
  const result = attachSymbolGraphToCodemap(codemap);
  assert.ok(result.chunk2.symbol_call_targets !== undefined);
});

test('attachSymbolGraphToCodemap handles non-object entries', () => {
  const codemap: Codemap = {
    chunk1: 'not an object' as unknown as CodemapChunk,
    chunk2: createChunk({
      file: 'src/b.ts',
      symbol: 'valid',
      sha: 'sha-2',
      symbol_calls: []
    })
  };

  // Should not throw
  const result = attachSymbolGraphToCodemap(codemap);
  assert.ok(result !== null);
});

test('attachSymbolGraphToCodemap handles non-array symbol_calls', () => {
  const codemap: Codemap = {
    chunk1: {
      file: 'src/a.ts',
      symbol: 'caller',
      sha: 'sha-1',
      symbol_calls: 'not an array' as unknown as string[]
    }
  };

  // Should not throw
  const result = attachSymbolGraphToCodemap(codemap);
  assert.deepEqual(result.chunk1.symbol_call_targets, []);
});

test('attachSymbolGraphToCodemap handles null values in symbol_calls array', () => {
  const codemap: Codemap = {
    chunk1: createChunk({
      file: 'src/a.ts',
      symbol: 'caller',
      sha: 'sha-caller',
      symbol_calls: ['helper', null as unknown as string, undefined as unknown as string]
    }),
    chunk2: createChunk({
      file: 'src/b.ts',
      symbol: 'helper',
      sha: 'sha-helper',
      symbol_calls: []
    })
  };

  // Should not throw and should still resolve 'helper'
  const result = attachSymbolGraphToCodemap(codemap);
  assert.ok(result.chunk1.symbol_call_targets!.includes('sha-helper'));
});

test('attachSymbolGraphToCodemap handles empty string in symbol_calls array', () => {
  const codemap: Codemap = {
    chunk1: createChunk({
      file: 'src/a.ts',
      symbol: 'caller',
      sha: 'sha-caller',
      symbol_calls: ['', '   ', 'helper']
    }),
    chunk2: createChunk({
      file: 'src/b.ts',
      symbol: 'helper',
      sha: 'sha-helper',
      symbol_calls: []
    })
  };

  const result = attachSymbolGraphToCodemap(codemap);
  assert.ok(result.chunk1.symbol_call_targets!.includes('sha-helper'));
  // Empty strings should not produce invalid entries
  assert.equal(result.chunk1.symbol_call_targets!.length, 1);
});

// ============================================================================
// Tests for MAX_NEIGHBORS limit
// ============================================================================

test('attachSymbolGraphToCodemap limits symbol_call_targets to MAX_NEIGHBORS', () => {
  // Create a caller that calls many different functions
  const callees: Record<string, CodemapChunk> = {};
  const calls: string[] = [];

  for (let i = 0; i < 20; i++) {
    const name = `helper${i}`;
    calls.push(name);
    callees[`chunk${i + 1}`] = createChunk({
      file: 'src/helpers.ts',
      symbol: name,
      sha: `sha-${i}`,
      symbol_calls: []
    });
  }

  const codemap: Codemap = {
    caller: createChunk({
      file: 'src/main.ts',
      symbol: 'main',
      sha: 'sha-main',
      symbol_calls: calls
    }),
    ...callees
  };

  const result = attachSymbolGraphToCodemap(codemap);

  // MAX_NEIGHBORS is 12 (from constants)
  assert.ok(result.caller.symbol_call_targets!.length <= 12);
});

test('attachSymbolGraphToCodemap limits symbol_callers to MAX_NEIGHBORS', () => {
  // Create a callee that is called by many different functions
  const callers: Record<string, CodemapChunk> = {};

  for (let i = 0; i < 20; i++) {
    callers[`caller${i}`] = createChunk({
      file: 'src/callers.ts',
      symbol: `caller${i}`,
      sha: `sha-caller-${i}`,
      symbol_calls: ['helper']
    });
  }

  const codemap: Codemap = {
    ...callers,
    helper: createChunk({
      file: 'src/utils.ts',
      symbol: 'helper',
      sha: 'sha-helper',
      symbol_calls: []
    })
  };

  const result = attachSymbolGraphToCodemap(codemap);

  // MAX_NEIGHBORS is 12 (from constants)
  assert.ok(result.helper.symbol_callers!.length <= 12);
});

test('attachSymbolGraphToCodemap limits symbol_neighbors to MAX_NEIGHBORS * 2', () => {
  // Create a node with many incoming and outgoing edges
  const otherChunks: Record<string, CodemapChunk> = {};
  const callsOut: string[] = [];

  // 15 outgoing
  for (let i = 0; i < 15; i++) {
    const name = `outgoing${i}`;
    callsOut.push(name);
    otherChunks[`out${i}`] = createChunk({
      file: 'src/out.ts',
      symbol: name,
      sha: `sha-out-${i}`,
      symbol_calls: []
    });
  }

  // 15 incoming
  for (let i = 0; i < 15; i++) {
    otherChunks[`in${i}`] = createChunk({
      file: 'src/in.ts',
      symbol: `incoming${i}`,
      sha: `sha-in-${i}`,
      symbol_calls: ['central']
    });
  }

  const codemap: Codemap = {
    ...otherChunks,
    central: createChunk({
      file: 'src/central.ts',
      symbol: 'central',
      sha: 'sha-central',
      symbol_calls: callsOut
    })
  };

  const result = attachSymbolGraphToCodemap(codemap);

  // MAX_NEIGHBORS * 2 = 24
  assert.ok(result.central.symbol_neighbors!.length <= 24);
});

// ============================================================================
// Tests for complex graph structures
// ============================================================================

test('attachSymbolGraphToCodemap handles circular dependencies', () => {
  const codemap: Codemap = {
    a: createChunk({
      file: 'src/a.ts',
      symbol: 'funcA',
      sha: 'sha-a',
      symbol_calls: ['funcB']
    }),
    b: createChunk({
      file: 'src/b.ts',
      symbol: 'funcB',
      sha: 'sha-b',
      symbol_calls: ['funcA']
    })
  };

  const result = attachSymbolGraphToCodemap(codemap);

  // Both should reference each other
  assert.ok(result.a.symbol_call_targets!.includes('sha-b'));
  assert.ok(result.b.symbol_call_targets!.includes('sha-a'));
  assert.ok(result.a.symbol_callers!.includes('sha-b'));
  assert.ok(result.b.symbol_callers!.includes('sha-a'));
});

test('attachSymbolGraphToCodemap handles transitive call chains', () => {
  const codemap: Codemap = {
    a: createChunk({
      file: 'src/a.ts',
      symbol: 'funcA',
      sha: 'sha-a',
      symbol_calls: ['funcB']
    }),
    b: createChunk({
      file: 'src/b.ts',
      symbol: 'funcB',
      sha: 'sha-b',
      symbol_calls: ['funcC']
    }),
    c: createChunk({
      file: 'src/c.ts',
      symbol: 'funcC',
      sha: 'sha-c',
      symbol_calls: []
    })
  };

  const result = attachSymbolGraphToCodemap(codemap);

  // A calls B
  assert.ok(result.a.symbol_call_targets!.includes('sha-b'));
  // B calls C
  assert.ok(result.b.symbol_call_targets!.includes('sha-c'));
  // A does NOT directly call C (no transitive closure)
  assert.ok(!result.a.symbol_call_targets!.includes('sha-c'));
});

test('attachSymbolGraphToCodemap handles multiple callers to same target', () => {
  const codemap: Codemap = {
    caller1: createChunk({
      file: 'src/a.ts',
      symbol: 'caller1',
      sha: 'sha-caller1',
      symbol_calls: ['shared']
    }),
    caller2: createChunk({
      file: 'src/b.ts',
      symbol: 'caller2',
      sha: 'sha-caller2',
      symbol_calls: ['shared']
    }),
    shared: createChunk({
      file: 'src/shared.ts',
      symbol: 'shared',
      sha: 'sha-shared',
      symbol_calls: []
    })
  };

  const result = attachSymbolGraphToCodemap(codemap);

  assert.ok(result.shared.symbol_callers!.includes('sha-caller1'));
  assert.ok(result.shared.symbol_callers!.includes('sha-caller2'));
  assert.equal(result.shared.symbol_callers!.length, 2);
});

test('attachSymbolGraphToCodemap handles one function calling multiple targets', () => {
  const codemap: Codemap = {
    orchestrator: createChunk({
      file: 'src/main.ts',
      symbol: 'orchestrator',
      sha: 'sha-orch',
      symbol_calls: ['step1', 'step2', 'step3']
    }),
    step1: createChunk({
      file: 'src/steps.ts',
      symbol: 'step1',
      sha: 'sha-step1',
      symbol_calls: []
    }),
    step2: createChunk({
      file: 'src/steps.ts',
      symbol: 'step2',
      sha: 'sha-step2',
      symbol_calls: []
    }),
    step3: createChunk({
      file: 'src/steps.ts',
      symbol: 'step3',
      sha: 'sha-step3',
      symbol_calls: []
    })
  };

  const result = attachSymbolGraphToCodemap(codemap);

  assert.ok(result.orchestrator.symbol_call_targets!.includes('sha-step1'));
  assert.ok(result.orchestrator.symbol_call_targets!.includes('sha-step2'));
  assert.ok(result.orchestrator.symbol_call_targets!.includes('sha-step3'));
  assert.equal(result.orchestrator.symbol_call_targets!.length, 3);
});

// ============================================================================
// Tests for cross-file symbol resolution
// ============================================================================

test('attachSymbolGraphToCodemap prefers same-file symbol when duplicates exist', () => {
  const codemap: Codemap = {
    main: createChunk({
      file: 'src/main.ts',
      symbol: 'main',
      sha: 'sha-main',
      symbol_calls: ['helper']
    }),
    helperLocal: createChunk({
      file: 'src/main.ts', // same file as caller
      symbol: 'helper',
      sha: 'sha-helper-local',
      symbol_calls: []
    }),
    helperRemote: createChunk({
      file: 'src/utils.ts', // different file
      symbol: 'helper',
      sha: 'sha-helper-remote',
      symbol_calls: []
    })
  };

  const result = attachSymbolGraphToCodemap(codemap);

  // Should prefer the local helper
  assert.ok(result.main.symbol_call_targets!.includes('sha-helper-local'));
  assert.ok(!result.main.symbol_call_targets!.includes('sha-helper-remote'));
});

test('attachSymbolGraphToCodemap resolves cross-file references correctly', () => {
  const codemap: Codemap = {
    serviceA: createChunk({
      file: 'src/services/a.ts',
      symbol: 'ServiceA',
      sha: 'sha-a',
      symbol_calls: ['ServiceB', 'utils']
    }),
    serviceB: createChunk({
      file: 'src/services/b.ts',
      symbol: 'ServiceB',
      sha: 'sha-b',
      symbol_calls: ['utils']
    }),
    utils: createChunk({
      file: 'src/utils/helpers.ts',
      symbol: 'utils',
      sha: 'sha-utils',
      symbol_calls: []
    })
  };

  const result = attachSymbolGraphToCodemap(codemap);

  // ServiceA should call both ServiceB and utils
  assert.ok(result.serviceA.symbol_call_targets!.includes('sha-b'));
  assert.ok(result.serviceA.symbol_call_targets!.includes('sha-utils'));

  // utils should be called by both ServiceA and ServiceB
  assert.ok(result.utils.symbol_callers!.includes('sha-a'));
  assert.ok(result.utils.symbol_callers!.includes('sha-b'));
});

// ============================================================================
// Tests for data integrity
// ============================================================================

test('attachSymbolGraphToCodemap preserves original chunk properties', () => {
  const codemap: Codemap = {
    chunk1: {
      file: 'src/test.ts',
      symbol: 'testFunc',
      sha: 'sha-test',
      lang: 'typescript',
      chunkType: 'function',
      provider: 'openai',
      dimensions: 1536,
      hasCodevaultTags: true,
      hasIntent: false,
      hasDocumentation: true,
      variableCount: 5,
      synonyms: ['test', 'check'],
      path_weight: 1.5,
      success_rate: 0.95,
      symbol_calls: []
    }
  };

  const result = attachSymbolGraphToCodemap(codemap);

  assert.equal(result.chunk1.file, 'src/test.ts');
  assert.equal(result.chunk1.symbol, 'testFunc');
  assert.equal(result.chunk1.sha, 'sha-test');
  assert.equal(result.chunk1.lang, 'typescript');
  assert.equal(result.chunk1.chunkType, 'function');
  assert.equal(result.chunk1.provider, 'openai');
  assert.equal(result.chunk1.dimensions, 1536);
  assert.equal(result.chunk1.hasCodevaultTags, true);
  assert.equal(result.chunk1.hasIntent, false);
  assert.equal(result.chunk1.hasDocumentation, true);
  assert.equal(result.chunk1.variableCount, 5);
  assert.deepEqual(result.chunk1.synonyms, ['test', 'check']);
  assert.equal(result.chunk1.path_weight, 1.5);
  assert.equal(result.chunk1.success_rate, 0.95);
});

test('attachSymbolGraphToCodemap returns the same object reference (mutates in place)', () => {
  const codemap: Codemap = {
    chunk1: createChunk({
      file: 'src/a.ts',
      symbol: 'test',
      sha: 'sha-1',
      symbol_calls: []
    })
  };

  const result = attachSymbolGraphToCodemap(codemap);

  assert.strictEqual(result, codemap);
});

test('attachSymbolGraphToCodemap initializes empty arrays for isolated nodes', () => {
  const codemap: Codemap = {
    isolated: createChunk({
      file: 'src/isolated.ts',
      symbol: 'isolated',
      sha: 'sha-isolated',
      symbol_calls: []
    })
  };

  const result = attachSymbolGraphToCodemap(codemap);

  assert.ok(Array.isArray(result.isolated.symbol_call_targets));
  assert.ok(Array.isArray(result.isolated.symbol_callers));
  assert.ok(Array.isArray(result.isolated.symbol_neighbors));
  assert.equal(result.isolated.symbol_call_targets!.length, 0);
  assert.equal(result.isolated.symbol_callers!.length, 0);
  assert.equal(result.isolated.symbol_neighbors!.length, 0);
});
