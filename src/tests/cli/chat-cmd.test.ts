/**
 * Unit tests for chat-cmd.ts
 * Tests the chat command registration and option handling
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { registerChatCommand } from '../../cli/commands/chat-cmd.js';

test('registerChatCommand adds chat command to program', () => {
  const program = new Command();
  registerChatCommand(program);

  const chatCmd = program.commands.find(cmd => cmd.name() === 'chat');
  assert.ok(chatCmd, 'chat command should be registered');
});

test('chat command has correct description', () => {
  const program = new Command();
  registerChatCommand(program);

  const chatCmd = program.commands.find(cmd => cmd.name() === 'chat');
  assert.ok(chatCmd, 'chat command should exist');
  const desc = chatCmd.description().toLowerCase();
  assert.ok(desc.includes('chat') || desc.includes('interactive') || desc.includes('conversation'),
    'description should mention chat/interactive/conversation');
});

test('chat command has provider option with auto default', () => {
  const program = new Command();
  registerChatCommand(program);

  const chatCmd = program.commands.find(cmd => cmd.name() === 'chat');
  assert.ok(chatCmd, 'chat command should exist');

  const providerOpt = chatCmd.options.find(opt => opt.long === '--provider');
  assert.ok(providerOpt, 'should have --provider option');
  assert.equal(providerOpt.defaultValue, 'auto', 'default should be auto');
});

test('chat command has chat-provider option with auto default', () => {
  const program = new Command();
  registerChatCommand(program);

  const chatCmd = program.commands.find(cmd => cmd.name() === 'chat');
  assert.ok(chatCmd, 'chat command should exist');

  const chatProviderOpt = chatCmd.options.find(opt => opt.long === '--chat-provider');
  assert.ok(chatProviderOpt, 'should have --chat-provider option');
  assert.equal(chatProviderOpt.defaultValue, 'auto', 'default should be auto');
});

test('chat command has max-chunks option with default 10', () => {
  const program = new Command();
  registerChatCommand(program);

  const chatCmd = program.commands.find(cmd => cmd.name() === 'chat');
  assert.ok(chatCmd, 'chat command should exist');

  const maxChunksOpt = chatCmd.options.find(opt => opt.long === '--max-chunks');
  assert.ok(maxChunksOpt, 'should have --max-chunks option');
  assert.equal(maxChunksOpt.defaultValue, '10', 'default should be 10');
});

test('chat command has max-history option with default 5', () => {
  const program = new Command();
  registerChatCommand(program);

  const chatCmd = program.commands.find(cmd => cmd.name() === 'chat');
  assert.ok(chatCmd, 'chat command should exist');

  const maxHistoryOpt = chatCmd.options.find(opt => opt.long === '--max-history');
  assert.ok(maxHistoryOpt, 'should have --max-history option');
  assert.equal(maxHistoryOpt.defaultValue, '5', 'default should be 5');
});

test('chat command has temperature option with default 0.7', () => {
  const program = new Command();
  registerChatCommand(program);

  const chatCmd = program.commands.find(cmd => cmd.name() === 'chat');
  assert.ok(chatCmd, 'chat command should exist');

  const tempOpt = chatCmd.options.find(opt => opt.long === '--temperature');
  assert.ok(tempOpt, 'should have --temperature option');
  assert.equal(tempOpt.defaultValue, '0.7', 'default should be 0.7');
});

test('chat command has reranker option with default on', () => {
  const program = new Command();
  registerChatCommand(program);

  const chatCmd = program.commands.find(cmd => cmd.name() === 'chat');
  assert.ok(chatCmd, 'chat command should exist');

  const rerankerOpt = chatCmd.options.find(opt => opt.long === '--reranker');
  assert.ok(rerankerOpt, 'should have --reranker option');
  assert.equal(rerankerOpt.defaultValue, 'on', 'default should be on');
});

test('chat command has path option with default .', () => {
  const program = new Command();
  registerChatCommand(program);

  const chatCmd = program.commands.find(cmd => cmd.name() === 'chat');
  assert.ok(chatCmd, 'chat command should exist');

  const pathOpt = chatCmd.options.find(opt => opt.long === '--path');
  assert.ok(pathOpt, 'should have --path option');
  assert.equal(pathOpt.defaultValue, '.', 'default should be .');
});

test('chat command has path filtering options', () => {
  const program = new Command();
  registerChatCommand(program);

  const chatCmd = program.commands.find(cmd => cmd.name() === 'chat');
  assert.ok(chatCmd, 'chat command should exist');

  const pathGlobOpt = chatCmd.options.find(opt => opt.long === '--path_glob');
  const tagsOpt = chatCmd.options.find(opt => opt.long === '--tags');
  const langOpt = chatCmd.options.find(opt => opt.long === '--lang');

  assert.ok(pathGlobOpt, 'should have --path_glob option');
  assert.ok(tagsOpt, 'should have --tags option');
  assert.ok(langOpt, 'should have --lang option');
});

test('chat command has project and directory path aliases', () => {
  const program = new Command();
  registerChatCommand(program);

  const chatCmd = program.commands.find(cmd => cmd.name() === 'chat');
  assert.ok(chatCmd, 'chat command should exist');

  const projectOpt = chatCmd.options.find(opt => opt.long === '--project');
  const directoryOpt = chatCmd.options.find(opt => opt.long === '--directory');

  assert.ok(projectOpt, 'should have --project option');
  assert.ok(directoryOpt, 'should have --directory option');
});

test('chat command does not require arguments (interactive mode)', () => {
  const program = new Command();
  registerChatCommand(program);

  const chatCmd = program.commands.find(cmd => cmd.name() === 'chat');
  assert.ok(chatCmd, 'chat command should exist');

  // Chat is an interactive command, no required positional arguments
  const args = chatCmd.registeredArguments || [];
  const requiredArgs = args.filter(arg => arg.required);
  assert.equal(requiredArgs.length, 0, 'should not have required arguments');
});
