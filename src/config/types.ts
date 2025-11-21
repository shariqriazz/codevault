export interface ProviderRoutingConfig {
  order?: string[];
  allow_fallbacks?: boolean;
  require_parameters?: boolean;
  data_collection?: 'allow' | 'deny';
  zdr?: boolean;
  enforce_distillable_text?: boolean;
  only?: string[];
  ignore?: string[];
  quantizations?: string[];
  sort?: 'price' | 'throughput' | 'latency';
  max_price?: {
    prompt?: number;
    completion?: number;
    request?: number;
    image?: number;
  };
}

export interface ProviderConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  dimensions?: number;
  routing?: ProviderRoutingConfig;
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
  routing?: ProviderRoutingConfig;
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
  };
}

export interface ConfigSource {
  global: CodevaultConfig | null;
  project: CodevaultConfig | null;
  env: CodevaultConfig;
}