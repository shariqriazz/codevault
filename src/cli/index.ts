import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Command } from 'commander';
import { registerAskCommand } from './commands/ask-cmd.js';
import { registerChatCommand } from './commands/chat-cmd.js';
import { registerConfigCommands } from './commands/config-cmd.js';
import { registerContextCommands } from './commands/context.js';
import { registerIndexCommand } from './commands/index-cmd.js';
import { registerInfoCommand } from './commands/info-cmd.js';
import { registerMcpCommand } from './commands/mcp-cmd.js';
import { registerSearchCommand } from './commands/search-cmd.js';
import { registerSearchWithCodeCommand } from './commands/search-with-code-cmd.js';
import { registerUpdateCommand } from './commands/update-cmd.js';
import { registerWatchCommand } from './commands/watch-cmd.js';

function readPackageVersion(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return packageJson.version;
}

export async function runCli(argv = process.argv): Promise<void> {
  const program = new Command();

  program
    .name('codevault')
    .description('CodeVault - AI-powered semantic code search via MCP')
    .version(readPackageVersion());

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

  if (!argv || argv.length <= 2) {
    program.help();
    return;
  }

  await program.parseAsync(argv);
}
