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
import { print } from '../../utils/logger.js';

function displayConfig(config: CodevaultConfig | null, title: string): void {
  if (!config || Object.keys(config).length === 0) {
    print(chalk.gray(`  ${title}: (empty)`));
    return;
  }

  print(chalk.bold(`  ${title}:`));
  print(`  ${  JSON.stringify(config, null, 2).split('\n').join('\n  ')}`);
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
    .action(async (options) => {
      // Use interactive mode by default
      if (options.interactive !== false) {
        await runInteractiveConfig(options.force);
        return;
      }

      // Non-interactive mode (legacy)
      if (hasGlobalConfig() && !options.force) {
        print(chalk.yellow('⚠️  Global configuration already exists at:'));
        print(chalk.cyan(`   ${getGlobalConfigPath()}`));
        print('');
        print('Use --force to overwrite, or edit the file directly.');
        print(`Run: ${  chalk.cyan('codevault config show --global')}`);
        return;
      }

      print(chalk.bold('🚀 CodeVault Configuration Setup\n'));

      const config: CodevaultConfig = {
        defaultProvider: 'auto',
        providers: {}
      };

      print('Configuration will be saved to:');
      print(chalk.cyan(`  ${getGlobalConfigPath()}\n`));

      print(chalk.gray('You can configure providers now or later using:'));
      print(chalk.cyan('  codevault config set <key> <value>\n'));

      saveGlobalConfig(config);
      print(chalk.green('✓ Global configuration initialized!'));
      print('');
      print('Next steps:');
      print(chalk.cyan('  codevault config set providers.openai.apiKey YOUR_API_KEY'));
      print(chalk.cyan('  codevault config set providers.openai.model text-embedding-3-large'));
    });

  // config set - Set configuration value
  configCommand
    .command('set <key> <value>')
    .description('Set a configuration value')
    .option('-l, --local [path]', 'Save to project config instead of global')
    .action((key, value, options) => {
      const isLocal = options.local !== undefined;
      const basePath = typeof options.local === 'string' ? options.local : '.';

      let config: CodevaultConfig;
      if (isLocal) {
        config = readProjectConfig(basePath) || {};
      } else {
        config = readGlobalConfig() || {};
      }

      // Parse key path (e.g., "openai.apiKey" -> ["openai", "apiKey"])
      const keyStr = String(key);
      const keyPath = keyStr.split('.');
      
      // Set the value
      let current: any = config;
      for (let i = 0; i < keyPath.length - 1; i++) {
        const part = keyPath[i];
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }
      
      const lastKey = keyPath[keyPath.length - 1];
      
      // Try to parse value as JSON, otherwise use as string
      let parsedValue: any = value;
      if (value === 'true') parsedValue = true;
      else if (value === 'false') parsedValue = false;
      else if (!isNaN(Number(value))) parsedValue = Number(value);
      
      current[lastKey] = parsedValue;

      // Save config
      if (isLocal) {
        saveProjectConfig(config, basePath);
        print(chalk.green(`✓ Set ${key} in project config`));
      } else {
        saveGlobalConfig(config);
        print(chalk.green(`✓ Set ${key} in global config`));
      }
    });

  // config get - Get configuration value
  configCommand
    .command('get <key>')
    .description('Get a configuration value')
    .option('-g, --global', 'Get from global config only')
    .option('-l, --local [path]', 'Get from project config only')
    .action((key, options) => {
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
      const keyStr = String(key);
      const keyPath = keyStr.split('.');
      let value: any = config;
      
      for (const part of keyPath) {
        if (value && typeof value === 'object') {
          value = value[part];
        } else {
          value = undefined;
          break;
        }
      }

      if (value === undefined) {
        print(chalk.yellow(`Key '${key}' not found`));
      } else if (typeof value === 'object') {
        print(JSON.stringify(value, null, 2));
      } else {
        print(value);
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
    .action((options) => {
      if (options.sources) {
        const basePath = typeof options.local === 'string' ? options.local : '.';
        const sources = getConfigSources(basePath);

        print(chalk.bold('Configuration Sources:\n'));
        displayConfig(sources.global, 'Global (~/.codevault/config.json)');
        print('');
        displayConfig(sources.project, 'Project (.codevault/config.json)');
        print('');
        displayConfig(sources.env, 'Environment Variables');
        print('');
        print(chalk.gray('Priority: Environment > Project > Global'));
        return;
      }

      if (options.global) {
        const config = readGlobalConfig();
        print(chalk.bold('Global Configuration:\n'));
        if (!config || Object.keys(config).length === 0) {
          print(chalk.gray('  (empty)'));
          print('');
          print(`Initialize with: ${  chalk.cyan('codevault config init')}`);
        } else {
          print(JSON.stringify(config, null, 2));
        }
        return;
      }

      if (options.local !== undefined) {
        const basePath = typeof options.local === 'string' ? options.local : '.';
        const config = readProjectConfig(basePath);
        print(chalk.bold('Project Configuration:\n'));
        if (!config || Object.keys(config).length === 0) {
          print(chalk.gray('  (empty)'));
        } else {
          print(JSON.stringify(config, null, 2));
        }
        return;
      }

      // Show merged config
      const config = loadConfig();
      print(chalk.bold('Merged Configuration:\n'));
      print(JSON.stringify(config, null, 2));
      print('');
      print(chalk.gray('Tip: Use --sources to see individual config sources'));
    });

  // config unset - Remove configuration value
  configCommand
    .command('unset <key>')
    .description('Remove a configuration value')
    .option('-l, --local [path]', 'Remove from project config instead of global')
    .action((key, options) => {
      const isLocal = options.local !== undefined;
      const basePath = typeof options.local === 'string' ? options.local : '.';

      let config: CodevaultConfig;
      if (isLocal) {
        config = readProjectConfig(basePath) || {};
      } else {
        config = readGlobalConfig() || {};
      }

      // Parse and navigate to parent of key
      const keyStr = String(key);
      const keyPath = keyStr.split('.');
      let current: any = config;
      
      for (let i = 0; i < keyPath.length - 1; i++) {
        const part = keyPath[i];
        if (!current[part]) {
          print(chalk.yellow(`Key '${key}' not found`));
          return;
        }
        current = current[part];
      }

      const lastKey = keyPath[keyPath.length - 1];
      if (!(lastKey in current)) {
        print(chalk.yellow(`Key '${key}' not found`));
        return;
      }

      delete current[lastKey];

      // Save config
      if (isLocal) {
        saveProjectConfig(config, basePath);
        print(chalk.green(`✓ Removed ${key} from project config`));
      } else {
        saveGlobalConfig(config);
        print(chalk.green(`✓ Removed ${key} from global config`));
      }
    });

  // config path - Show config file paths
  configCommand
    .command('path')
    .description('Show configuration file paths')
    .action(() => {
      print(chalk.bold('Configuration Paths:\n'));
      print(chalk.cyan('Global:  ') + getGlobalConfigPath());
      print(`${chalk.cyan('Project: ')  }.codevault/config.json`);
    });
}