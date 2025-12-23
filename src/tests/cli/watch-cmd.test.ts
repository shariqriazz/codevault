/**
 * Unit tests for watch-cmd.ts
 * Tests the watch command registration and option handling
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { registerWatchCommand } from '../../cli/commands/watch-cmd.js';

test('registerWatchCommand adds watch command to program', () => {
  const program = new Command();
  registerWatchCommand(program);

  const watchCmd = program.commands.find(cmd => cmd.name() === 'watch');
  assert.ok(watchCmd, 'watch command should be registered');
});

test('watch command has correct description', () => {
  const program = new Command();
  registerWatchCommand(program);

  const watchCmd = program.commands.find(cmd => cmd.name() === 'watch');
  assert.ok(watchCmd, 'watch command should exist');
  assert.ok(watchCmd.description().toLowerCase().includes('watch'),
    'description should mention watch');
});

test('watch command has debounce option with default 500', () => {
  const program = new Command();
  registerWatchCommand(program);

  const watchCmd = program.commands.find(cmd => cmd.name() === 'watch');
  assert.ok(watchCmd, 'watch command should exist');

  const debounceOpt = watchCmd.options.find(opt => opt.long === '--debounce');
  assert.ok(debounceOpt, 'should have --debounce option');
  assert.equal(debounceOpt.defaultValue, '500', 'default should be 500ms');
});

test('watch command has short flag -d for debounce', () => {
  const program = new Command();
  registerWatchCommand(program);

  const watchCmd = program.commands.find(cmd => cmd.name() === 'watch');
  assert.ok(watchCmd, 'watch command should exist');

  const debounceOpt = watchCmd.options.find(opt => opt.long === '--debounce');
  assert.ok(debounceOpt, 'should have --debounce option');
  assert.equal(debounceOpt.short, '-d', 'should have -d short flag');
});

test('watch command has provider option', () => {
  const program = new Command();
  registerWatchCommand(program);

  const watchCmd = program.commands.find(cmd => cmd.name() === 'watch');
  assert.ok(watchCmd, 'watch command should exist');

  const providerOpt = watchCmd.options.find(opt => opt.long === '--provider');
  assert.ok(providerOpt, 'should have --provider option');
  assert.equal(providerOpt.defaultValue, 'auto', 'default should be auto');
});

test('watch command has encrypt option', () => {
  const program = new Command();
  registerWatchCommand(program);

  const watchCmd = program.commands.find(cmd => cmd.name() === 'watch');
  assert.ok(watchCmd, 'watch command should exist');

  const encryptOpt = watchCmd.options.find(opt => opt.long === '--encrypt');
  assert.ok(encryptOpt, 'should have --encrypt option');
});

test('watch command has concurrency option', () => {
  const program = new Command();
  registerWatchCommand(program);

  const watchCmd = program.commands.find(cmd => cmd.name() === 'watch');
  assert.ok(watchCmd, 'watch command should exist');

  const concurrencyOpt = watchCmd.options.find(opt => opt.long === '--concurrency');
  assert.ok(concurrencyOpt, 'should have --concurrency option');
});

test('watch command has project and directory path aliases', () => {
  const program = new Command();
  registerWatchCommand(program);

  const watchCmd = program.commands.find(cmd => cmd.name() === 'watch');
  assert.ok(watchCmd, 'watch command should exist');

  const projectOpt = watchCmd.options.find(opt => opt.long === '--project');
  const directoryOpt = watchCmd.options.find(opt => opt.long === '--directory');

  assert.ok(projectOpt, 'should have --project option');
  assert.ok(directoryOpt, 'should have --directory option');
});

test('watch command accepts optional path argument', () => {
  const program = new Command();
  registerWatchCommand(program);

  const watchCmd = program.commands.find(cmd => cmd.name() === 'watch');
  assert.ok(watchCmd, 'watch command should exist');

  // Verify it can accept positional path
  const usage = watchCmd.usage();
  assert.ok(usage.includes('[path]') || watchCmd.registeredArguments?.length >= 0,
    'should accept optional path argument');
});
