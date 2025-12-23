/**
 * Unit tests for ask-cmd.ts
 * Tests the ask command registration and option handling
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { registerAskCommand } from '../../cli/commands/ask-cmd.js';

test('registerAskCommand adds ask command to program', () => {
  const program = new Command();
  registerAskCommand(program);

  const askCmd = program.commands.find(cmd => cmd.name() === 'ask');
  assert.ok(askCmd, 'ask command should be registered');
});

test('ask command requires question argument', () => {
  const program = new Command();
  registerAskCommand(program);

  const askCmd = program.commands.find(cmd => cmd.name() === 'ask');
  assert.ok(askCmd, 'ask command should exist');

  // Check for required question argument
  const args = askCmd.registeredArguments || [];
  assert.ok(args.length >= 1, 'should have at least one argument');
  if (args.length > 0) {
    assert.ok(args[0].required, 'question should be required');
  }
});

test('ask command has correct description', () => {
  const program = new Command();
  registerAskCommand(program);

  const askCmd = program.commands.find(cmd => cmd.name() === 'ask');
  assert.ok(askCmd, 'ask command should exist');
  const desc = askCmd.description().toLowerCase();
  assert.ok(desc.includes('question') || desc.includes('ask') || desc.includes('answer'),
    'description should mention question/ask/answer');
});

test('ask command has provider option with auto default', () => {
  const program = new Command();
  registerAskCommand(program);

  const askCmd = program.commands.find(cmd => cmd.name() === 'ask');
  assert.ok(askCmd, 'ask command should exist');

  const providerOpt = askCmd.options.find(opt => opt.long === '--provider');
  assert.ok(providerOpt, 'should have --provider option');
  assert.equal(providerOpt.defaultValue, 'auto', 'default should be auto');
});

test('ask command has chat-provider option with auto default', () => {
  const program = new Command();
  registerAskCommand(program);

  const askCmd = program.commands.find(cmd => cmd.name() === 'ask');
  assert.ok(askCmd, 'ask command should exist');

  const chatProviderOpt = askCmd.options.find(opt => opt.long === '--chat-provider');
  assert.ok(chatProviderOpt, 'should have --chat-provider option');
  assert.equal(chatProviderOpt.defaultValue, 'auto', 'default should be auto');
});

test('ask command has max-chunks option with default 10', () => {
  const program = new Command();
  registerAskCommand(program);

  const askCmd = program.commands.find(cmd => cmd.name() === 'ask');
  assert.ok(askCmd, 'ask command should exist');

  const maxChunksOpt = askCmd.options.find(opt => opt.long === '--max-chunks');
  assert.ok(maxChunksOpt, 'should have --max-chunks option');
  assert.equal(maxChunksOpt.defaultValue, '10', 'default should be 10');
});

test('ask command has short flag -k for max-chunks', () => {
  const program = new Command();
  registerAskCommand(program);

  const askCmd = program.commands.find(cmd => cmd.name() === 'ask');
  assert.ok(askCmd, 'ask command should exist');

  const maxChunksOpt = askCmd.options.find(opt => opt.long === '--max-chunks');
  assert.ok(maxChunksOpt, 'should have --max-chunks option');
  assert.equal(maxChunksOpt.short, '-k', 'should have -k short flag');
});

test('ask command has temperature option with default 0.7', () => {
  const program = new Command();
  registerAskCommand(program);

  const askCmd = program.commands.find(cmd => cmd.name() === 'ask');
  assert.ok(askCmd, 'ask command should exist');

  const tempOpt = askCmd.options.find(opt => opt.long === '--temperature');
  assert.ok(tempOpt, 'should have --temperature option');
  assert.equal(tempOpt.defaultValue, '0.7', 'default should be 0.7');
});

test('ask command has reranker option with default on', () => {
  const program = new Command();
  registerAskCommand(program);

  const askCmd = program.commands.find(cmd => cmd.name() === 'ask');
  assert.ok(askCmd, 'ask command should exist');

  const rerankerOpt = askCmd.options.find(opt => opt.long === '--reranker');
  assert.ok(rerankerOpt, 'should have --reranker option');
  assert.equal(rerankerOpt.defaultValue, 'on', 'default should be on');
});

test('ask command has multi-query flag', () => {
  const program = new Command();
  registerAskCommand(program);

  const askCmd = program.commands.find(cmd => cmd.name() === 'ask');
  assert.ok(askCmd, 'ask command should exist');

  const multiQueryOpt = askCmd.options.find(opt => opt.long === '--multi-query');
  assert.ok(multiQueryOpt, 'should have --multi-query option');
});

test('ask command has stream flag', () => {
  const program = new Command();
  registerAskCommand(program);

  const askCmd = program.commands.find(cmd => cmd.name() === 'ask');
  assert.ok(askCmd, 'ask command should exist');

  const streamOpt = askCmd.options.find(opt => opt.long === '--stream');
  assert.ok(streamOpt, 'should have --stream option');
});

test('ask command has citations flag', () => {
  const program = new Command();
  registerAskCommand(program);

  const askCmd = program.commands.find(cmd => cmd.name() === 'ask');
  assert.ok(askCmd, 'ask command should exist');

  const citationsOpt = askCmd.options.find(opt => opt.long === '--citations');
  assert.ok(citationsOpt, 'should have --citations option');
});

test('ask command has no-metadata flag', () => {
  const program = new Command();
  registerAskCommand(program);

  const askCmd = program.commands.find(cmd => cmd.name() === 'ask');
  assert.ok(askCmd, 'ask command should exist');

  const noMetadataOpt = askCmd.options.find(opt => opt.long === '--no-metadata');
  assert.ok(noMetadataOpt, 'should have --no-metadata option');
});

test('ask command has path filtering options', () => {
  const program = new Command();
  registerAskCommand(program);

  const askCmd = program.commands.find(cmd => cmd.name() === 'ask');
  assert.ok(askCmd, 'ask command should exist');

  const pathGlobOpt = askCmd.options.find(opt => opt.long === '--path_glob');
  const tagsOpt = askCmd.options.find(opt => opt.long === '--tags');
  const langOpt = askCmd.options.find(opt => opt.long === '--lang');

  assert.ok(pathGlobOpt, 'should have --path_glob option');
  assert.ok(tagsOpt, 'should have --tags option');
  assert.ok(langOpt, 'should have --lang option');
});

test('ask command has path option with default .', () => {
  const program = new Command();
  registerAskCommand(program);

  const askCmd = program.commands.find(cmd => cmd.name() === 'ask');
  assert.ok(askCmd, 'ask command should exist');

  const pathOpt = askCmd.options.find(opt => opt.long === '--path');
  assert.ok(pathOpt, 'should have --path option');
  assert.equal(pathOpt.defaultValue, '.', 'default should be .');
});

test('ask command has project and directory path aliases', () => {
  const program = new Command();
  registerAskCommand(program);

  const askCmd = program.commands.find(cmd => cmd.name() === 'ask');
  assert.ok(askCmd, 'ask command should exist');

  const projectOpt = askCmd.options.find(opt => opt.long === '--project');
  const directoryOpt = askCmd.options.find(opt => opt.long === '--directory');

  assert.ok(projectOpt, 'should have --project option');
  assert.ok(directoryOpt, 'should have --directory option');
});
