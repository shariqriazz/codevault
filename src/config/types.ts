export interface ProviderConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  dimensions?: number;
}

export interface RateLimitConfig {
  rpm?: number;
  tpm?: number;
}

export interface EncryptionConfig {
  enabled?: boolean;
  key?: string;
}

export interface ChatLLMConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface CodevaultConfig {
  defaultProvider?: string;
  providers?: {
    openai?: ProviderConfig;
    ollama?: ProviderConfig;
  };
  chatLLM?: {
    openai?: ChatLLMConfig;
    ollama?: ChatLLMConfig;
  };
  rateLimit?: RateLimitConfig;
  encryption?: EncryptionConfig;
  maxTokens?: number;
  reranker?: {
    apiUrl?: string;
    apiKey?: string;
    model?: string;
    maxCandidates?: number;
    maxTokens?: number;
  };
}

export interface ConfigSource {
  global: CodevaultConfig | null;
  project: CodevaultConfig | null;
  env: CodevaultConfig;
}