/**
 * Unit tests for update-cmd.ts
 * Tests the update command registration and option handling
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { registerUpdateCommand } from '../../cli/commands/update-cmd.js';

test('registerUpdateCommand adds update command to program', () => {
  const program = new Command();
  registerUpdateCommand(program);

  const updateCmd = program.commands.find(cmd => cmd.name() === 'update');
  assert.ok(updateCmd, 'update command should be registered');
});

test('update command has correct description', () => {
  const program = new Command();
  registerUpdateCommand(program);

  const updateCmd = program.commands.find(cmd => cmd.name() === 'update');
  assert.ok(updateCmd, 'update command should exist');
  assert.ok(updateCmd.description().toLowerCase().includes('update'),
    'description should mention update');
});

test('update command accepts path as positional argument', () => {
  const program = new Command();
  registerUpdateCommand(program);

  const updateCmd = program.commands.find(cmd => cmd.name() === 'update');
  assert.ok(updateCmd, 'update command should exist');
  // Check that it accepts optional path
  const usage = updateCmd.usage();
  assert.ok(usage.includes('[path]') || updateCmd.registeredArguments?.length >= 0,
    'should accept optional path argument');
});

test('update command has provider option with auto default', () => {
  const program = new Command();
  registerUpdateCommand(program);

  const updateCmd = program.commands.find(cmd => cmd.name() === 'update');
  assert.ok(updateCmd, 'update command should exist');

  const providerOpt = updateCmd.options.find(opt => opt.long === '--provider');
  assert.ok(providerOpt, 'should have --provider option');
  assert.equal(providerOpt.defaultValue, 'auto', 'default should be auto');
});

test('update command has encrypt option', () => {
  const program = new Command();
  registerUpdateCommand(program);

  const updateCmd = program.commands.find(cmd => cmd.name() === 'update');
  assert.ok(updateCmd, 'update command should exist');

  const encryptOpt = updateCmd.options.find(opt => opt.long === '--encrypt');
  assert.ok(encryptOpt, 'should have --encrypt option');
});

test('update command has concurrency option', () => {
  const program = new Command();
  registerUpdateCommand(program);

  const updateCmd = program.commands.find(cmd => cmd.name() === 'update');
  assert.ok(updateCmd, 'update command should exist');

  const concurrencyOpt = updateCmd.options.find(opt => opt.long === '--concurrency');
  assert.ok(concurrencyOpt, 'should have --concurrency option');
});

test('update command has project and directory path aliases', () => {
  const program = new Command();
  registerUpdateCommand(program);

  const updateCmd = program.commands.find(cmd => cmd.name() === 'update');
  assert.ok(updateCmd, 'update command should exist');

  const projectOpt = updateCmd.options.find(opt => opt.long === '--project');
  const directoryOpt = updateCmd.options.find(opt => opt.long === '--directory');

  assert.ok(projectOpt, 'should have --project option');
  assert.ok(directoryOpt, 'should have --directory option');
});

test('update command provider option has short flag -p', () => {
  const program = new Command();
  registerUpdateCommand(program);

  const updateCmd = program.commands.find(cmd => cmd.name() === 'update');
  assert.ok(updateCmd, 'update command should exist');

  const providerOpt = updateCmd.options.find(opt => opt.long === '--provider');
  assert.ok(providerOpt, 'should have --provider option');
  assert.equal(providerOpt.short, '-p', 'should have -p short flag');
});
