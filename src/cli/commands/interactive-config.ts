import chalk from 'chalk';
import { stdin as input, stdout as output } from 'process';
import * as readline from 'readline/promises';
import { saveGlobalConfig, hasGlobalConfig } from '../../config/loader.js';
import type { CodevaultConfig } from '../../config/types.js';

interface PromptOptions {
  message: string;
  default?: string;
  validate?: (value: string) => boolean | string;
  type?: 'text' | 'password' | 'confirm' | 'select';
  choices?: Array<{ title: string; value: string; description?: string }>;
}

class InteractivePrompt {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({ input, output });
  }

  async text(options: PromptOptions): Promise<string> {
    const defaultText = options.default ? chalk.gray(` (${options.default})`) : '';
    const prompt = `${chalk.cyan('?')} ${options.message}${defaultText}: `;
    
    while (true) {
      const answer = await this.rl.question(prompt);
      const value = answer.trim() || options.default || '';
      
      if (options.validate) {
        const result = options.validate(value);
        if (result === true) {
          return value;
        } else if (typeof result === 'string') {
          console.log(chalk.red(`  ✗ ${result}`));
          continue;
        }
      }
      
      return value;
    }
  }

  async password(options: PromptOptions): Promise<string> {
    // Simple password input (shown as text, but labeled as sensitive)
    const prompt = `${chalk.cyan('?')} ${options.message} ${chalk.gray('(input hidden)')}: `;
    const answer = await this.rl.question(prompt);
    return answer.trim();
  }

  async confirm(options: PromptOptions): Promise<boolean> {
    const defaultText = options.default === 'y' ? 'Y/n' : 'y/N';
    const prompt = `${chalk.cyan('?')} ${options.message} ${chalk.gray(`(${defaultText})`)}: `;
    
    const answer = await this.rl.question(prompt);
    const value = answer.trim().toLowerCase() || options.default || 'n';
    
    return value === 'y' || value === 'yes';
  }

  async select(options: PromptOptions): Promise<string> {
    if (!options.choices || options.choices.length === 0) {
      throw new Error('Choices required for select prompt');
    }

    console.log(`${chalk.cyan('?')  } ${  options.message}`);
    
    options.choices.forEach((choice, index) => {
      const number = chalk.gray(`${index + 1}.`);
      const description = choice.description ? chalk.gray(` - ${choice.description}`) : '';
      console.log(`  ${number} ${choice.title}${description}`);
    });
    
    while (true) {
      const prompt = chalk.gray(`  Select (1-${options.choices.length}): `);
      const answer = await this.rl.question(prompt);
      const num = parseInt(answer.trim(), 10);
      
      if (num >= 1 && num <= options.choices.length) {
        return options.choices[num - 1].value;
      }
      
      console.log(chalk.red(`  ✗ Please enter a number between 1 and ${options.choices.length}`));
    }
  }

  close() {
    this.rl.close();
  }
}

