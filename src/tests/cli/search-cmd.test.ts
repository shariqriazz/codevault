/**
 * Unit tests for search-cmd.ts
 * Tests the search command registration and option handling
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { registerSearchCommand } from '../../cli/commands/search-cmd.js';

test('registerSearchCommand adds search command to program', () => {
  const program = new Command();
  registerSearchCommand(program);

  const searchCmd = program.commands.find(cmd => cmd.name() === 'search');
  assert.ok(searchCmd, 'search command should be registered');
});

test('search command requires query argument', () => {
  const program = new Command();
  registerSearchCommand(program);

  const searchCmd = program.commands.find(cmd => cmd.name() === 'search');
  assert.ok(searchCmd, 'search command should exist');

  // Check for required query argument
  const args = searchCmd.registeredArguments || [];
  assert.ok(args.length >= 1, 'should have at least one argument');
  // First argument should be query (required)
  if (args.length > 0) {
    assert.ok(args[0].required, 'query should be required');
  }
});

test('search command has limit option with default 10', () => {
  const program = new Command();
  registerSearchCommand(program);

  const searchCmd = program.commands.find(cmd => cmd.name() === 'search');
  assert.ok(searchCmd, 'search command should exist');

  const limitOpt = searchCmd.options.find(opt => opt.long === '--limit');
  assert.ok(limitOpt, 'should have --limit option');
  assert.equal(limitOpt.defaultValue, '10', 'default should be 10');
});

test('search command has short flag -k for limit', () => {
  const program = new Command();
  registerSearchCommand(program);

  const searchCmd = program.commands.find(cmd => cmd.name() === 'search');
  assert.ok(searchCmd, 'search command should exist');

  const limitOpt = searchCmd.options.find(opt => opt.long === '--limit');
  assert.ok(limitOpt, 'should have --limit option');
  assert.equal(limitOpt.short, '-k', 'should have -k short flag');
});

test('search command has hybrid option with default on', () => {
  const program = new Command();
  registerSearchCommand(program);

  const searchCmd = program.commands.find(cmd => cmd.name() === 'search');
  assert.ok(searchCmd, 'search command should exist');

  const hybridOpt = searchCmd.options.find(opt => opt.long === '--hybrid');
  assert.ok(hybridOpt, 'should have --hybrid option');
  assert.equal(hybridOpt.defaultValue, 'on', 'default should be on');
});

test('search command has bm25 option with default on', () => {
  const program = new Command();
  registerSearchCommand(program);

  const searchCmd = program.commands.find(cmd => cmd.name() === 'search');
  assert.ok(searchCmd, 'search command should exist');

  const bm25Opt = searchCmd.options.find(opt => opt.long === '--bm25');
  assert.ok(bm25Opt, 'should have --bm25 option');
  assert.equal(bm25Opt.defaultValue, 'on', 'default should be on');
});

test('search command has symbol_boost option with default on', () => {
  const program = new Command();
  registerSearchCommand(program);

  const searchCmd = program.commands.find(cmd => cmd.name() === 'search');
  assert.ok(searchCmd, 'search command should exist');

  const symbolBoostOpt = searchCmd.options.find(opt => opt.long === '--symbol_boost');
  assert.ok(symbolBoostOpt, 'should have --symbol_boost option');
  assert.equal(symbolBoostOpt.defaultValue, 'on', 'default should be on');
});

test('search command has reranker option with default off', () => {
  const program = new Command();
  registerSearchCommand(program);

  const searchCmd = program.commands.find(cmd => cmd.name() === 'search');
  assert.ok(searchCmd, 'search command should exist');

  const rerankerOpt = searchCmd.options.find(opt => opt.long === '--reranker');
  assert.ok(rerankerOpt, 'should have --reranker option');
  assert.equal(rerankerOpt.defaultValue, 'off', 'default should be off');
});

test('search command has path filtering options', () => {
  const program = new Command();
  registerSearchCommand(program);

  const searchCmd = program.commands.find(cmd => cmd.name() === 'search');
  assert.ok(searchCmd, 'search command should exist');

  const pathGlobOpt = searchCmd.options.find(opt => opt.long === '--path_glob');
  const tagsOpt = searchCmd.options.find(opt => opt.long === '--tags');
  const langOpt = searchCmd.options.find(opt => opt.long === '--lang');

  assert.ok(pathGlobOpt, 'should have --path_glob option');
  assert.ok(tagsOpt, 'should have --tags option');
  assert.ok(langOpt, 'should have --lang option');
});

test('search command has project and directory path aliases', () => {
  const program = new Command();
  registerSearchCommand(program);

  const searchCmd = program.commands.find(cmd => cmd.name() === 'search');
  assert.ok(searchCmd, 'search command should exist');

  const projectOpt = searchCmd.options.find(opt => opt.long === '--project');
  const directoryOpt = searchCmd.options.find(opt => opt.long === '--directory');

  assert.ok(projectOpt, 'should have --project option');
  assert.ok(directoryOpt, 'should have --directory option');
});

test('search command provider option has auto default', () => {
  const program = new Command();
  registerSearchCommand(program);

  const searchCmd = program.commands.find(cmd => cmd.name() === 'search');
  assert.ok(searchCmd, 'search command should exist');

  const providerOpt = searchCmd.options.find(opt => opt.long === '--provider');
  assert.ok(providerOpt, 'should have --provider option');
  assert.equal(providerOpt.defaultValue, 'auto', 'default should be auto');
});

test('search command has correct description', () => {
  const program = new Command();
  registerSearchCommand(program);

  const searchCmd = program.commands.find(cmd => cmd.name() === 'search');
  assert.ok(searchCmd, 'search command should exist');
  assert.ok(searchCmd.description().toLowerCase().includes('search'),
    'description should mention search');
});
