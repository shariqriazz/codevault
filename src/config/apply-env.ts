import { loadConfig } from './loader.js';
import type { CodevaultConfig } from './types.js';

/**
 * Apply configuration to process.env for backward compatibility
 * This allows existing code to work without changes
 * 
 * @readonly Only reads config, modifies process.env (ephemeral)
 * @param basePath Project path for loading config
 */
export interface EnvOverrides {
  [key: string]: string;
}

export function getConfigEnvOverrides(basePath = '.'): EnvOverrides {
  const config = loadConfig(basePath);
  const overrides: EnvOverrides = {};

  if (config.providers?.openai) {
    if (config.providers.openai.apiKey) {
      overrides.CODEVAULT_EMBEDDING_API_KEY = config.providers.openai.apiKey;
      overrides.OPENAI_API_KEY = config.providers.openai.apiKey;
    }

    if (config.providers.openai.baseUrl) {
      overrides.CODEVAULT_EMBEDDING_BASE_URL = config.providers.openai.baseUrl;
      overrides.OPENAI_BASE_URL = config.providers.openai.baseUrl;
    }

    if (config.providers.openai.model) {
      overrides.CODEVAULT_EMBEDDING_MODEL = config.providers.openai.model;
      overrides.CODEVAULT_OPENAI_EMBEDDING_MODEL = config.providers.openai.model;
    }

    if (config.providers.openai.dimensions) {
      overrides.CODEVAULT_EMBEDDING_DIMENSIONS = String(config.providers.openai.dimensions);
      overrides.CODEVAULT_DIMENSIONS = String(config.providers.openai.dimensions);
    }
  }

  if (config.maxTokens) {
    overrides.CODEVAULT_EMBEDDING_MAX_TOKENS = String(config.maxTokens);
    overrides.CODEVAULT_MAX_TOKENS = String(config.maxTokens);
  }

  if (config.rateLimit) {
    if (config.rateLimit.rpm) {
      overrides.CODEVAULT_EMBEDDING_RATE_LIMIT_RPM = String(config.rateLimit.rpm);
      overrides.CODEVAULT_RATE_LIMIT_RPM = String(config.rateLimit.rpm);
    }

    if (config.rateLimit.tpm) {
      overrides.CODEVAULT_EMBEDDING_RATE_LIMIT_TPM = String(config.rateLimit.tpm);
      overrides.CODEVAULT_RATE_LIMIT_TPM = String(config.rateLimit.tpm);
    }
  }

  if (config.encryption?.key) {
    overrides.CODEVAULT_ENCRYPTION_KEY = config.encryption.key;
  }

  if (config.reranker) {
    if (config.reranker.apiUrl) {
      overrides.CODEVAULT_RERANK_API_URL = config.reranker.apiUrl;
    }

    if (config.reranker.apiKey) {
      overrides.CODEVAULT_RERANK_API_KEY = config.reranker.apiKey;
    }

    if (config.reranker.model) {
      overrides.CODEVAULT_RERANK_MODEL = config.reranker.model;
    }
  }

  if (config.chatLLM?.openai) {
    if (config.chatLLM.openai.apiKey) {
      overrides.CODEVAULT_CHAT_API_KEY = config.chatLLM.openai.apiKey;
    }

    if (config.chatLLM.openai.baseUrl) {
      overrides.CODEVAULT_CHAT_BASE_URL = config.chatLLM.openai.baseUrl;
    }

    if (config.chatLLM.openai.model) {
      overrides.CODEVAULT_CHAT_MODEL = config.chatLLM.openai.model;
    }

    if (config.chatLLM.openai.maxTokens) {
      overrides.CODEVAULT_CHAT_MAX_TOKENS = String(config.chatLLM.openai.maxTokens);
    }

    if (config.chatLLM.openai.temperature !== undefined) {
      overrides.CODEVAULT_CHAT_TEMPERATURE = String(config.chatLLM.openai.temperature);
    }
  }

  return overrides;
}

/**
 * Apply configuration to process.env for backward compatibility.
 * This mutates environment only for variables not already set.
 */
export function applyConfigToEnv(basePath = '.'): void {
  const overrides = getConfigEnvOverrides(basePath);

  for (const [key, value] of Object.entries(overrides)) {
    if (typeof process.env[key] === 'undefined') {
      process.env[key] = value;
    }
  }
}

/**
 * Get effective configuration (for display purposes)
 * Shows what config is actually being used after merging
 */
export function getEffectiveConfig(basePath = '.'): CodevaultConfig {
  return loadConfig(basePath);
}
