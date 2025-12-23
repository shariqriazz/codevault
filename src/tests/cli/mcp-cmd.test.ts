/**
 * Unit tests for mcp-cmd.ts
 * Tests the MCP server command registration
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { registerMcpCommand } from '../../cli/commands/mcp-cmd.js';

test('registerMcpCommand adds mcp command to program', () => {
  const program = new Command();
  registerMcpCommand(program);

  const mcpCmd = program.commands.find(cmd => cmd.name() === 'mcp');
  assert.ok(mcpCmd, 'mcp command should be registered');
});

test('mcp command has correct description', () => {
  const program = new Command();
  registerMcpCommand(program);

  const mcpCmd = program.commands.find(cmd => cmd.name() === 'mcp');
  assert.ok(mcpCmd, 'mcp command should exist');
  const desc = mcpCmd.description().toLowerCase();
  assert.ok(desc.includes('mcp') || desc.includes('server') || desc.includes('start'),
    'description should mention mcp/server/start');
});

test('mcp command has no required arguments', () => {
  const program = new Command();
  registerMcpCommand(program);

  const mcpCmd = program.commands.find(cmd => cmd.name() === 'mcp');
  assert.ok(mcpCmd, 'mcp command should exist');

  const args = mcpCmd.registeredArguments || [];
  const requiredArgs = args.filter(arg => arg.required);
  assert.equal(requiredArgs.length, 0, 'should not have required arguments');
});

test('mcp command has no options', () => {
  const program = new Command();
  registerMcpCommand(program);

  const mcpCmd = program.commands.find(cmd => cmd.name() === 'mcp');
  assert.ok(mcpCmd, 'mcp command should exist');

  // MCP is a simple command without options
  assert.equal(mcpCmd.options.length, 0, 'should have no options');
});

test('mcp command is standalone (no subcommands)', () => {
  const program = new Command();
  registerMcpCommand(program);

  const mcpCmd = program.commands.find(cmd => cmd.name() === 'mcp');
  assert.ok(mcpCmd, 'mcp command should exist');

  assert.equal(mcpCmd.commands.length, 0, 'should have no subcommands');
});
