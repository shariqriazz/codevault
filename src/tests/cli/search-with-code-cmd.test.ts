/**
 * Unit tests for search-with-code-cmd.ts
 * Tests the search-with-code command registration and option handling
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { registerSearchWithCodeCommand } from '../../cli/commands/search-with-code-cmd.js';

test('registerSearchWithCodeCommand adds search-with-code command to program', () => {
  const program = new Command();
  registerSearchWithCodeCommand(program);

  const cmd = program.commands.find(c => c.name() === 'search-with-code');
  assert.ok(cmd, 'search-with-code command should be registered');
});

test('search-with-code command requires query argument', () => {
  const program = new Command();
  registerSearchWithCodeCommand(program);

  const cmd = program.commands.find(c => c.name() === 'search-with-code');
  assert.ok(cmd, 'search-with-code command should exist');

  const args = cmd.registeredArguments || [];
  assert.ok(args.length >= 1, 'should have at least one argument');
  if (args.length > 0) {
    assert.ok(args[0].required, 'query should be required');
  }
});

test('search-with-code command has correct description', () => {
  const program = new Command();
  registerSearchWithCodeCommand(program);

  const cmd = program.commands.find(c => c.name() === 'search-with-code');
  assert.ok(cmd, 'search-with-code command should exist');
  const desc = cmd.description().toLowerCase();
  assert.ok(desc.includes('search') && desc.includes('code'),
    'description should mention search and code');
});

test('search-with-code command has limit option with default 5', () => {
  const program = new Command();
  registerSearchWithCodeCommand(program);

  const cmd = program.commands.find(c => c.name() === 'search-with-code');
  assert.ok(cmd, 'search-with-code command should exist');

  const limitOpt = cmd.options.find(opt => opt.long === '--limit');
  assert.ok(limitOpt, 'should have --limit option');
  assert.equal(limitOpt.defaultValue, '5', 'default should be 5');
});

test('search-with-code command has max-code-size option with default 100000', () => {
  const program = new Command();
  registerSearchWithCodeCommand(program);

  const cmd = program.commands.find(c => c.name() === 'search-with-code');
  assert.ok(cmd, 'search-with-code command should exist');

  const maxCodeSizeOpt = cmd.options.find(opt => opt.long === '--max-code-size');
  assert.ok(maxCodeSizeOpt, 'should have --max-code-size option');
  assert.equal(maxCodeSizeOpt.defaultValue, '100000', 'default should be 100000');
});

test('search-with-code command has hybrid option with default on', () => {
  const program = new Command();
  registerSearchWithCodeCommand(program);

  const cmd = program.commands.find(c => c.name() === 'search-with-code');
  assert.ok(cmd, 'search-with-code command should exist');

  const hybridOpt = cmd.options.find(opt => opt.long === '--hybrid');
  assert.ok(hybridOpt, 'should have --hybrid option');
  assert.equal(hybridOpt.defaultValue, 'on', 'default should be on');
});

test('search-with-code command has bm25 option with default on', () => {
  const program = new Command();
  registerSearchWithCodeCommand(program);

  const cmd = program.commands.find(c => c.name() === 'search-with-code');
  assert.ok(cmd, 'search-with-code command should exist');

  const bm25Opt = cmd.options.find(opt => opt.long === '--bm25');
  assert.ok(bm25Opt, 'should have --bm25 option');
  assert.equal(bm25Opt.defaultValue, 'on', 'default should be on');
});

test('search-with-code command has symbol_boost option with default on', () => {
  const program = new Command();
  registerSearchWithCodeCommand(program);

  const cmd = program.commands.find(c => c.name() === 'search-with-code');
  assert.ok(cmd, 'search-with-code command should exist');

  const symbolBoostOpt = cmd.options.find(opt => opt.long === '--symbol_boost');
  assert.ok(symbolBoostOpt, 'should have --symbol_boost option');
  assert.equal(symbolBoostOpt.defaultValue, 'on', 'default should be on');
});

test('search-with-code command has reranker option with default off', () => {
  const program = new Command();
  registerSearchWithCodeCommand(program);

  const cmd = program.commands.find(c => c.name() === 'search-with-code');
  assert.ok(cmd, 'search-with-code command should exist');

  const rerankerOpt = cmd.options.find(opt => opt.long === '--reranker');
  assert.ok(rerankerOpt, 'should have --reranker option');
  assert.equal(rerankerOpt.defaultValue, 'off', 'default should be off');
});

test('search-with-code command has path filtering options', () => {
  const program = new Command();
  registerSearchWithCodeCommand(program);

  const cmd = program.commands.find(c => c.name() === 'search-with-code');
  assert.ok(cmd, 'search-with-code command should exist');

  const pathGlobOpt = cmd.options.find(opt => opt.long === '--path_glob');
  const tagsOpt = cmd.options.find(opt => opt.long === '--tags');
  const langOpt = cmd.options.find(opt => opt.long === '--lang');

  assert.ok(pathGlobOpt, 'should have --path_glob option');
  assert.ok(tagsOpt, 'should have --tags option');
  assert.ok(langOpt, 'should have --lang option');
});

test('search-with-code command has project and directory path aliases', () => {
  const program = new Command();
  registerSearchWithCodeCommand(program);

  const cmd = program.commands.find(c => c.name() === 'search-with-code');
  assert.ok(cmd, 'search-with-code command should exist');

  const projectOpt = cmd.options.find(opt => opt.long === '--project');
  const directoryOpt = cmd.options.find(opt => opt.long === '--directory');

  assert.ok(projectOpt, 'should have --project option');
  assert.ok(directoryOpt, 'should have --directory option');
});

test('search-with-code command provider option has auto default', () => {
  const program = new Command();
  registerSearchWithCodeCommand(program);

  const cmd = program.commands.find(c => c.name() === 'search-with-code');
  assert.ok(cmd, 'search-with-code command should exist');

  const providerOpt = cmd.options.find(opt => opt.long === '--provider');
  assert.ok(providerOpt, 'should have --provider option');
  assert.equal(providerOpt.defaultValue, 'auto', 'default should be auto');
});

test('search-with-code command has short flag -k for limit', () => {
  const program = new Command();
  registerSearchWithCodeCommand(program);

  const cmd = program.commands.find(c => c.name() === 'search-with-code');
  assert.ok(cmd, 'search-with-code command should exist');

  const limitOpt = cmd.options.find(opt => opt.long === '--limit');
  assert.ok(limitOpt, 'should have --limit option');
  assert.equal(limitOpt.short, '-k', 'should have -k short flag');
});

test('search-with-code command accepts optional path argument', () => {
  const program = new Command();
  registerSearchWithCodeCommand(program);

  const cmd = program.commands.find(c => c.name() === 'search-with-code');
  assert.ok(cmd, 'search-with-code command should exist');

  const args = cmd.registeredArguments || [];
  // First arg is query (required), second is path (optional)
  assert.ok(args.length >= 1, 'should have at least query argument');
  if (args.length >= 2) {
    assert.ok(!args[1].required, 'path should be optional');
  }
});
