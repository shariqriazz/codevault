import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { Command } from 'commander';

export function registerMcpCommand(program: Command): void {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  program
    .command('mcp')
    .description('Start MCP server')
    .action(() => {
      const serverPath = path.join(__dirname, '..', '..', 'mcp-server.js');
      const mcpServer = spawn('node', [serverPath], {
        stdio: 'inherit'
      });

      mcpServer.on('error', (error) => {
        process.stderr.write(`ERROR starting MCP server: ${error.message}\n`);
        process.exit(1);
      });

      mcpServer.on('exit', (code) => {
        if (code !== 0) {
          process.stderr.write(`MCP server terminated with code: ${code}\n`);
          process.exit(code || 0);
        }
      });

      process.on('SIGINT', () => {
        mcpServer.kill('SIGINT');
      });

      process.on('SIGTERM', () => {
        mcpServer.kill('SIGTERM');
      });
    });
}
