/**
 * Unit tests for CLI utility functions
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { parseIntOption, parseFloatOption, resolveProjectPath, ExitCode } from '../../cli/utils.js';

// ============================================================================
// parseIntOption tests
// ============================================================================

test('parseIntOption returns parsed integer for valid input', () => {
  const result = parseIntOption('42', 'testOption');
  assert.equal(result, 42);
});

test('parseIntOption returns default when value is undefined', () => {
  const result = parseIntOption(undefined, 'testOption', { default: 10 });
  assert.equal(result, 10);
});

test('parseIntOption returns default when value is empty string', () => {
  const result = parseIntOption('', 'testOption', { default: 5 });
  assert.equal(result, 5);
});

test('parseIntOption throws when value is undefined and no default', () => {
  assert.throws(
    () => parseIntOption(undefined, 'testOption'),
    /Missing required option: testOption/
  );
});

test('parseIntOption throws for non-numeric input', () => {
  assert.throws(
    () => parseIntOption('abc', 'testOption'),
    /Invalid testOption: expected a number, got "abc"/
  );
});

test('parseIntOption throws for value below minimum', () => {
  assert.throws(
    () => parseIntOption('5', 'testOption', { min: 10 }),
    /testOption must be at least 10, got 5/
  );
});

test('parseIntOption throws for value above maximum', () => {
  assert.throws(
    () => parseIntOption('100', 'testOption', { max: 50 }),
    /testOption must be at most 50, got 100/
  );
});

test('parseIntOption accepts value at minimum boundary', () => {
  const result = parseIntOption('10', 'testOption', { min: 10 });
  assert.equal(result, 10);
});

test('parseIntOption accepts value at maximum boundary', () => {
  const result = parseIntOption('50', 'testOption', { max: 50 });
  assert.equal(result, 50);
});

test('parseIntOption handles negative numbers', () => {
  const result = parseIntOption('-5', 'testOption', { min: -10, max: 0 });
  assert.equal(result, -5);
});

test('parseIntOption parses integer from float string (truncates)', () => {
  const result = parseIntOption('3.14', 'testOption');
  assert.equal(result, 3);
});

// ============================================================================
// parseFloatOption tests
// ============================================================================

test('parseFloatOption returns parsed float for valid input', () => {
  const result = parseFloatOption('3.14', 'testOption');
  assert.equal(result, 3.14);
});

test('parseFloatOption returns default when value is undefined', () => {
  const result = parseFloatOption(undefined, 'testOption', { default: 0.5 });
  assert.equal(result, 0.5);
});

test('parseFloatOption returns default when value is empty string', () => {
  const result = parseFloatOption('', 'testOption', { default: 0.7 });
  assert.equal(result, 0.7);
});

test('parseFloatOption throws when value is undefined and no default', () => {
  assert.throws(
    () => parseFloatOption(undefined, 'testOption'),
    /Missing required option: testOption/
  );
});

test('parseFloatOption throws for non-numeric input', () => {
  assert.throws(
    () => parseFloatOption('xyz', 'testOption'),
    /Invalid testOption: expected a number, got "xyz"/
  );
});

test('parseFloatOption throws for value below minimum', () => {
  assert.throws(
    () => parseFloatOption('0.1', 'testOption', { min: 0.5 }),
    /testOption must be at least 0.5, got 0.1/
  );
});

test('parseFloatOption throws for value above maximum', () => {
  assert.throws(
    () => parseFloatOption('2.5', 'testOption', { max: 2.0 }),
    /testOption must be at most 2, got 2.5/
  );
});

test('parseFloatOption handles scientific notation', () => {
  const result = parseFloatOption('1e-3', 'testOption');
  assert.equal(result, 0.001);
});

// ============================================================================
// resolveProjectPath tests
// ============================================================================

test('resolveProjectPath uses project option when provided', () => {
  const result = resolveProjectPath({ project: '/some/path' });
  assert.equal(result, '/some/path');
});

test('resolveProjectPath uses directory option when project not provided', () => {
  const result = resolveProjectPath({ directory: '/another/path' });
  assert.equal(result, '/another/path');
});

test('resolveProjectPath prefers project over directory', () => {
  const result = resolveProjectPath({ project: '/project', directory: '/directory' });
  assert.equal(result, '/project');
});

test('resolveProjectPath uses positional path when no options', () => {
  const result = resolveProjectPath({}, '/positional');
  assert.equal(result, '/positional');
});

test('resolveProjectPath defaults to current directory', () => {
  const result = resolveProjectPath({});
  assert.equal(result, path.resolve('.'));
});

test('resolveProjectPath resolves relative paths to absolute', () => {
  const result = resolveProjectPath({ project: 'relative/path' });
  assert.ok(path.isAbsolute(result));
  assert.ok(result.endsWith('relative/path'));
});

// ============================================================================
// ExitCode tests
// ============================================================================

test('ExitCode has correct values', () => {
  assert.equal(ExitCode.SUCCESS, 0);
  assert.equal(ExitCode.ERROR, 1);
  assert.equal(ExitCode.INVALID_ARGS, 2);
  assert.equal(ExitCode.INTERRUPTED, 130);
});