export async function runInteractiveConfig(force: boolean = false): Promise<void> {
  const prompt = new InteractivePrompt();

  try {
    console.log(chalk.bold.cyan('\n🚀 CodeVault Interactive Configuration\n'));

    // Check if config exists
    if (hasGlobalConfig() && !force) {
      console.log(chalk.yellow('⚠️  Global configuration already exists.\n'));
      const overwrite = await prompt.confirm({
        message: 'Do you want to overwrite it?',
        default: 'n'
      });
      
      if (!overwrite) {
        console.log(chalk.gray('\nConfiguration unchanged.'));
        prompt.close();
        return;
      }
      console.log('');
    }

    const config: CodevaultConfig = {
      providers: {}
    };

    // Provider selection
    const provider = await prompt.select({
      message: 'Choose your embedding provider',
      choices: [
        { title: 'OpenAI', value: 'openai', description: 'Cloud API, requires API key, best quality' },
        { title: 'Custom OpenAI-compatible', value: 'custom', description: 'Ollama, Nebius, or other OpenAI-compatible API' }
      ]
    });

    config.defaultProvider = 'openai';

    // OpenAI / Custom configuration
    if (provider === 'openai' || provider === 'custom') {
      console.log(chalk.bold('\n📝 OpenAI Configuration\n'));
      
      config.providers!.openai = {};

      // API Key
      const apiKey = await prompt.password({
        message: 'API Key',
        validate: (val) => val.length > 0 || 'API key is required'
      });
      config.providers!.openai.apiKey = apiKey;

      // Base URL (for custom providers)
      if (provider === 'custom') {
        const baseUrl = await prompt.text({
          message: 'Base URL',
          default: 'https://api.openai.com/v1',
          validate: (val) => {
            try {
              new URL(val);
              return true;
            } catch {
              return 'Invalid URL format';
            }
          }
        });
        config.providers!.openai.baseUrl = baseUrl;
      }

      // Model selection
      const useCustomModel = await prompt.confirm({
        message: 'Use custom model name?',
        default: 'n'
      });

      if (useCustomModel) {
        const customModel = await prompt.text({
          message: 'Model name',
          default: 'text-embedding-3-large',
          validate: (val) => val.length > 0 || 'Model name is required'
        });
        config.providers!.openai.model = customModel;
      } else {
        const model = await prompt.select({
          message: 'Select model',
          choices: [
            { title: 'text-embedding-3-large', value: 'text-embedding-3-large', description: '3072 dims, best quality' },
            { title: 'text-embedding-3-small', value: 'text-embedding-3-small', description: '1536 dims, faster/cheaper' },
            { title: 'text-embedding-ada-002', value: 'text-embedding-ada-002', description: '1536 dims, legacy' },
            { title: 'Qwen/Qwen3-Embedding-8B', value: 'Qwen/Qwen3-Embedding-8B', description: '4096 dims, via Nebius' }
          ]
        });
        config.providers!.openai.model = model;
      }

      // Dimensions
      const useCustomDims = await prompt.confirm({
        message: 'Custom embedding dimensions?',
        default: 'n'
      });

      if (useCustomDims) {
        const dims = await prompt.text({
          message: 'Embedding dimensions',
          default: '3072',
          validate: (val) => {
            const num = parseInt(val, 10);
            return (num > 0 && num <= 10000) || 'Must be between 1 and 10000';
          }
        });
        config.providers!.openai.dimensions = parseInt(dims, 10);
      }
    }



    // Advanced settings
    console.log(chalk.bold('\n⚙️  Advanced Settings\n'));
    
    const configAdvanced = await prompt.confirm({
      message: 'Configure advanced settings? (rate limits, tokens, etc.)',
      default: 'n'
    });

    if (configAdvanced) {
      // Max tokens
      const maxTokens = await prompt.text({
        message: 'Max tokens per chunk',
        default: '8192',
        validate: (val) => {
          const num = parseInt(val, 10);
          return (num > 0) || 'Must be a positive number';
        }
      });
      config.maxTokens = parseInt(maxTokens, 10);

      // Rate limiting
      const configRateLimit = await prompt.confirm({
        message: 'Configure rate limiting?',
        default: 'n'
      });

      if (configRateLimit) {
        config.rateLimit = {};

        const rpm = await prompt.text({
          message: 'Requests per minute (RPM)',
          default: '10000',
          validate: (val) => {
            const num = parseInt(val, 10);
            return (num > 0) || 'Must be a positive number';
          }
        });
        config.rateLimit.rpm = parseInt(rpm, 10);

        const tpm = await prompt.text({
          message: 'Tokens per minute (TPM)',
          default: '600000',
          validate: (val) => {
            const num = parseInt(val, 10);
            return (num > 0) || 'Must be a positive number';
          }
        });
        config.rateLimit.tpm = parseInt(tpm, 10);
      }

      // Encryption
      const configEncryption = await prompt.confirm({
        message: 'Enable code chunk encryption?',
        default: 'n'
      });

      if (configEncryption) {
        config.encryption = { enabled: true };
        
        const encKey = await prompt.password({
          message: 'Encryption key (32-byte base64 or hex)',
          validate: (val) => val.length > 0 || 'Encryption key is required'
        });
        config.encryption.key = encKey;
      }

      // Reranking
      const configReranker = await prompt.confirm({
        message: 'Configure API reranker?',
        default: 'n'
      });

      if (configReranker) {
        config.reranker = {};

        const apiUrl = await prompt.text({
          message: 'Reranker API URL',
          validate: (val) => {
            try {
              new URL(val);
              return true;
            } catch {
              return 'Invalid URL format';
            }
          }
        });
        config.reranker.apiUrl = apiUrl;

        const apiKey = await prompt.password({
          message: 'Reranker API Key'
        });
        if (apiKey) {
          config.reranker.apiKey = apiKey;
        }

        const model = await prompt.text({
          message: 'Reranker model name',
          default: 'rerank-v3.5'
        });
        if (model) {
          config.reranker.model = model;
        }
      }
    }

    // Save configuration
    console.log('');
    saveGlobalConfig(config);

    console.log(chalk.green('\n✓ Configuration saved successfully!\n'));
    console.log(chalk.gray('Location: ~/.codevault/config.json\n'));
    console.log('Next steps:');
    console.log(chalk.cyan('  codevault index') + chalk.gray(' - Index your project'));
    console.log(chalk.cyan('  codevault config list') + chalk.gray(' - View your configuration'));
    console.log('');

  } catch (error) {
    console.error(chalk.red('\n✗ Error:'), (error as Error).message);
    process.exit(1);
  } finally {
    prompt.close();
  }
}