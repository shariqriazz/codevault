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

// Type definitions for command options
interface InitOptions {
  force?: boolean;
  interactive?: boolean;
}

interface SetOptions {
  local?: string | boolean;
}

interface GetOptions {
  global?: boolean;
  local?: string | boolean;
}

interface ListOptions {
  global?: boolean;
  local?: string | boolean;
  sources?: boolean;
}

interface UnsetOptions {
  local?: string | boolean;
}

function displayConfig(config: CodevaultConfig | null, title: string): void {
  if (!config || Object.keys(config).length === 0) {
    console.log(chalk.gray(`  ${title}: (empty)`));
    return;
  }

  console.log(chalk.bold(`  ${title}:`));
  console.log(`  ${  JSON.stringify(config, null, 2).split('\n').join('\n  ')}`);
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
    .action(async (options: InitOptions) => {
      // Use interactive mode by default
      if (options.interactive !== false) {
        await runInteractiveConfig(options.force ?? false);
        return;
      }

      // Non-interactive mode (legacy)
      if (hasGlobalConfig() && !options.force) {
        console.log(chalk.yellow('⚠️  Global configuration already exists at:'));
        console.log(chalk.cyan(`   ${getGlobalConfigPath()}`));
        console.log('');
        console.log('Use --force to overwrite, or edit the file directly.');
        console.log(`Run: ${  chalk.cyan('codevault config show --global')}`);
        return;
      }

      console.log(chalk.bold('🚀 CodeVault Configuration Setup\n'));

      const config: CodevaultConfig = {
        defaultProvider: 'auto',
        providers: {}
      };

      console.log('Configuration will be saved to:');
      console.log(chalk.cyan(`  ${getGlobalConfigPath()}\n`));

      console.log(chalk.gray('You can configure providers now or later using:'));
      console.log(chalk.cyan('  codevault config set <key> <value>\n'));

      saveGlobalConfig(config);
      console.log(chalk.green('✓ Global configuration initialized!'));
      console.log('');
      console.log('Next steps:');
      console.log(chalk.cyan('  codevault config set providers.openai.apiKey YOUR_API_KEY'));
      console.log(chalk.cyan('  codevault config set providers.openai.model text-embedding-3-large'));
    });

  // config set - Set configuration value
  configCommand
    .command('set <key> <value>')
    .description('Set a configuration value')
    .option('-l, --local [path]', 'Save to project config instead of global')
    .action((key: string, value: string, options: SetOptions) => {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let current: any = config;
      for (let i = 0; i < keyPath.length - 1; i++) {
        const part = keyPath[i];

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (!current[part]) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          current[part] = {};
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        current = current[part];
      }

      const lastKey = keyPath[keyPath.length - 1];

      // Try to parse value as JSON, otherwise use as string
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let parsedValue: any = value;
      if (value === 'true') parsedValue = true;
      else if (value === 'false') parsedValue = false;
      else if (!isNaN(Number(value))) parsedValue = Number(value);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      current[lastKey] = parsedValue;

      // Save config
      if (isLocal) {
        saveProjectConfig(config, basePath);
        console.log(chalk.green(`✓ Set ${key} in project config`));
      } else {
        saveGlobalConfig(config);
        console.log(chalk.green(`✓ Set ${key} in global config`));
      }
    });

  // config get - Get configuration value
  configCommand
    .command('get <key>')
    .description('Get a configuration value')
    .option('-g, --global', 'Get from global config only')
    .option('-l, --local [path]', 'Get from project config only')
    .action((key: string, options: GetOptions) => {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let value: any = config;

      for (const part of keyPath) {
        if (value && typeof value === 'object') {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          value = value[part];
        } else {
          value = undefined;
          break;
        }
      }

      if (value === undefined) {
        console.log(chalk.yellow(`Key '${key}' not found`));
      } else if (typeof value === 'object') {
        console.log(JSON.stringify(value, null, 2));
      } else {
        console.log(value);
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
    .action((options: ListOptions) => {
      if (options.sources) {
        const basePath = typeof options.local === 'string' ? options.local : '.';
        const sources = getConfigSources(basePath);

        console.log(chalk.bold('Configuration Sources:\n'));
        displayConfig(sources.global, 'Global (~/.codevault/config.json)');
        console.log('');
        displayConfig(sources.project, 'Project (.codevault/config.json)');
        console.log('');
        displayConfig(sources.env, 'Environment Variables');
        console.log('');
        console.log(chalk.gray('Priority: Environment > Project > Global'));
        return;
      }

      if (options.global) {
        const config = readGlobalConfig();
        console.log(chalk.bold('Global Configuration:\n'));
        if (!config || Object.keys(config).length === 0) {
          console.log(chalk.gray('  (empty)'));
          console.log('');
          console.log(`Initialize with: ${  chalk.cyan('codevault config init')}`);
        } else {
          console.log(JSON.stringify(config, null, 2));
        }
        return;
      }

      if (options.local !== undefined) {
        const basePath = typeof options.local === 'string' ? options.local : '.';
        const config = readProjectConfig(basePath);
        console.log(chalk.bold('Project Configuration:\n'));
        if (!config || Object.keys(config).length === 0) {
          console.log(chalk.gray('  (empty)'));
        } else {
          console.log(JSON.stringify(config, null, 2));
        }
        return;
      }

      // Show merged config
      const config = loadConfig();
      console.log(chalk.bold('Merged Configuration:\n'));
      console.log(JSON.stringify(config, null, 2));
      console.log('');
      console.log(chalk.gray('Tip: Use --sources to see individual config sources'));
    });

  // config unset - Remove configuration value
  configCommand
    .command('unset <key>')
    .description('Remove a configuration value')
    .option('-l, --local [path]', 'Remove from project config instead of global')
    .action((key: string, options: UnsetOptions) => {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let current: any = config;

      for (let i = 0; i < keyPath.length - 1; i++) {
        const part = keyPath[i];

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (!current[part]) {
          console.log(chalk.yellow(`Key '${key}' not found`));
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        current = current[part];
      }

      const lastKey = keyPath[keyPath.length - 1];
      if (!(lastKey in current)) {
        console.log(chalk.yellow(`Key '${key}' not found`));
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      delete current[lastKey];

      // Save config
      if (isLocal) {
        saveProjectConfig(config, basePath);
        console.log(chalk.green(`✓ Removed ${key} from project config`));
      } else {
        saveGlobalConfig(config);
        console.log(chalk.green(`✓ Removed ${key} from global config`));
      }
    });

  // config path - Show config file paths
  configCommand
    .command('path')
    .description('Show configuration file paths')
    .action(() => {
      console.log(chalk.bold('Configuration Paths:\n'));
      console.log(chalk.cyan('Global:  ') + getGlobalConfigPath());
      console.log(`${chalk.cyan('Project: ')  }.codevault/config.json`);
    });
}