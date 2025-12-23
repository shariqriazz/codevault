/**
 * Unit tests for index-cmd.ts
 * Tests the index command registration, option parsing, and behavior
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { registerIndexCommand } from '../../cli/commands/index-cmd.js';

test('registerIndexCommand adds index command to program', () => {
  const program = new Command();
  registerIndexCommand(program);

  const indexCmd = program.commands.find(cmd => cmd.name() === 'index');
  assert.ok(indexCmd, 'index command should be registered');
});

test('index command accepts path as positional argument', () => {
  const program = new Command();
  registerIndexCommand(program);

  const indexCmd = program.commands.find(cmd => cmd.name() === 'index');
  assert.ok(indexCmd, 'index command should exist');

  // The command should accept [path] as optional argument
  const args = indexCmd.registeredArguments || [];
  assert.ok(args.length >= 1 || indexCmd.usage().includes('[path]'),
    'should accept path argument');
});

test('index command has description', () => {
  const program = new Command();
  registerIndexCommand(program);

  const indexCmd = program.commands.find(cmd => cmd.name() === 'index');
  assert.ok(indexCmd, 'index command should exist');
  assert.ok(indexCmd.description().includes('Index'), 'should have descriptive text');
});

test('index command provider option has default value auto', () => {
  const program = new Command();
  registerIndexCommand(program);

  const indexCmd = program.commands.find(cmd => cmd.name() === 'index');
  assert.ok(indexCmd, 'index command should exist');

  const providerOpt = indexCmd.options.find(opt => opt.long === '--provider');
  assert.ok(providerOpt, 'should have --provider option');
  assert.equal(providerOpt.defaultValue, 'auto', 'default should be auto');
});

test('index command has short flag -p for provider', () => {
  const program = new Command();
  registerIndexCommand(program);

  const indexCmd = program.commands.find(cmd => cmd.name() === 'index');
  assert.ok(indexCmd, 'index command should exist');

  const providerOpt = indexCmd.options.find(opt => opt.long === '--provider');
  assert.ok(providerOpt, 'should have --provider option');
  assert.equal(providerOpt.short, '-p', 'should have -p short flag');
});

test('index command encrypt option accepts on/off', () => {
  const program = new Command();
  registerIndexCommand(program);

  const indexCmd = program.commands.find(cmd => cmd.name() === 'index');
  assert.ok(indexCmd, 'index command should exist');

  const encryptOpt = indexCmd.options.find(opt => opt.long === '--encrypt');
  assert.ok(encryptOpt, 'should have --encrypt option');
  // The option description should mention on|off
  assert.ok(encryptOpt.description.includes('on') || encryptOpt.description.includes('off'),
    'should accept on/off values');
});

test('index command concurrency option has constraints in description', () => {
  const program = new Command();
  registerIndexCommand(program);

  const indexCmd = program.commands.find(cmd => cmd.name() === 'index');
  assert.ok(indexCmd, 'index command should exist');

  const concurrencyOpt = indexCmd.options.find(opt => opt.long === '--concurrency');
  assert.ok(concurrencyOpt, 'should have --concurrency option');
  // Should mention the limits in description
  assert.ok(concurrencyOpt.description.includes('200') || concurrencyOpt.description.includes('1000'),
    'should describe concurrency limits');
});

test('index command verbose option is a boolean flag', () => {
  const program = new Command();
  registerIndexCommand(program);

  const indexCmd = program.commands.find(cmd => cmd.name() === 'index');
  assert.ok(indexCmd, 'index command should exist');

  const verboseOpt = indexCmd.options.find(opt => opt.long === '--verbose');
  assert.ok(verboseOpt, 'should have --verbose option');
  // Boolean flags don't have argument description
  assert.ok(!verboseOpt.argChoices, 'should be a boolean flag without choices');
});

test('index command accepts multiple path aliases', () => {
  const program = new Command();
  registerIndexCommand(program);

  const indexCmd = program.commands.find(cmd => cmd.name() === 'index');
  assert.ok(indexCmd, 'index command should exist');

  const projectOpt = indexCmd.options.find(opt => opt.long === '--project');
  const directoryOpt = indexCmd.options.find(opt => opt.long === '--directory');

  assert.ok(projectOpt, 'should have --project option');
  assert.ok(directoryOpt, 'should have --directory option');
});
