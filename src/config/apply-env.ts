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
  
  // OpenAI provider - Set new variables with backward compatibility
  if (config.providers?.openai) {
    if (!process.env.CODEVAULT_EMBEDDING_API_KEY && !process.env.OPENAI_API_KEY && config.providers.openai.apiKey) {
      process.env.CODEVAULT_EMBEDDING_API_KEY = config.providers.openai.apiKey;
      process.env.OPENAI_API_KEY = config.providers.openai.apiKey; // Backward compatibility
    }
    
    if (!process.env.CODEVAULT_EMBEDDING_BASE_URL && !process.env.OPENAI_BASE_URL && config.providers.openai.baseUrl) {
      process.env.CODEVAULT_EMBEDDING_BASE_URL = config.providers.openai.baseUrl;
      process.env.OPENAI_BASE_URL = config.providers.openai.baseUrl; // Backward compatibility
    }
    
    if (!process.env.CODEVAULT_EMBEDDING_MODEL && !process.env.CODEVAULT_OPENAI_EMBEDDING_MODEL && config.providers.openai.model) {
      process.env.CODEVAULT_EMBEDDING_MODEL = config.providers.openai.model;
      process.env.CODEVAULT_OPENAI_EMBEDDING_MODEL = config.providers.openai.model; // Backward compatibility
    }
    
    if (!process.env.CODEVAULT_EMBEDDING_DIMENSIONS && !process.env.CODEVAULT_DIMENSIONS && config.providers.openai.dimensions) {
      process.env.CODEVAULT_EMBEDDING_DIMENSIONS = String(config.providers.openai.dimensions);
      process.env.CODEVAULT_DIMENSIONS = String(config.providers.openai.dimensions); // Backward compatibility
    }

    // Provider routing for embeddings
    if (config.providers.openai.providerRouting) {
      if (!process.env.CODEVAULT_EMBEDDING_PROVIDER_ORDER && config.providers.openai.providerRouting.order) {
        process.env.CODEVAULT_EMBEDDING_PROVIDER_ORDER = config.providers.openai.providerRouting.order.join(',');
      }
      if (process.env.CODEVAULT_EMBEDDING_PROVIDER_ALLOW_FALLBACKS === undefined && config.providers.openai.providerRouting.allowFallbacks !== undefined) {
        process.env.CODEVAULT_EMBEDDING_PROVIDER_ALLOW_FALLBACKS = String(config.providers.openai.providerRouting.allowFallbacks);
      }
      if (!process.env.CODEVAULT_EMBEDDING_PROVIDER_ONLY && config.providers.openai.providerRouting.only) {
        process.env.CODEVAULT_EMBEDDING_PROVIDER_ONLY = config.providers.openai.providerRouting.only.join(',');
      }
      if (!process.env.CODEVAULT_EMBEDDING_PROVIDER_IGNORE && config.providers.openai.providerRouting.ignore) {
        process.env.CODEVAULT_EMBEDDING_PROVIDER_IGNORE = config.providers.openai.providerRouting.ignore.join(',');
      }
    }
  }
  

  
  // Max tokens - Set new variable with backward compatibility
  if (!process.env.CODEVAULT_EMBEDDING_MAX_TOKENS && !process.env.CODEVAULT_MAX_TOKENS && config.maxTokens) {
    process.env.CODEVAULT_EMBEDDING_MAX_TOKENS = String(config.maxTokens);
    process.env.CODEVAULT_MAX_TOKENS = String(config.maxTokens); // Backward compatibility
  }
  
  // Rate limiting - Set new variables with backward compatibility
  if (config.rateLimit) {
    if (!process.env.CODEVAULT_EMBEDDING_RATE_LIMIT_RPM && !process.env.CODEVAULT_RATE_LIMIT_RPM && config.rateLimit.rpm) {
      process.env.CODEVAULT_EMBEDDING_RATE_LIMIT_RPM = String(config.rateLimit.rpm);
      process.env.CODEVAULT_RATE_LIMIT_RPM = String(config.rateLimit.rpm); // Backward compatibility
    }
    
    if (!process.env.CODEVAULT_EMBEDDING_RATE_LIMIT_TPM && !process.env.CODEVAULT_RATE_LIMIT_TPM && config.rateLimit.tpm) {
      process.env.CODEVAULT_EMBEDDING_RATE_LIMIT_TPM = String(config.rateLimit.tpm);
      process.env.CODEVAULT_RATE_LIMIT_TPM = String(config.rateLimit.tpm); // Backward compatibility
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
  
  // Chat LLM
  if (config.chatLLM?.openai) {
    if (!process.env.CODEVAULT_CHAT_API_KEY && config.chatLLM.openai.apiKey) {
      process.env.CODEVAULT_CHAT_API_KEY = config.chatLLM.openai.apiKey;
    }
    
    if (!process.env.CODEVAULT_CHAT_BASE_URL && config.chatLLM.openai.baseUrl) {
      process.env.CODEVAULT_CHAT_BASE_URL = config.chatLLM.openai.baseUrl;
    }
    
    if (!process.env.CODEVAULT_CHAT_MODEL && config.chatLLM.openai.model) {
      process.env.CODEVAULT_CHAT_MODEL = config.chatLLM.openai.model;
    }
    
    if (!process.env.CODEVAULT_CHAT_MAX_TOKENS && config.chatLLM.openai.maxTokens) {
      process.env.CODEVAULT_CHAT_MAX_TOKENS = String(config.chatLLM.openai.maxTokens);
    }
    
    if (!process.env.CODEVAULT_CHAT_TEMPERATURE && config.chatLLM.openai.temperature) {
      process.env.CODEVAULT_CHAT_TEMPERATURE = String(config.chatLLM.openai.temperature);
    }

    // Provider routing for chat LLM
    if (config.chatLLM.openai.providerRouting) {
      if (!process.env.CODEVAULT_CHAT_PROVIDER_ORDER && config.chatLLM.openai.providerRouting.order) {
        process.env.CODEVAULT_CHAT_PROVIDER_ORDER = config.chatLLM.openai.providerRouting.order.join(',');
      }
      if (process.env.CODEVAULT_CHAT_PROVIDER_ALLOW_FALLBACKS === undefined && config.chatLLM.openai.providerRouting.allowFallbacks !== undefined) {
        process.env.CODEVAULT_CHAT_PROVIDER_ALLOW_FALLBACKS = String(config.chatLLM.openai.providerRouting.allowFallbacks);
      }
      if (!process.env.CODEVAULT_CHAT_PROVIDER_ONLY && config.chatLLM.openai.providerRouting.only) {
        process.env.CODEVAULT_CHAT_PROVIDER_ONLY = config.chatLLM.openai.providerRouting.only.join(',');
      }
      if (!process.env.CODEVAULT_CHAT_PROVIDER_IGNORE && config.chatLLM.openai.providerRouting.ignore) {
        process.env.CODEVAULT_CHAT_PROVIDER_IGNORE = config.chatLLM.openai.providerRouting.ignore.join(',');
      }
    }
  }

  // Reranker provider routing
  if (config.reranker?.providerRouting) {
    if (!process.env.CODEVAULT_RERANK_PROVIDER_ORDER && config.reranker.providerRouting.order) {
      process.env.CODEVAULT_RERANK_PROVIDER_ORDER = config.reranker.providerRouting.order.join(',');
    }
    if (process.env.CODEVAULT_RERANK_PROVIDER_ALLOW_FALLBACKS === undefined && config.reranker.providerRouting.allowFallbacks !== undefined) {
      process.env.CODEVAULT_RERANK_PROVIDER_ALLOW_FALLBACKS = String(config.reranker.providerRouting.allowFallbacks);
    }
    if (!process.env.CODEVAULT_RERANK_PROVIDER_ONLY && config.reranker.providerRouting.only) {
      process.env.CODEVAULT_RERANK_PROVIDER_ONLY = config.reranker.providerRouting.only.join(',');
    }
    if (!process.env.CODEVAULT_RERANK_PROVIDER_IGNORE && config.reranker.providerRouting.ignore) {
      process.env.CODEVAULT_RERANK_PROVIDER_IGNORE = config.reranker.providerRouting.ignore.join(',');
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