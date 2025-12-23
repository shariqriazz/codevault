/**
 * Unit tests for config-cmd.ts
 * Tests the config command registration and subcommand handling
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { registerConfigCommands } from '../../cli/commands/config-cmd.js';

test('registerConfigCommands adds config command to program', () => {
  const program = new Command();
  registerConfigCommands(program);

  const configCmd = program.commands.find(cmd => cmd.name() === 'config');
  assert.ok(configCmd, 'config command should be registered');
});

test('config command has correct description', () => {
  const program = new Command();
  registerConfigCommands(program);

  const configCmd = program.commands.find(cmd => cmd.name() === 'config');
  assert.ok(configCmd, 'config command should exist');
  const desc = configCmd.description().toLowerCase();
  assert.ok(desc.includes('config') || desc.includes('manage'),
    'description should mention config/manage');
});

// ============================================================================
// config init subcommand
// ============================================================================

test('config init subcommand is registered', () => {
  const program = new Command();
  registerConfigCommands(program);

  const configCmd = program.commands.find(cmd => cmd.name() === 'config');
  assert.ok(configCmd, 'config command should exist');

  const initCmd = configCmd.commands.find(cmd => cmd.name() === 'init');
  assert.ok(initCmd, 'init subcommand should be registered');
});

test('config init has force option', () => {
  const program = new Command();
  registerConfigCommands(program);

  const configCmd = program.commands.find(cmd => cmd.name() === 'config');
  const initCmd = configCmd?.commands.find(cmd => cmd.name() === 'init');
  assert.ok(initCmd, 'init subcommand should exist');

  const forceOpt = initCmd.options.find(opt => opt.long === '--force');
  assert.ok(forceOpt, 'should have --force option');
});

test('config init has no-interactive option', () => {
  const program = new Command();
  registerConfigCommands(program);

  const configCmd = program.commands.find(cmd => cmd.name() === 'config');
  const initCmd = configCmd?.commands.find(cmd => cmd.name() === 'init');
  assert.ok(initCmd, 'init subcommand should exist');

  const noInteractiveOpt = initCmd.options.find(opt => opt.long === '--no-interactive');
  assert.ok(noInteractiveOpt, 'should have --no-interactive option');
});

// ============================================================================
// config set subcommand
// ============================================================================

test('config set subcommand is registered', () => {
  const program = new Command();
  registerConfigCommands(program);

  const configCmd = program.commands.find(cmd => cmd.name() === 'config');
  assert.ok(configCmd, 'config command should exist');

  const setCmd = configCmd.commands.find(cmd => cmd.name() === 'set');
  assert.ok(setCmd, 'set subcommand should be registered');
});

test('config set requires key and value arguments', () => {
  const program = new Command();
  registerConfigCommands(program);

  const configCmd = program.commands.find(cmd => cmd.name() === 'config');
  const setCmd = configCmd?.commands.find(cmd => cmd.name() === 'set');
  assert.ok(setCmd, 'set subcommand should exist');

  const args = setCmd.registeredArguments || [];
  assert.ok(args.length >= 2, 'should have at least two arguments (key and value)');
});

test('config set has local option', () => {
  const program = new Command();
  registerConfigCommands(program);

  const configCmd = program.commands.find(cmd => cmd.name() === 'config');
  const setCmd = configCmd?.commands.find(cmd => cmd.name() === 'set');
  assert.ok(setCmd, 'set subcommand should exist');

  const localOpt = setCmd.options.find(opt => opt.long === '--local');
  assert.ok(localOpt, 'should have --local option');
});

test('config set local option has short flag -l', () => {
  const program = new Command();
  registerConfigCommands(program);

  const configCmd = program.commands.find(cmd => cmd.name() === 'config');
  const setCmd = configCmd?.commands.find(cmd => cmd.name() === 'set');
  assert.ok(setCmd, 'set subcommand should exist');

  const localOpt = setCmd.options.find(opt => opt.long === '--local');
  assert.ok(localOpt, 'should have --local option');
  assert.equal(localOpt.short, '-l', 'should have -l short flag');
});

// ============================================================================
// config get subcommand
// ============================================================================

test('config get subcommand is registered', () => {
  const program = new Command();
  registerConfigCommands(program);

  const configCmd = program.commands.find(cmd => cmd.name() === 'config');
  assert.ok(configCmd, 'config command should exist');

  const getCmd = configCmd.commands.find(cmd => cmd.name() === 'get');
  assert.ok(getCmd, 'get subcommand should be registered');
});

test('config get requires key argument', () => {
  const program = new Command();
  registerConfigCommands(program);

  const configCmd = program.commands.find(cmd => cmd.name() === 'config');
  const getCmd = configCmd?.commands.find(cmd => cmd.name() === 'get');
  assert.ok(getCmd, 'get subcommand should exist');

  const args = getCmd.registeredArguments || [];
  assert.ok(args.length >= 1, 'should have at least one argument (key)');
});

test('config get has global option', () => {
  const program = new Command();
  registerConfigCommands(program);

  const configCmd = program.commands.find(cmd => cmd.name() === 'config');
  const getCmd = configCmd?.commands.find(cmd => cmd.name() === 'get');
  assert.ok(getCmd, 'get subcommand should exist');

  const globalOpt = getCmd.options.find(opt => opt.long === '--global');
  assert.ok(globalOpt, 'should have --global option');
});

test('config get has local option', () => {
  const program = new Command();
  registerConfigCommands(program);

  const configCmd = program.commands.find(cmd => cmd.name() === 'config');
  const getCmd = configCmd?.commands.find(cmd => cmd.name() === 'get');
  assert.ok(getCmd, 'get subcommand should exist');

  const localOpt = getCmd.options.find(opt => opt.long === '--local');
  assert.ok(localOpt, 'should have --local option');
});

// ============================================================================
// config list subcommand
// ============================================================================

test('config list subcommand is registered', () => {
  const program = new Command();
  registerConfigCommands(program);

  const configCmd = program.commands.find(cmd => cmd.name() === 'config');
  assert.ok(configCmd, 'config command should exist');

  const listCmd = configCmd.commands.find(cmd => cmd.name() === 'list');
  assert.ok(listCmd, 'list subcommand should be registered');
});

test('config list has show alias', () => {
  const program = new Command();
  registerConfigCommands(program);

  const configCmd = program.commands.find(cmd => cmd.name() === 'config');
  const listCmd = configCmd?.commands.find(cmd => cmd.name() === 'list');
  assert.ok(listCmd, 'list subcommand should exist');

  // Check for aliases
  const aliases = listCmd.aliases();
  assert.ok(aliases.includes('show'), 'list should have show alias');
});

test('config list has global option', () => {
  const program = new Command();
  registerConfigCommands(program);

  const configCmd = program.commands.find(cmd => cmd.name() === 'config');
  const listCmd = configCmd?.commands.find(cmd => cmd.name() === 'list');
  assert.ok(listCmd, 'list subcommand should exist');

  const globalOpt = listCmd.options.find(opt => opt.long === '--global');
  assert.ok(globalOpt, 'should have --global option');
});

test('config list has local option', () => {
  const program = new Command();
  registerConfigCommands(program);

  const configCmd = program.commands.find(cmd => cmd.name() === 'config');
  const listCmd = configCmd?.commands.find(cmd => cmd.name() === 'list');
  assert.ok(listCmd, 'list subcommand should exist');

  const localOpt = listCmd.options.find(opt => opt.long === '--local');
  assert.ok(localOpt, 'should have --local option');
});

test('config list has sources option', () => {
  const program = new Command();
  registerConfigCommands(program);

  const configCmd = program.commands.find(cmd => cmd.name() === 'config');
  const listCmd = configCmd?.commands.find(cmd => cmd.name() === 'list');
  assert.ok(listCmd, 'list subcommand should exist');

  const sourcesOpt = listCmd.options.find(opt => opt.long === '--sources');
  assert.ok(sourcesOpt, 'should have --sources option');
});

// ============================================================================
// config unset subcommand
// ============================================================================

test('config unset subcommand is registered', () => {
  const program = new Command();
  registerConfigCommands(program);

  const configCmd = program.commands.find(cmd => cmd.name() === 'config');
  assert.ok(configCmd, 'config command should exist');

  const unsetCmd = configCmd.commands.find(cmd => cmd.name() === 'unset');
  assert.ok(unsetCmd, 'unset subcommand should be registered');
});

test('config unset requires key argument', () => {
  const program = new Command();
  registerConfigCommands(program);

  const configCmd = program.commands.find(cmd => cmd.name() === 'config');
  const unsetCmd = configCmd?.commands.find(cmd => cmd.name() === 'unset');
  assert.ok(unsetCmd, 'unset subcommand should exist');

  const args = unsetCmd.registeredArguments || [];
  assert.ok(args.length >= 1, 'should have at least one argument (key)');
});

test('config unset has local option', () => {
  const program = new Command();
  registerConfigCommands(program);

  const configCmd = program.commands.find(cmd => cmd.name() === 'config');
  const unsetCmd = configCmd?.commands.find(cmd => cmd.name() === 'unset');
  assert.ok(unsetCmd, 'unset subcommand should exist');

  const localOpt = unsetCmd.options.find(opt => opt.long === '--local');
  assert.ok(localOpt, 'should have --local option');
});

// ============================================================================
// config path subcommand
// ============================================================================

test('config path subcommand is registered', () => {
  const program = new Command();
  registerConfigCommands(program);

  const configCmd = program.commands.find(cmd => cmd.name() === 'config');
  assert.ok(configCmd, 'config command should exist');

  const pathCmd = configCmd.commands.find(cmd => cmd.name() === 'path');
  assert.ok(pathCmd, 'path subcommand should be registered');
});

test('config path has correct description', () => {
  const program = new Command();
  registerConfigCommands(program);

  const configCmd = program.commands.find(cmd => cmd.name() === 'config');
  const pathCmd = configCmd?.commands.find(cmd => cmd.name() === 'path');
  assert.ok(pathCmd, 'path subcommand should exist');

  const desc = pathCmd.description().toLowerCase();
  assert.ok(desc.includes('path') || desc.includes('file'),
    'description should mention path/file');
});
