import { loadConfig } from './loader.js';
import type { CodevaultConfig } from './types.js';

/**
 * Apply configuration to process.env for backward compatibility
 * This allows existing code to work without changes
 * 
 * @readonly Only reads config, modifies process.env (ephemeral)
 * @param basePath Project path for loading config
 */
export function applyConfigToEnv(basePath = '.'): void {
  const config = loadConfig(basePath);
  
  // Only set env vars if they're not already set (env vars have priority)
  
  // OpenAI provider
  if (config.providers?.openai) {
    if (!process.env.OPENAI_API_KEY && config.providers.openai.apiKey) {
      process.env.OPENAI_API_KEY = config.providers.openai.apiKey;
    }
    
    if (!process.env.OPENAI_BASE_URL && config.providers.openai.baseUrl) {
      process.env.OPENAI_BASE_URL = config.providers.openai.baseUrl;
    }
    
    if (!process.env.CODEVAULT_OPENAI_EMBEDDING_MODEL && config.providers.openai.model) {
      process.env.CODEVAULT_OPENAI_EMBEDDING_MODEL = config.providers.openai.model;
    }
    
    if (!process.env.CODEVAULT_DIMENSIONS && config.providers.openai.dimensions) {
      process.env.CODEVAULT_DIMENSIONS = String(config.providers.openai.dimensions);
    }
  }
  
  // Ollama provider
  if (config.providers?.ollama) {
    if (!process.env.CODEVAULT_OLLAMA_MODEL && config.providers.ollama.model) {
      process.env.CODEVAULT_OLLAMA_MODEL = config.providers.ollama.model;
    }
    
    if (!process.env.CODEVAULT_DIMENSIONS && config.providers.ollama.dimensions) {
      process.env.CODEVAULT_DIMENSIONS = String(config.providers.ollama.dimensions);
    }
  }
  
  // Max tokens
  if (!process.env.CODEVAULT_MAX_TOKENS && config.maxTokens) {
    process.env.CODEVAULT_MAX_TOKENS = String(config.maxTokens);
  }
  
  // Rate limiting
  if (config.rateLimit) {
    if (!process.env.CODEVAULT_RATE_LIMIT_RPM && config.rateLimit.rpm) {
      process.env.CODEVAULT_RATE_LIMIT_RPM = String(config.rateLimit.rpm);
    }
    
    if (!process.env.CODEVAULT_RATE_LIMIT_TPM && config.rateLimit.tpm) {
      process.env.CODEVAULT_RATE_LIMIT_TPM = String(config.rateLimit.tpm);
    }
  }
  
  // Encryption
  if (config.encryption) {
    if (!process.env.CODEVAULT_ENCRYPTION_KEY && config.encryption.key) {
      process.env.CODEVAULT_ENCRYPTION_KEY = config.encryption.key;
    }
  }
  
  // Reranker
  if (config.reranker) {
    if (!process.env.CODEVAULT_RERANK_API_URL && config.reranker.apiUrl) {
      process.env.CODEVAULT_RERANK_API_URL = config.reranker.apiUrl;
    }
    
    if (!process.env.CODEVAULT_RERANK_API_KEY && config.reranker.apiKey) {
      process.env.CODEVAULT_RERANK_API_KEY = config.reranker.apiKey;
    }
    
    if (!process.env.CODEVAULT_RERANK_MODEL && config.reranker.model) {
      process.env.CODEVAULT_RERANK_MODEL = config.reranker.model;
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