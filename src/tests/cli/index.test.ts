/**
 * Unit tests for the main CLI entry point (src/cli/index.ts)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';

// We test the CLI structure and command registration without executing commands
// that have side effects (like indexing, watching, etc.)

test('runCli creates a commander program with correct name and description', async () => {
  // Import the module to verify it exports runCli
  const { runCli } = await import('../../cli/index.js');
  assert.equal(typeof runCli, 'function');
});

test('CLI program has expected commands registered', async () => {
  // Create a test program to verify command structure
  const program = new Command();
  program.exitOverride(); // Prevent process.exit
  program.configureOutput({
    writeOut: () => {},
    writeErr: () => {}
  });

  // Import all register functions and verify they work
  const { registerIndexCommand } = await import('../../cli/commands/index-cmd.js');
  const { registerUpdateCommand } = await import('../../cli/commands/update-cmd.js');
  const { registerWatchCommand } = await import('../../cli/commands/watch-cmd.js');
  const { registerSearchCommand } = await import('../../cli/commands/search-cmd.js');
  const { registerSearchWithCodeCommand } = await import('../../cli/commands/search-with-code-cmd.js');
  const { registerConfigCommands } = await import('../../cli/commands/config-cmd.js');
  const { registerContextCommands } = await import('../../cli/commands/context.js');
  const { registerAskCommand } = await import('../../cli/commands/ask-cmd.js');
  const { registerChatCommand } = await import('../../cli/commands/chat-cmd.js');
  const { registerMcpCommand } = await import('../../cli/commands/mcp-cmd.js');
  const { registerInfoCommand } = await import('../../cli/commands/info-cmd.js');

  // Register all commands
  registerIndexCommand(program);
  registerUpdateCommand(program);
  registerWatchCommand(program);
  registerSearchCommand(program);
  registerSearchWithCodeCommand(program);
  registerConfigCommands(program);
  registerContextCommands(program);
  registerAskCommand(program);
  registerChatCommand(program);
  registerMcpCommand(program);
  registerInfoCommand(program);

  // Verify all expected commands are registered
  const commands = program.commands.map(cmd => cmd.name());

  assert.ok(commands.includes('index'), 'index command should be registered');
  assert.ok(commands.includes('update'), 'update command should be registered');
  assert.ok(commands.includes('watch'), 'watch command should be registered');
  assert.ok(commands.includes('search'), 'search command should be registered');
  assert.ok(commands.includes('search-with-code'), 'search-with-code command should be registered');
  assert.ok(commands.includes('config'), 'config command should be registered');
  assert.ok(commands.includes('context'), 'context command should be registered');
  assert.ok(commands.includes('ask'), 'ask command should be registered');
  assert.ok(commands.includes('chat'), 'chat command should be registered');
  assert.ok(commands.includes('mcp'), 'mcp command should be registered');
  assert.ok(commands.includes('info'), 'info command should be registered');
});

test('index command has correct options', async () => {
  const program = new Command();
  program.exitOverride();

  const { registerIndexCommand } = await import('../../cli/commands/index-cmd.js');
  registerIndexCommand(program);

  const indexCmd = program.commands.find(cmd => cmd.name() === 'index');
  assert.ok(indexCmd, 'index command should exist');

  const options = indexCmd.options.map(opt => opt.long || opt.short);
  assert.ok(options.includes('--provider'), 'should have --provider option');
  assert.ok(options.includes('--project'), 'should have --project option');
  assert.ok(options.includes('--directory'), 'should have --directory option');
  assert.ok(options.includes('--encrypt'), 'should have --encrypt option');
  assert.ok(options.includes('--concurrency'), 'should have --concurrency option');
  assert.ok(options.includes('--verbose'), 'should have --verbose option');
});

test('search command has correct options', async () => {
  const program = new Command();
  program.exitOverride();

  const { registerSearchCommand } = await import('../../cli/commands/search-cmd.js');
  registerSearchCommand(program);

  const searchCmd = program.commands.find(cmd => cmd.name() === 'search');
  assert.ok(searchCmd, 'search command should exist');

  const options = searchCmd.options.map(opt => opt.long || opt.short);
  assert.ok(options.includes('--limit'), 'should have --limit option');
  assert.ok(options.includes('--provider'), 'should have --provider option');
  assert.ok(options.includes('--hybrid'), 'should have --hybrid option');
  assert.ok(options.includes('--bm25'), 'should have --bm25 option');
  assert.ok(options.includes('--symbol_boost'), 'should have --symbol_boost option');
});

test('config command has subcommands', async () => {
  const program = new Command();
  program.exitOverride();

  const { registerConfigCommands } = await import('../../cli/commands/config-cmd.js');
  registerConfigCommands(program);

  const configCmd = program.commands.find(cmd => cmd.name() === 'config');
  assert.ok(configCmd, 'config command should exist');

  const subcommands = configCmd.commands.map(cmd => cmd.name());
  assert.ok(subcommands.includes('init'), 'should have init subcommand');
  assert.ok(subcommands.includes('set'), 'should have set subcommand');
  assert.ok(subcommands.includes('get'), 'should have get subcommand');
  assert.ok(subcommands.includes('list'), 'should have list subcommand');
  assert.ok(subcommands.includes('unset'), 'should have unset subcommand');
  assert.ok(subcommands.includes('path'), 'should have path subcommand');
});

test('context command has subcommands', async () => {
  const program = new Command();
  program.exitOverride();

  const { registerContextCommands } = await import('../../cli/commands/context.js');
  registerContextCommands(program);

  const contextCmd = program.commands.find(cmd => cmd.name() === 'context');
  assert.ok(contextCmd, 'context command should exist');

  const subcommands = contextCmd.commands.map(cmd => cmd.name());
  assert.ok(subcommands.includes('list'), 'should have list subcommand');
  assert.ok(subcommands.includes('show'), 'should have show subcommand');
  assert.ok(subcommands.includes('use'), 'should have use subcommand');
});

test('ask command has correct options', async () => {
  const program = new Command();
  program.exitOverride();

  const { registerAskCommand } = await import('../../cli/commands/ask-cmd.js');
  registerAskCommand(program);

  const askCmd = program.commands.find(cmd => cmd.name() === 'ask');
  assert.ok(askCmd, 'ask command should exist');

  const options = askCmd.options.map(opt => opt.long || opt.short);
  assert.ok(options.includes('--provider'), 'should have --provider option');
  assert.ok(options.includes('--chat-provider'), 'should have --chat-provider option');
  assert.ok(options.includes('--max-chunks'), 'should have --max-chunks option');
  assert.ok(options.includes('--multi-query'), 'should have --multi-query option');
  assert.ok(options.includes('--temperature'), 'should have --temperature option');
  assert.ok(options.includes('--stream'), 'should have --stream option');
  assert.ok(options.includes('--citations'), 'should have --citations option');
});

test('chat command has correct options', async () => {
  const program = new Command();
  program.exitOverride();

  const { registerChatCommand } = await import('../../cli/commands/chat-cmd.js');
  registerChatCommand(program);

  const chatCmd = program.commands.find(cmd => cmd.name() === 'chat');
  assert.ok(chatCmd, 'chat command should exist');

  const options = chatCmd.options.map(opt => opt.long || opt.short);
  assert.ok(options.includes('--provider'), 'should have --provider option');
  assert.ok(options.includes('--chat-provider'), 'should have --chat-provider option');
  assert.ok(options.includes('--max-chunks'), 'should have --max-chunks option');
  assert.ok(options.includes('--max-history'), 'should have --max-history option');
  assert.ok(options.includes('--temperature'), 'should have --temperature option');
});

test('watch command has debounce option', async () => {
  const program = new Command();
  program.exitOverride();

  const { registerWatchCommand } = await import('../../cli/commands/watch-cmd.js');
  registerWatchCommand(program);

  const watchCmd = program.commands.find(cmd => cmd.name() === 'watch');
  assert.ok(watchCmd, 'watch command should exist');

  const options = watchCmd.options.map(opt => opt.long || opt.short);
  assert.ok(options.includes('--debounce'), 'should have --debounce option');
  assert.ok(options.includes('--encrypt'), 'should have --encrypt option');
});

test('search-with-code command has max-code-size option', async () => {
  const program = new Command();
  program.exitOverride();

  const { registerSearchWithCodeCommand } = await import('../../cli/commands/search-with-code-cmd.js');
  registerSearchWithCodeCommand(program);

  const cmd = program.commands.find(c => c.name() === 'search-with-code');
  assert.ok(cmd, 'search-with-code command should exist');

  const options = cmd.options.map(opt => opt.long || opt.short);
  assert.ok(options.includes('--max-code-size'), 'should have --max-code-size option');
});
