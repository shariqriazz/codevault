export interface ProviderRoutingConfig {
  order?: string[];
  allowFallbacks?: boolean;
  requireParameters?: boolean;
  dataCollection?: 'allow' | 'deny';
  zdr?: boolean;
  only?: string[];
  ignore?: string[];
  quantizations?: string[];
  sort?: 'price' | 'throughput' | 'latency';
}

export interface ProviderConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  dimensions?: number;
  providerRouting?: ProviderRoutingConfig;
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
  providerRouting?: ProviderRoutingConfig;
}

export interface CodevaultConfig {
  defaultProvider?: string;
  providers?: {
    openai?: ProviderConfig;
  };
  chatLLM?: {
    openai?: ChatLLMConfig;
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
    providerRouting?: ProviderRoutingConfig;
  };
}

export interface ConfigSource {
  global: CodevaultConfig | null;
  project: CodevaultConfig | null;
  env: CodevaultConfig;
}