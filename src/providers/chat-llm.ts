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
      const completion = await this.openai!.chat.completions.create({
        model: this.model,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        temperature,
        max_tokens: maxTokens
      });
      
      return completion.choices[0]?.message?.content || '';
    });
  }

  async *generateStreamingCompletion(messages: ChatMessage[], options: ChatCompletionOptions = {}): AsyncGenerator<string> {
    await this.init();
    
    const temperature = options.temperature ?? parseFloat(process.env.CODEVAULT_CHAT_TEMPERATURE || '0.7');
    const maxTokens = options.maxTokens ?? parseInt(process.env.CODEVAULT_CHAT_MAX_TOKENS || '4096', 10);
    
    const stream = await this.openai!.chat.completions.create({
      model: this.model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      temperature,
      max_tokens: maxTokens,
      stream: true
    });
    
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
}

export class OllamaChatProvider extends ChatLLMProvider {
  private ollama: any = null;
  private model: string;
  rateLimiter: any;

  constructor(model = process.env.CODEVAULT_OLLAMA_CHAT_MODEL || 'llama3.1') {
    super();
    this.model = model;
    this.rateLimiter = createRateLimiter('Ollama-Chat');
  }

  async init(): Promise<void> {
    if (!this.ollama) {
      try {
        const ollama = await import('ollama');
        this.ollama = ollama.default;
      } catch (error) {
        throw new Error('Ollama is not installed. Run: npm install ollama');
      }
    }
  }

  async generateCompletion(messages: ChatMessage[], options: ChatCompletionOptions = {}): Promise<string> {
    await this.init();
    
    const temperature = options.temperature ?? parseFloat(process.env.CODEVAULT_CHAT_TEMPERATURE || '0.7');
    
    return await this.rateLimiter.execute(async () => {
      const response = await this.ollama.chat({
        model: this.model,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        options: {
          temperature
        }
      });
      
      return response.message?.content || '';
    });
  }

  async *generateStreamingCompletion(messages: ChatMessage[], options: ChatCompletionOptions = {}): AsyncGenerator<string> {
    await this.init();
    
    const temperature = options.temperature ?? parseFloat(process.env.CODEVAULT_CHAT_TEMPERATURE || '0.7');
    
    const stream = await this.ollama.chat({
      model: this.model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      options: {
        temperature
      },
      stream: true
    });
    
    for await (const chunk of stream) {
      if (chunk.message?.content) {
        yield chunk.message.content;
      }
    }
  }

  getName(): string {
    return 'Ollama-Chat';
  }
  
  getModelName(): string {
    return this.model;
  }
}

export function createChatLLMProvider(providerName = 'auto'): ChatLLMProvider {
  switch (providerName.toLowerCase()) {
    case 'openai':
      return new OpenAIChatProvider();
    case 'ollama':
      return new OllamaChatProvider();
    case 'auto':
    default:
      // Check for chat API keys (including custom endpoints like OpenRouter, Nebius)
      if (process.env.CODEVAULT_CHAT_API_KEY || process.env.OPENAI_API_KEY) {
        return new OpenAIChatProvider();
      } else {
        return new OllamaChatProvider();
      }
  }
}