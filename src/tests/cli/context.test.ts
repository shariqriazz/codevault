/**
 * Unit tests for context.ts (context pack management commands)
 * Tests the context command registration and subcommand handling
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { registerContextCommands } from '../../cli/commands/context.js';

test('registerContextCommands adds context command to program', () => {
  const program = new Command();
  registerContextCommands(program);

  const contextCmd = program.commands.find(cmd => cmd.name() === 'context');
  assert.ok(contextCmd, 'context command should be registered');
});

test('context command has correct description', () => {
  const program = new Command();
  registerContextCommands(program);

  const contextCmd = program.commands.find(cmd => cmd.name() === 'context');
  assert.ok(contextCmd, 'context command should exist');
  const desc = contextCmd.description().toLowerCase();
  assert.ok(desc.includes('context') || desc.includes('pack'),
    'description should mention context/pack');
});

// ============================================================================
// context list subcommand
// ============================================================================

test('context list subcommand is registered', () => {
  const program = new Command();
  registerContextCommands(program);

  const contextCmd = program.commands.find(cmd => cmd.name() === 'context');
  assert.ok(contextCmd, 'context command should exist');

  const listCmd = contextCmd.commands.find(cmd => cmd.name() === 'list');
  assert.ok(listCmd, 'list subcommand should be registered');
});

test('context list accepts optional path argument', () => {
  const program = new Command();
  registerContextCommands(program);

  const contextCmd = program.commands.find(cmd => cmd.name() === 'context');
  const listCmd = contextCmd?.commands.find(cmd => cmd.name() === 'list');
  assert.ok(listCmd, 'list subcommand should exist');

  // Should accept optional path argument
  const args = listCmd.registeredArguments || [];
  // Either no args (default .) or optional arg
  assert.ok(args.length === 0 || !args[0]?.required,
    'path argument should be optional');
});

test('context list has correct description', () => {
  const program = new Command();
  registerContextCommands(program);

  const contextCmd = program.commands.find(cmd => cmd.name() === 'context');
  const listCmd = contextCmd?.commands.find(cmd => cmd.name() === 'list');
  assert.ok(listCmd, 'list subcommand should exist');

  const desc = listCmd.description().toLowerCase();
  assert.ok(desc.includes('list') || desc.includes('available'),
    'description should mention list/available');
});

// ============================================================================
// context show subcommand
// ============================================================================

test('context show subcommand is registered', () => {
  const program = new Command();
  registerContextCommands(program);

  const contextCmd = program.commands.find(cmd => cmd.name() === 'context');
  assert.ok(contextCmd, 'context command should exist');

  const showCmd = contextCmd.commands.find(cmd => cmd.name() === 'show');
  assert.ok(showCmd, 'show subcommand should be registered');
});

test('context show requires name argument', () => {
  const program = new Command();
  registerContextCommands(program);

  const contextCmd = program.commands.find(cmd => cmd.name() === 'context');
  const showCmd = contextCmd?.commands.find(cmd => cmd.name() === 'show');
  assert.ok(showCmd, 'show subcommand should exist');

  const args = showCmd.registeredArguments || [];
  assert.ok(args.length >= 1, 'should have at least one argument');
  if (args.length > 0) {
    assert.ok(args[0].required, 'name should be required');
  }
});

test('context show accepts optional path argument', () => {
  const program = new Command();
  registerContextCommands(program);

  const contextCmd = program.commands.find(cmd => cmd.name() === 'context');
  const showCmd = contextCmd?.commands.find(cmd => cmd.name() === 'show');
  assert.ok(showCmd, 'show subcommand should exist');

  const args = showCmd.registeredArguments || [];
  // Should have name (required) and optionally path
  assert.ok(args.length >= 1, 'should have at least name argument');
  if (args.length >= 2) {
    assert.ok(!args[1].required, 'path should be optional');
  }
});

test('context show has correct description', () => {
  const program = new Command();
  registerContextCommands(program);

  const contextCmd = program.commands.find(cmd => cmd.name() === 'context');
  const showCmd = contextCmd?.commands.find(cmd => cmd.name() === 'show');
  assert.ok(showCmd, 'show subcommand should exist');

  const desc = showCmd.description().toLowerCase();
  assert.ok(desc.includes('show') || desc.includes('definition'),
    'description should mention show/definition');
});

// ============================================================================
// context use subcommand
// ============================================================================

test('context use subcommand is registered', () => {
  const program = new Command();
  registerContextCommands(program);

  const contextCmd = program.commands.find(cmd => cmd.name() === 'context');
  assert.ok(contextCmd, 'context command should exist');

  const useCmd = contextCmd.commands.find(cmd => cmd.name() === 'use');
  assert.ok(useCmd, 'use subcommand should be registered');
});

test('context use requires name argument', () => {
  const program = new Command();
  registerContextCommands(program);

  const contextCmd = program.commands.find(cmd => cmd.name() === 'context');
  const useCmd = contextCmd?.commands.find(cmd => cmd.name() === 'use');
  assert.ok(useCmd, 'use subcommand should exist');

  const args = useCmd.registeredArguments || [];
  assert.ok(args.length >= 1, 'should have at least one argument');
  if (args.length > 0) {
    assert.ok(args[0].required, 'name should be required');
  }
});

test('context use accepts optional path argument', () => {
  const program = new Command();
  registerContextCommands(program);

  const contextCmd = program.commands.find(cmd => cmd.name() === 'context');
  const useCmd = contextCmd?.commands.find(cmd => cmd.name() === 'use');
  assert.ok(useCmd, 'use subcommand should exist');

  const args = useCmd.registeredArguments || [];
  // Should have name (required) and optionally path
  assert.ok(args.length >= 1, 'should have at least name argument');
  if (args.length >= 2) {
    assert.ok(!args[1].required, 'path should be optional');
  }
});

test('context use has correct description', () => {
  const program = new Command();
  registerContextCommands(program);

  const contextCmd = program.commands.find(cmd => cmd.name() === 'context');
  const useCmd = contextCmd?.commands.find(cmd => cmd.name() === 'use');
  assert.ok(useCmd, 'use subcommand should exist');

  const desc = useCmd.description().toLowerCase();
  assert.ok(desc.includes('activate') || desc.includes('use'),
    'description should mention activate/use');
});

// ============================================================================
// General context command structure
// ============================================================================

test('context command has exactly three subcommands', () => {
  const program = new Command();
  registerContextCommands(program);

  const contextCmd = program.commands.find(cmd => cmd.name() === 'context');
  assert.ok(contextCmd, 'context command should exist');

  const subcommands = contextCmd.commands.map(cmd => cmd.name());
  assert.equal(subcommands.length, 3, 'should have three subcommands');
  assert.ok(subcommands.includes('list'), 'should have list subcommand');
  assert.ok(subcommands.includes('show'), 'should have show subcommand');
  assert.ok(subcommands.includes('use'), 'should have use subcommand');
});
