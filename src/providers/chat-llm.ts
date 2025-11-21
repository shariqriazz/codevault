import { OpenAI } from 'openai';
import { createRateLimiter, type RateLimiter } from '../utils/rate-limiter.js';
import type { ChatOptions } from '../config/resolver.js';
import type { ProviderRoutingConfig } from '../config/types.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export abstract class ChatLLMProvider {
  abstract generateCompletion(messages: ChatMessage[], options?: ChatCompletionOptions): Promise<string>;
  abstract generateStreamingCompletion(messages: ChatMessage[], options?: ChatCompletionOptions): AsyncGenerator<string>;
  abstract getName(): string;
  abstract getModelName?(): string;
  abstract init?(): Promise<void>;

  rateLimiter?: RateLimiter;
}

export class OpenAIChatProvider extends ChatLLMProvider {
  private openai: OpenAI | null = null;
  private model: string;
  private apiKey?: string;
  private baseUrl?: string;
  private maxTokensOverride?: number;
  private temperatureOverride?: number;
  private routingConfig?: ProviderRoutingConfig;
  rateLimiter: RateLimiter;

  constructor(options: ChatOptions = {}) {
    super();
    this.model = options.model
                 || process.env.CODEVAULT_CHAT_MODEL
                 || process.env.CODEVAULT_OPENAI_CHAT_MODEL // Backward compatibility
                 || 'gpt-4o';
    this.apiKey = options.apiKey || process.env.CODEVAULT_CHAT_API_KEY || process.env.OPENAI_API_KEY;
    this.baseUrl = options.baseUrl || process.env.CODEVAULT_CHAT_BASE_URL || process.env.OPENAI_BASE_URL;
    this.maxTokensOverride = options.maxTokens;
    this.temperatureOverride = options.temperature;
    this.routingConfig = options.routing;
    // Use 'OpenAI' to match rate limiter defaults (rpm: 50)
    this.rateLimiter = createRateLimiter('OpenAI');
  }

  async init(): Promise<void> {
    if (!this.openai) {
      const config: any = {};
      
      if (this.apiKey) {
        config.apiKey = this.apiKey;
      }
      
      if (this.baseUrl) {
        config.baseURL = this.baseUrl;
      }
      
      this.openai = new OpenAI(config);
    }
  }

  async generateCompletion(messages: ChatMessage[], options: ChatCompletionOptions = {}): Promise<string> {
    await this.init();

    const temperature = options.temperature
      ?? this.temperatureOverride
      ?? parseFloat(process.env.CODEVAULT_CHAT_TEMPERATURE || '0.7');
    const maxTokens = options.maxTokens
      ?? this.maxTokensOverride
      ?? parseInt(process.env.CODEVAULT_CHAT_MAX_TOKENS || '256000', 10);

    return await this.rateLimiter.execute(async (): Promise<string> => {
      const requestBody: any = {
        model: this.model,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        temperature,
        max_tokens: maxTokens
      };

      // Add provider routing for OpenRouter if configured
      if (this.routingConfig && this.isOpenRouter()) {
        requestBody.provider = this.routingConfig;
      }

      const completion = await this.openai!.chat.completions.create(requestBody);

      return completion.choices[0]?.message?.content || '';
    }) as Promise<string>;
  }

  private isOpenRouter(): boolean {
    return this.baseUrl?.includes('openrouter.ai') ?? false;
  }

  async *generateStreamingCompletion(messages: ChatMessage[], options: ChatCompletionOptions = {}): AsyncGenerator<string> {
    await this.init();

    const temperature = options.temperature ?? parseFloat(process.env.CODEVAULT_CHAT_TEMPERATURE || '0.7');
    const maxTokens = options.maxTokens ?? parseInt(process.env.CODEVAULT_CHAT_MAX_TOKENS || '256000', 10);

    // Apply rate limiting to streaming requests to prevent overwhelming the provider
    await this.rateLimiter.execute(async () => Promise.resolve(), 0, 0);

    const requestBody: any = {
      model: this.model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      temperature,
      max_tokens: maxTokens,
      stream: true as const
    };

    // Add provider routing for OpenRouter if configured
    if (this.routingConfig && this.isOpenRouter()) {
      requestBody.provider = this.routingConfig;
    }

    const stream = await this.openai!.chat.completions.create(requestBody);

    for await (const chunk of stream as any) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }

  getName(): string {
    return 'OpenAI-Chat';
  }
  
  getModelName(): string {
    return this.model;
  }
}

export function createChatLLMProvider(providerName = 'auto', options: ChatOptions = {}): ChatLLMProvider {
  switch (providerName.toLowerCase()) {
    case 'openai':
    case 'auto':
    default:
      return new OpenAIChatProvider(options);
  }
}
