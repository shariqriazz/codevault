/**
 * Unit tests for info-cmd.ts
 * Tests the info command registration and basic behavior
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { registerInfoCommand } from '../../cli/commands/info-cmd.js';

test('registerInfoCommand adds info command to program', () => {
  const program = new Command();
  registerInfoCommand(program);

  const infoCmd = program.commands.find(cmd => cmd.name() === 'info');
  assert.ok(infoCmd, 'info command should be registered');
});

test('info command has correct description', () => {
  const program = new Command();
  registerInfoCommand(program);

  const infoCmd = program.commands.find(cmd => cmd.name() === 'info');
  assert.ok(infoCmd, 'info command should exist');
  const desc = infoCmd.description().toLowerCase();
  assert.ok(desc.includes('info') || desc.includes('project') || desc.includes('show'),
    'description should mention info/project/show');
});

test('info command has no required arguments', () => {
  const program = new Command();
  registerInfoCommand(program);

  const infoCmd = program.commands.find(cmd => cmd.name() === 'info');
  assert.ok(infoCmd, 'info command should exist');

  const args = infoCmd.registeredArguments || [];
  const requiredArgs = args.filter(arg => arg.required);
  assert.equal(requiredArgs.length, 0, 'should not have required arguments');
});

test('info command has no options', () => {
  const program = new Command();
  registerInfoCommand(program);

  const infoCmd = program.commands.find(cmd => cmd.name() === 'info');
  assert.ok(infoCmd, 'info command should exist');

  // Info is a simple command without options
  assert.equal(infoCmd.options.length, 0, 'should have no options');
});

test('info command is standalone (no subcommands)', () => {
  const program = new Command();
  registerInfoCommand(program);

  const infoCmd = program.commands.find(cmd => cmd.name() === 'info');
  assert.ok(infoCmd, 'info command should exist');

  assert.equal(infoCmd.commands.length, 0, 'should have no subcommands');
});
