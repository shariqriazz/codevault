import { Command } from 'commander';
import chalk from 'chalk';
import {
  loadConfig,
  readGlobalConfig,
  readProjectConfig,
  saveGlobalConfig,
  saveProjectConfig,
  hasGlobalConfig,
  getGlobalConfigPath,
  getConfigSources
} from '../../config/loader.js';
import { runInteractiveConfig } from './interactive-config.js';
import type { CodevaultConfig } from '../../config/types.js';

function displayConfig(config: CodevaultConfig | null, title: string): void {
  if (!config || Object.keys(config).length === 0) {
    process.stdout.write(`${chalk.gray(`  ${title}: (empty)`)  }\n`);
    return;
  }

  process.stdout.write(`${chalk.bold(`  ${title}:`)  }\n`);
  process.stdout.write(`  ${  JSON.stringify(config, null, 2).split('\n').join('\n  ')}` + '\n');
}

export function registerConfigCommands(program: Command): void {
  const configCommand = program
    .command('config')
    .description('Manage CodeVault configuration');

  // config init - Interactive setup
  configCommand
    .command('init')
    .description('Initialize global configuration (interactive)')
    .option('--force', 'Overwrite existing configuration')
    .option('--no-interactive', 'Skip interactive prompts, create basic config')
    .action(async (options: Record<string, unknown>) => {
      // Use interactive mode by default
      if (options.interactive !== false) {
        await runInteractiveConfig(options.force as boolean | undefined);
        return;
      }

      // Non-interactive mode (legacy)
      if (hasGlobalConfig() && !options.force) {
        process.stdout.write(`${chalk.yellow('⚠️  Global configuration already exists at:')  }\n`);
        process.stdout.write(`${chalk.cyan(`   ${getGlobalConfigPath()}`)  }\n`);
        process.stdout.write('\n');
        process.stdout.write('Use --force to overwrite, or edit the file directly.' + '\n');
        process.stdout.write(`Run: ${  chalk.cyan('codevault config show --global')}` + '\n');
        return;
      }

      process.stdout.write(`${chalk.bold('🚀 CodeVault Configuration Setup\n')  }\n`);

      const config: CodevaultConfig = {
        defaultProvider: 'auto',
        providers: {}
      };

      process.stdout.write('Configuration will be saved to:' + '\n');
      process.stdout.write(`${chalk.cyan(`  ${getGlobalConfigPath()}\n`)  }\n`);

      process.stdout.write(`${chalk.gray('You can configure providers now or later using:')  }\n`);
      process.stdout.write(`${chalk.cyan('  codevault config set <key> <value>\n')  }\n`);

      saveGlobalConfig(config);
      process.stdout.write(`${chalk.green('✓ Global configuration initialized!')  }\n`);
      process.stdout.write('\n');
      process.stdout.write('Next steps:' + '\n');
      process.stdout.write(`${chalk.cyan('  codevault config set providers.openai.apiKey YOUR_API_KEY')  }\n`);
      process.stdout.write(`${chalk.cyan('  codevault config set providers.openai.model text-embedding-3-large')  }\n`);
    });

  // config set - Set configuration value
  configCommand
    .command('set <key> <value>')
    .description('Set a configuration value')
    .option('-l, --local [path]', 'Save to project config instead of global')
    .action((key: string, value: string, options: Record<string, unknown>) => {
      const isLocal = options.local !== undefined;
      const basePath = typeof options.local === 'string' ? options.local : '.';

      let config: CodevaultConfig;
      if (isLocal) {
        config = readProjectConfig(basePath) || {};
      } else {
        config = readGlobalConfig() || {};
      }

      // Parse key path (e.g., "openai.apiKey" -> ["openai", "apiKey"])
      const keyPath = key.split('.');

      // Set the value
      let current: Record<string, unknown> = config as Record<string, unknown>;
      for (let i = 0; i < keyPath.length - 1; i++) {
        const part = keyPath[i];
        if (!current[part] || typeof current[part] !== 'object') {
          current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
      }

      const lastKey = keyPath[keyPath.length - 1];

      // Try to parse value as JSON, otherwise use as string
      let parsedValue: string | number | boolean = value;
      if (value === 'true') parsedValue = true;
      else if (value === 'false') parsedValue = false;
      else if (!isNaN(Number(value))) parsedValue = Number(value);

      current[lastKey] = parsedValue;

      // Save config
      if (isLocal) {
        saveProjectConfig(config, basePath);
        process.stdout.write(`${chalk.green(`✓ Set ${key} in project config`)  }\n`);
      } else {
        saveGlobalConfig(config);
        process.stdout.write(`${chalk.green(`✓ Set ${key} in global config`)  }\n`);
      }
    });

  // config get - Get configuration value
  configCommand
    .command('get <key>')
    .description('Get a configuration value')
    .option('-g, --global', 'Get from global config only')
    .option('-l, --local [path]', 'Get from project config only')
    .action((key: string, options: Record<string, unknown>) => {
      let config: CodevaultConfig;
      
      if (options.global) {
        config = readGlobalConfig() || {};
      } else if (options.local !== undefined) {
        const basePath = typeof options.local === 'string' ? options.local : '.';
        config = readProjectConfig(basePath) || {};
      } else {
        config = loadConfig();
      }

      // Navigate key path
      const keyPath = key.split('.');
      let value: unknown = config;

      for (const part of keyPath) {
        if (value && typeof value === 'object' && value !== null) {
          value = (value as Record<string, unknown>)[part];
        } else {
          value = undefined;
          break;
        }
      }

      if (value === undefined) {
        process.stdout.write(`${chalk.yellow(`Key '${key}' not found`)  }\n`);
      } else if (typeof value === 'object' && value !== null) {
        process.stdout.write(`${JSON.stringify(value, null, 2)  }\n`);
      } else {
        process.stdout.write(`${String(value)  }\n`);
      }
    });

  // config list - List all configuration
  configCommand
    .command('list')
    .alias('show')
    .description('Show current configuration')
    .option('-g, --global', 'Show global config only')
    .option('-l, --local [path]', 'Show project config only')
    .option('-s, --sources', 'Show all configuration sources')
    .action((options: Record<string, unknown>) => {
      if (options.sources) {
        const basePath = typeof options.local === 'string' ? options.local : '.';
        const sources = getConfigSources(basePath);

        process.stdout.write(`${chalk.bold('Configuration Sources:\n')  }\n`);
        displayConfig(sources.global, 'Global (~/.codevault/config.json)');
        process.stdout.write('\n');
        displayConfig(sources.project, 'Project (.codevault/config.json)');
        process.stdout.write('\n');
        displayConfig(sources.env, 'Environment Variables');
        process.stdout.write('\n');
        process.stdout.write(`${chalk.gray('Priority: Environment > Project > Global')  }\n`);
        return;
      }

      if (options.global) {
        const config = readGlobalConfig();
        process.stdout.write(`${chalk.bold('Global Configuration:\n')  }\n`);
        if (!config || Object.keys(config).length === 0) {
          process.stdout.write(`${chalk.gray('  (empty)')  }\n`);
          process.stdout.write('\n');
          process.stdout.write(`Initialize with: ${  chalk.cyan('codevault config init')}` + '\n');
        } else {
          process.stdout.write(`${JSON.stringify(config, null, 2)  }\n`);
        }
        return;
      }

      if (options.local !== undefined) {
        const basePath = typeof options.local === 'string' ? options.local : '.';
        const config = readProjectConfig(basePath);
        process.stdout.write(`${chalk.bold('Project Configuration:\n')  }\n`);
        if (!config || Object.keys(config).length === 0) {
          process.stdout.write(`${chalk.gray('  (empty)')  }\n`);
        } else {
          process.stdout.write(`${JSON.stringify(config, null, 2)  }\n`);
        }
        return;
      }

      // Show merged config
      const config = loadConfig();
      process.stdout.write(`${chalk.bold('Merged Configuration:\n')  }\n`);
      process.stdout.write(`${JSON.stringify(config, null, 2)  }\n`);
      process.stdout.write('\n');
      process.stdout.write(`${chalk.gray('Tip: Use --sources to see individual config sources')  }\n`);
    });

  // config unset - Remove configuration value
  configCommand
    .command('unset <key>')
    .description('Remove a configuration value')
    .option('-l, --local [path]', 'Remove from project config instead of global')
    .action((key: string, options: Record<string, unknown>) => {
      const isLocal = options.local !== undefined;
      const basePath = typeof options.local === 'string' ? options.local : '.';

      let config: CodevaultConfig;
      if (isLocal) {
        config = readProjectConfig(basePath) || {};
      } else {
        config = readGlobalConfig() || {};
      }

      // Parse and navigate to parent of key
      const keyPath = key.split('.');
      let current: Record<string, unknown> = config as Record<string, unknown>;

      for (let i = 0; i < keyPath.length - 1; i++) {
        const part = keyPath[i];
        if (!current[part] || typeof current[part] !== 'object') {
          process.stdout.write(`${chalk.yellow(`Key '${key}' not found`)  }\n`);
          return;
        }
        current = current[part] as Record<string, unknown>;
      }

      const lastKey = keyPath[keyPath.length - 1];
      if (!(lastKey in current)) {
        process.stdout.write(`${chalk.yellow(`Key '${key}' not found`)  }\n`);
        return;
      }

      delete current[lastKey];

      // Save config
      if (isLocal) {
        saveProjectConfig(config, basePath);
        process.stdout.write(`${chalk.green(`✓ Removed ${key} from project config`)  }\n`);
      } else {
        saveGlobalConfig(config);
        process.stdout.write(`${chalk.green(`✓ Removed ${key} from global config`)  }\n`);
      }
    });

  // config path - Show config file paths
  configCommand
    .command('path')
    .description('Show configuration file paths')
    .action(() => {
      process.stdout.write(`${chalk.bold('Configuration Paths:\n')  }\n`);
      process.stdout.write(`${chalk.cyan('Global:  ') + getGlobalConfigPath()  }\n`);
      process.stdout.write(`${chalk.cyan('Project: ')  }.codevault/config.json` + '\n');
    });
}