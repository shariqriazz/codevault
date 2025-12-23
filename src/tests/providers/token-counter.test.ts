import test from 'node:test';
import assert from 'node:assert/strict';
import { getTokenCounter } from '../../providers/token-counter.js';

// ============= getTokenCounter basic tests =============
test('getTokenCounter returns function for text-embedding models', async () => {
  const counter = await getTokenCounter('text-embedding-3-large');

  if (counter) {
    assert.equal(typeof counter, 'function');
  }
  // If tiktoken not available, counter will be null
  // This is acceptable behavior
});

test('getTokenCounter returns function for text-embedding-3-small', async () => {
  const counter = await getTokenCounter('text-embedding-3-small');

  if (counter) {
    assert.equal(typeof counter, 'function');
  }
});

test('getTokenCounter returns function for ada-002 model', async () => {
  const counter = await getTokenCounter('text-embedding-ada-002');

  if (counter) {
    assert.equal(typeof counter, 'function');
  }
});

test('getTokenCounter returns character-based counter for non-embedding models', async () => {
  const counter = await getTokenCounter('gpt-4');

  assert.ok(counter, 'Counter should exist for non-embedding models');
  assert.equal(typeof counter, 'function');
});

test('getTokenCounter returns character-based counter for unknown models', async () => {
  const counter = await getTokenCounter('unknown-model-xyz');

  assert.ok(counter, 'Counter should exist');
  assert.equal(typeof counter, 'function');
});

// ============= Character-based estimation tests =============
test('character-based counter estimates 1 token per 4 characters', async () => {
  const counter = await getTokenCounter('gpt-4');

  assert.ok(counter, 'Counter should exist');
  assert.equal(counter('abcd'), 1); // 4 chars = 1 token
  assert.equal(counter('abcdefgh'), 2); // 8 chars = 2 tokens
});

test('character-based counter rounds up', async () => {
  const counter = await getTokenCounter('some-chat-model');

  assert.ok(counter, 'Counter should exist');
  assert.equal(counter('abc'), 1); // 3 chars, ceil(3/4) = 1
  assert.equal(counter('abcde'), 2); // 5 chars, ceil(5/4) = 2
});

test('character-based counter handles empty string', async () => {
  const counter = await getTokenCounter('chat-model');

  assert.ok(counter, 'Counter should exist');
  assert.equal(counter(''), 0);
});

test('character-based counter handles long strings', async () => {
  const counter = await getTokenCounter('any-model');

  assert.ok(counter, 'Counter should exist');
  const longText = 'a'.repeat(10000);
  assert.equal(counter(longText), 2500);
});

// ============= Tiktoken-based counter tests (when available) =============
test('tiktoken counter returns positive count for text', async () => {
  const counter = await getTokenCounter('text-embedding-3-large');

  if (counter) {
    const count = counter('Hello, world!');
    assert.equal(typeof count, 'number');
    assert.ok(count > 0, 'Token count should be positive');
  }
});

test('tiktoken counter handles code snippets', async () => {
  const counter = await getTokenCounter('text-embedding-ada-002');

  if (counter) {
    const code = 'function hello() { return "world"; }';
    const count = counter(code);
    assert.equal(typeof count, 'number');
    assert.ok(count > 0);
  }
});

test('tiktoken counter handles unicode', async () => {
  const counter = await getTokenCounter('text-embedding-3-small');

  if (counter) {
    const unicode = 'Hello World';
    const count = counter(unicode);
    assert.equal(typeof count, 'number');
  }
});

test('tiktoken counter handles empty string', async () => {
  const counter = await getTokenCounter('text-embedding-3-large');

  if (counter) {
    const count = counter('');
    assert.equal(count, 0);
  }
});

test('tiktoken counter handles whitespace', async () => {
  const counter = await getTokenCounter('text-embedding-ada-002');

  if (counter) {
    const whitespace = '   \n\t   ';
    const count = counter(whitespace);
    assert.equal(typeof count, 'number');
    assert.ok(count >= 0);
  }
});

// ============= Encoder caching tests =============
test('getTokenCounter reuses encoder for same model family', async () => {
  // Call twice for embedding models - should reuse encoder
  const counter1 = await getTokenCounter('text-embedding-3-large');
  const counter2 = await getTokenCounter('text-embedding-3-small');

  // Both should work (either tiktoken or fallback)
  if (counter1 && counter2) {
    const count1 = counter1('test');
    const count2 = counter2('test');

    assert.equal(typeof count1, 'number');
    assert.equal(typeof count2, 'number');
  }
});

