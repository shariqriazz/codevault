import { OpenAI } from 'openai';
import { createRateLimiter } from '../utils/rate-limiter.js';

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
  
  rateLimiter?: any;
}

export class OpenAIChatProvider extends ChatLLMProvider {
  private openai: OpenAI | null = null;
  private model: string;
  rateLimiter: any;

  constructor() {
    super();
    this.model = process.env.CODEVAULT_CHAT_MODEL
                 || process.env.CODEVAULT_OPENAI_CHAT_MODEL // Backward compatibility
                 || 'gpt-4o';
    this.rateLimiter = createRateLimiter('OpenAI-Chat');
  }

  async init(): Promise<void> {
    if (!this.openai) {
      const config: any = {};
      
      if (process.env.CODEVAULT_CHAT_API_KEY || process.env.OPENAI_API_KEY) {
        config.apiKey = process.env.CODEVAULT_CHAT_API_KEY || process.env.OPENAI_API_KEY;
      }
      
      if (process.env.CODEVAULT_CHAT_BASE_URL || process.env.OPENAI_BASE_URL) {
        config.baseURL = process.env.CODEVAULT_CHAT_BASE_URL || process.env.OPENAI_BASE_URL;
      }
      
      this.openai = new OpenAI(config);
    }
  }

  async generateCompletion(messages: ChatMessage[], options: ChatCompletionOptions = {}): Promise<string> {
    await this.init();
    
    const temperature = options.temperature ?? parseFloat(process.env.CODEVAULT_CHAT_TEMPERATURE || '0.7');
    const maxTokens = options.maxTokens ?? parseInt(process.env.CODEVAULT_CHAT_MAX_TOKENS || '4096', 10);
    
    return await this.rateLimiter.execute(async () => {
      const requestBody: any = {
        model: this.model,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        temperature,
        max_tokens: maxTokens
      };

      // Add provider routing if configured (for OpenRouter)
      const providerRouting = this.getProviderRouting();
      if (providerRouting && Object.keys(providerRouting).length > 0) {
        requestBody.provider = providerRouting;
      }

      const completion = await this.openai!.chat.completions.create(requestBody);
      
      return completion.choices[0]?.message?.content || '';
    });
  }

  async *generateStreamingCompletion(messages: ChatMessage[], options: ChatCompletionOptions = {}): AsyncGenerator<string> {
    await this.init();
    
    const temperature = options.temperature ?? parseFloat(process.env.CODEVAULT_CHAT_TEMPERATURE || '0.7');
    const maxTokens = options.maxTokens ?? parseInt(process.env.CODEVAULT_CHAT_MAX_TOKENS || '4096', 10);
    
    const baseRequestBody = {
      model: this.model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      temperature,
      max_tokens: maxTokens,
      stream: true as const
    };

    // Add provider routing if configured (for OpenRouter)
    const providerRouting = this.getProviderRouting();
    const requestBody = providerRouting && Object.keys(providerRouting).length > 0
      ? { ...baseRequestBody, provider: providerRouting }
      : baseRequestBody;

    const stream = await this.openai!.chat.completions.create(requestBody);
    
    for await (const chunk of stream) {
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

  private getProviderRouting(): any {
    const routing: any = {};
    
    if (process.env.CODEVAULT_CHAT_PROVIDER_ORDER) {
      routing.order = process.env.CODEVAULT_CHAT_PROVIDER_ORDER.split(',').map(s => s.trim());
    }
    
    if (process.env.CODEVAULT_CHAT_PROVIDER_ALLOW_FALLBACKS !== undefined) {
      routing.allow_fallbacks = process.env.CODEVAULT_CHAT_PROVIDER_ALLOW_FALLBACKS === 'true';
    }
    
    if (process.env.CODEVAULT_CHAT_PROVIDER_ONLY) {
      routing.only = process.env.CODEVAULT_CHAT_PROVIDER_ONLY.split(',').map(s => s.trim());
    }
    
    if (process.env.CODEVAULT_CHAT_PROVIDER_IGNORE) {
      routing.ignore = process.env.CODEVAULT_CHAT_PROVIDER_IGNORE.split(',').map(s => s.trim());
    }
    
    return routing;
  }
}

export function createChatLLMProvider(providerName = 'auto'): ChatLLMProvider {
  switch (providerName.toLowerCase()) {
    case 'openai':
    case 'auto':
    default:
      return new OpenAIChatProvider();
  }
}