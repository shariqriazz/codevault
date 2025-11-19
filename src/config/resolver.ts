import { loadConfig } from './loader.js';

export interface EmbeddingOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  dimensions?: number;
  maxTokens?: number;
  rpm?: number | null;
  tpm?: number | null;
}

export interface ChatOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface RerankerOptions {
  apiUrl?: string;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  maxCandidates?: number;
}

export interface ProviderContext {
  embedding: EmbeddingOptions;
  chat: ChatOptions;
  reranker: RerankerOptions;
}

export function resolveProviderContext(basePath = '.'): ProviderContext {
  const config = loadConfig(basePath);

  const embedding: EmbeddingOptions = {
    apiKey: config.providers?.openai?.apiKey,
    baseUrl: config.providers?.openai?.baseUrl,
    model: config.providers?.openai?.model,
    dimensions: config.providers?.openai?.dimensions,
    maxTokens: config.maxTokens,
    rpm: config.rateLimit?.rpm ?? null,
    tpm: config.rateLimit?.tpm ?? null
  };

  const chat: ChatOptions = {
    apiKey: config.chatLLM?.openai?.apiKey,
    baseUrl: config.chatLLM?.openai?.baseUrl,
    model: config.chatLLM?.openai?.model,
    maxTokens: config.chatLLM?.openai?.maxTokens,
    temperature: config.chatLLM?.openai?.temperature
  };

  const reranker: RerankerOptions = {
    apiUrl: config.reranker?.apiUrl,
    apiKey: config.reranker?.apiKey,
    model: config.reranker?.model,
    maxCandidates: config.reranker?.maxCandidates,
    maxTokens: config.reranker?.maxTokens
  };

  return { embedding, chat, reranker };
}