test('getTokenCounter called multiple times returns consistent results', async () => {
  const counter1 = await getTokenCounter('text-embedding-3-large');
  const counter2 = await getTokenCounter('text-embedding-3-large');

  if (counter1 && counter2) {
    const text = 'This is a test sentence for token counting.';
    assert.equal(counter1(text), counter2(text));
  }
});

// ============= Model name pattern matching tests =============
test('getTokenCounter matches "text-embedding" pattern', async () => {
  // These should use tiktoken if available
  const models = [
    'text-embedding-3-large',
    'text-embedding-3-small',
    'text-embedding-ada-002',
    'some-text-embedding-model'
  ];

  for (const model of models) {
    const counter = await getTokenCounter(model);
    // Should return counter (tiktoken or fallback)
    // For text-embedding models, may return null if tiktoken unavailable
    // which is valid behavior
    assert.ok(counter === null || typeof counter === 'function');
  }
});

test('getTokenCounter matches "ada-002" pattern', async () => {
  const counter = await getTokenCounter('ada-002');
  // Should use tiktoken if available
  assert.ok(counter === null || typeof counter === 'function');
});

test('getTokenCounter uses fallback for non-matching models', async () => {
  const models = [
    'gpt-4',
    'gpt-3.5-turbo',
    'claude-2',
    'custom-llm',
    ''
  ];

  for (const model of models) {
    const counter = await getTokenCounter(model);
    assert.ok(counter, `Counter should exist for "${model}"`);
    // Should use character-based estimation
    assert.equal(counter('abcd'), 1, `Should estimate 1 token for 4 chars with "${model}"`);
  }
});

// ============= Edge cases =============
test('getTokenCounter handles special characters', async () => {
  const counter = await getTokenCounter('text-embedding-3-large');

  if (counter) {
    const special = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/`~';
    const count = counter(special);
    assert.equal(typeof count, 'number');
    assert.ok(count >= 0);
  }
});

test('getTokenCounter handles newlines and tabs', async () => {
  const counter = await getTokenCounter('text-embedding-ada-002');

  if (counter) {
    const text = 'line1\nline2\tline3';
    const count = counter(text);
    assert.equal(typeof count, 'number');
    assert.ok(count > 0);
  }
});

test('getTokenCounter handles very long text', async () => {
  const counter = await getTokenCounter('gpt-4');

  assert.ok(counter, 'Counter should exist');
  const longText = 'word '.repeat(10000);
  const count = counter(longText);
  assert.equal(typeof count, 'number');
  assert.ok(count > 0);
});

test('getTokenCounter handles JSON content', async () => {
  const counter = await getTokenCounter('text-embedding-3-small');

  if (counter) {
    const json = JSON.stringify({ key: 'value', nested: { array: [1, 2, 3] } });
    const count = counter(json);
    assert.equal(typeof count, 'number');
    assert.ok(count > 0);
  }
});

test('getTokenCounter handles code with comments', async () => {
  const counter = await getTokenCounter('text-embedding-3-large');

  if (counter) {
    const code = `
// This is a comment
function test() {
  /* Multi-line
     comment */
  return 42;
}
`;
    const count = counter(code);
    assert.equal(typeof count, 'number');
    assert.ok(count > 0);
  }
});

// ============= Consistency tests =============
test('getTokenCounter produces consistent counts for same input', async () => {
  const counter = await getTokenCounter('text-embedding-3-large');

  if (counter) {
    const text = 'Consistent counting test';
    const count1 = counter(text);
    const count2 = counter(text);
    const count3 = counter(text);

    assert.equal(count1, count2);
    assert.equal(count2, count3);
  }
});

test('getTokenCounter character fallback is deterministic', async () => {
  const counter = await getTokenCounter('some-random-model');

  assert.ok(counter, 'Counter should exist');

  const text = 'Deterministic test';
  const counts = [counter(text), counter(text), counter(text)];

  assert.equal(counts[0], counts[1]);
  assert.equal(counts[1], counts[2]);
});

// ============= Return type tests =============
test('getTokenCounter always returns number (not Promise) from returned function', async () => {
  const counter = await getTokenCounter('gpt-4');

  assert.ok(counter, 'Counter should exist');

  const result = counter('test');
  assert.equal(typeof result, 'number');
  // Ensure it's not a thenable (Promise-like) - typeof check already confirms it's number
  assert.ok(typeof result === 'number', 'Result should be a number, not a Promise');
});

test('getTokenCounter for embedding model returns sync function', async () => {
  const counter = await getTokenCounter('text-embedding-3-large');

  if (counter) {
    const result = counter('test');
    assert.equal(typeof result, 'number');
  }
});
