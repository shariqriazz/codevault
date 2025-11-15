import fs from 'fs';
import path from 'path';
import os from 'os';
import type { CodevaultConfig, ConfigSource } from './types.js';
import { log } from '../utils/logger.js';

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.codevault');
const GLOBAL_CONFIG_FILE = path.join(GLOBAL_CONFIG_DIR, 'config.json');
const PROJECT_CONFIG_FILE = '.codevault/config.json';

/**
 * Read global configuration from ~/.codevault/config.json
 * @readonly Never modifies files
 */
export function readGlobalConfig(): CodevaultConfig | null {
  try {
    if (!fs.existsSync(GLOBAL_CONFIG_FILE)) {
      return null;
    }
    const content = fs.readFileSync(GLOBAL_CONFIG_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    log.warn('Failed to read global config', { error, path: GLOBAL_CONFIG_FILE });
    return null;
  }
}

/**
 * Read project-local configuration from .codevault/config.json
 * @readonly Never modifies files
 */
export function readProjectConfig(basePath = '.'): CodevaultConfig | null {
  try {
    const configPath = path.join(path.resolve(basePath), PROJECT_CONFIG_FILE);
    if (!fs.existsSync(configPath)) {
      return null;
    }
    const content = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    const configPath = path.join(path.resolve(basePath), PROJECT_CONFIG_FILE);
    log.warn('Failed to read project config', { error, path: configPath, basePath });
    return null;
  }
}

/**
 * Read configuration from environment variables
 * @readonly Never modifies files or environment
 */
export function readEnvConfig(): CodevaultConfig {
  const config: CodevaultConfig = {};

  // Provider settings - New variables with backward compatibility
  if (process.env.CODEVAULT_EMBEDDING_API_KEY || process.env.OPENAI_API_KEY) {
    config.providers = config.providers || {};
    config.providers.openai = config.providers.openai || {};
    config.providers.openai.apiKey = process.env.CODEVAULT_EMBEDDING_API_KEY || process.env.OPENAI_API_KEY;
  }

  if (process.env.CODEVAULT_EMBEDDING_BASE_URL || process.env.OPENAI_BASE_URL) {
    config.providers = config.providers || {};
    config.providers.openai = config.providers.openai || {};
    config.providers.openai.baseUrl = process.env.CODEVAULT_EMBEDDING_BASE_URL || process.env.OPENAI_BASE_URL;
  }

  if (process.env.CODEVAULT_EMBEDDING_MODEL || process.env.CODEVAULT_OPENAI_EMBEDDING_MODEL || process.env.OPENAI_MODEL) {
    config.providers = config.providers || {};
    config.providers.openai = config.providers.openai || {};
    config.providers.openai.model = process.env.CODEVAULT_EMBEDDING_MODEL || process.env.CODEVAULT_OPENAI_EMBEDDING_MODEL || process.env.OPENAI_MODEL;
  }

  // Dimensions - New variable with backward compatibility
  if (process.env.CODEVAULT_EMBEDDING_DIMENSIONS || process.env.CODEVAULT_DIMENSIONS) {
    const dims = parseInt(process.env.CODEVAULT_EMBEDDING_DIMENSIONS || process.env.CODEVAULT_DIMENSIONS || '0', 10);
    if (!isNaN(dims) && dims > 0) {
      if (config.providers?.openai) {
        config.providers.openai.dimensions = dims;
      }
    }
  }

  // Max tokens - New variable with backward compatibility
  if (process.env.CODEVAULT_EMBEDDING_MAX_TOKENS || process.env.CODEVAULT_MAX_TOKENS) {
    const tokens = parseInt(process.env.CODEVAULT_EMBEDDING_MAX_TOKENS || process.env.CODEVAULT_MAX_TOKENS || '0', 10);
    if (!isNaN(tokens) && tokens > 0) {
      config.maxTokens = tokens;
    }
  }

  // Rate limiting - New variables with backward compatibility
  if (process.env.CODEVAULT_EMBEDDING_RATE_LIMIT_RPM || process.env.CODEVAULT_RATE_LIMIT_RPM || process.env.CODEVAULT_RATE_LIMIT) {
    const rpm = parseInt(process.env.CODEVAULT_EMBEDDING_RATE_LIMIT_RPM || process.env.CODEVAULT_RATE_LIMIT_RPM || process.env.CODEVAULT_RATE_LIMIT || '0', 10);
    if (!isNaN(rpm) && rpm > 0) {
      config.rateLimit = config.rateLimit || {};
      config.rateLimit.rpm = rpm;
    }
  }

  if (process.env.CODEVAULT_EMBEDDING_RATE_LIMIT_TPM || process.env.CODEVAULT_RATE_LIMIT_TPM) {
    const tpm = parseInt(process.env.CODEVAULT_EMBEDDING_RATE_LIMIT_TPM || process.env.CODEVAULT_RATE_LIMIT_TPM || '0', 10);
    if (!isNaN(tpm) && tpm > 0) {
      config.rateLimit = config.rateLimit || {};
      config.rateLimit.tpm = tpm;
    }
  }

  // Encryption
  if (process.env.CODEVAULT_ENCRYPTION_KEY) {
    config.encryption = config.encryption || {};
    config.encryption.key = process.env.CODEVAULT_ENCRYPTION_KEY;
    config.encryption.enabled = true;
  }

  // Reranker
  if (process.env.CODEVAULT_RERANK_API_URL) {
    config.reranker = config.reranker || {};
    config.reranker.apiUrl = process.env.CODEVAULT_RERANK_API_URL;
  }

  if (process.env.CODEVAULT_RERANK_API_KEY) {
    config.reranker = config.reranker || {};
    config.reranker.apiKey = process.env.CODEVAULT_RERANK_API_KEY;
  }

  if (process.env.CODEVAULT_RERANK_MODEL) {
    config.reranker = config.reranker || {};
    config.reranker.model = process.env.CODEVAULT_RERANK_MODEL;
  }

  // Chat LLM Configuration
  if (process.env.CODEVAULT_CHAT_API_KEY || process.env.OPENAI_API_KEY) {
    config.chatLLM = config.chatLLM || {};
    config.chatLLM.openai = config.chatLLM.openai || {};
    config.chatLLM.openai.apiKey = process.env.CODEVAULT_CHAT_API_KEY || process.env.OPENAI_API_KEY;
  }

  if (process.env.CODEVAULT_CHAT_BASE_URL || process.env.OPENAI_BASE_URL) {
    config.chatLLM = config.chatLLM || {};
    config.chatLLM.openai = config.chatLLM.openai || {};
    config.chatLLM.openai.baseUrl = process.env.CODEVAULT_CHAT_BASE_URL || process.env.OPENAI_BASE_URL;
  }

  if (process.env.CODEVAULT_CHAT_MODEL || process.env.CODEVAULT_OPENAI_CHAT_MODEL) {
    config.chatLLM = config.chatLLM || {};
    config.chatLLM.openai = config.chatLLM.openai || {};
    config.chatLLM.openai.model = process.env.CODEVAULT_CHAT_MODEL || process.env.CODEVAULT_OPENAI_CHAT_MODEL;
  }

  if (process.env.CODEVAULT_CHAT_MAX_TOKENS) {
    const maxTokens = parseInt(process.env.CODEVAULT_CHAT_MAX_TOKENS, 10);
    if (!isNaN(maxTokens) && maxTokens > 0) {
      config.chatLLM = config.chatLLM || {};
      config.chatLLM.openai = config.chatLLM.openai || {};
      // Cap at 32K to prevent unreasonable values
      config.chatLLM.openai.maxTokens = Math.min(maxTokens, 64000);
    }
  }

  if (process.env.CODEVAULT_CHAT_TEMPERATURE) {
    const temperature = parseFloat(process.env.CODEVAULT_CHAT_TEMPERATURE);
    if (!isNaN(temperature)) {
      config.chatLLM = config.chatLLM || {};
      config.chatLLM.openai = config.chatLLM.openai || {};
      config.chatLLM.openai.temperature = temperature;
    }
  }



  return config;
}

/**
 * Deep merge configuration objects
 * Later configs override earlier ones
 */
function deepMerge(...configs: (CodevaultConfig | null)[]): CodevaultConfig {
  const result: CodevaultConfig = {};

  for (const config of configs) {
    if (!config) continue;

    if (config.defaultProvider) {
      result.defaultProvider = config.defaultProvider;
    }

    if (config.maxTokens) {
      result.maxTokens = config.maxTokens;
    }

    if (config.providers) {
      result.providers = result.providers || {};
      
      if (config.providers.openai) {
        result.providers.openai = {
          ...result.providers.openai,
          ...config.providers.openai
        };
      }


    }

    if (config.rateLimit) {
      result.rateLimit = {
        ...result.rateLimit,
        ...config.rateLimit
      };
    }

    if (config.encryption) {
      result.encryption = {
        ...result.encryption,
        ...config.encryption
      };
    }

    if (config.reranker) {
      result.reranker = {
        ...result.reranker,
        ...config.reranker
      };
    }

    if (config.chatLLM) {
      result.chatLLM = result.chatLLM || {};
      
      if (config.chatLLM.openai) {
        result.chatLLM.openai = {
          ...result.chatLLM.openai,
          ...config.chatLLM.openai
        };

        // Validate and cap maxTokens at 32K to prevent unreasonable values
        if (result.chatLLM.openai.maxTokens && result.chatLLM.openai.maxTokens > 64000) {
          console.warn(`⚠️  Warning: chatLLM.openai.maxTokens (${result.chatLLM.openai.maxTokens}) exceeds recommended maximum. Capping at 32,000 tokens.`);
          result.chatLLM.openai.maxTokens = 64000;
        }
      }


    }
  }

  return result;
}

/**
 * Load merged configuration from all sources
 * Priority: env > project > global
 * 
 * @readonly Never modifies config files
 * @param basePath Project path for project-local config
 * @returns Merged configuration (in-memory only)
 */
export function loadConfig(basePath = '.'): CodevaultConfig {
  const global = readGlobalConfig();
  const project = readProjectConfig(basePath);
  const env = readEnvConfig();

  // Merge with priority: env overrides project overrides global
  return deepMerge(global, project, env);
}

/**
 * Get configuration sources for debugging
 * @readonly Never modifies files
 */
export function getConfigSources(basePath = '.'): ConfigSource {
  return {
    global: readGlobalConfig(),
    project: readProjectConfig(basePath),
    env: readEnvConfig()
  };
}

/**
 * Write global configuration (CLI only)
 * This is the ONLY function that writes to disk
 */
export function saveGlobalConfig(config: CodevaultConfig): void {
  // Ensure directory exists
  if (!fs.existsSync(GLOBAL_CONFIG_DIR)) {
    fs.mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
  }

  // Write config
  fs.writeFileSync(GLOBAL_CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Write project-local configuration (CLI only)
 * This is the ONLY function that writes project config
 */
export function saveProjectConfig(config: CodevaultConfig, basePath = '.'): void {
  const configDir = path.join(path.resolve(basePath), '.codevault');
  const configPath = path.join(configDir, 'config.json');

  // Ensure directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Write config
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Check if global config exists
 */
export function hasGlobalConfig(): boolean {
  return fs.existsSync(GLOBAL_CONFIG_FILE);
}

/**
 * Check if project config exists
 */
export function hasProjectConfig(basePath = '.'): boolean {
  const configPath = path.join(path.resolve(basePath), PROJECT_CONFIG_FILE);
  return fs.existsSync(configPath);
}

/**
 * Get global config file path
 */
export function getGlobalConfigPath(): string {
  return GLOBAL_CONFIG_FILE;
}

/**
 * Get project config file path
 */
export function getProjectConfigPath(basePath = '.'): string {
  return path.join(path.resolve(basePath), PROJECT_CONFIG_FILE);
}