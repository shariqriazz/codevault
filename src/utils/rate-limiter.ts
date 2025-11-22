interface TokenUsageEntry {
  time: number;
  tokens: number;
}

interface QueueItem<T> {
  fn: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (error: Error) => void;
  retryCount: number;
  estimatedTokens: number;
}

function extractTokensUsed(value: unknown): number {
  if (value && typeof value === 'object' && 'usage' in value) {
    const usage = (value as { usage?: unknown }).usage;
    if (usage && typeof usage === 'object' && 'total_tokens' in usage) {
      const total = (usage as { total_tokens?: unknown }).total_tokens;
      if (typeof total === 'number') {
        return total;
      }
    }
  }
  return 0;
}

export class RateLimiter {
  private rpm: number | null;
  private tpm: number | null;
  private queue: QueueItem<unknown>[] = [];
  private processing = false;
  private requestTimes: number[] = [];
  private tokenUsage: TokenUsageEntry[] = [];
  private retryDelays = [1000, 2000, 5000, 10000];
  // FIX: Add max queue size to prevent unbounded growth
  private maxQueueSize: number;

  constructor(requestsPerMinute: number | null = null, tokensPerMinute: number | null = null, maxQueueSize: number = 10000) {
    this.rpm = requestsPerMinute ?? this.getDefaultRPM();
    this.tpm = tokensPerMinute ?? this.getDefaultTPM();
    this.maxQueueSize = maxQueueSize;
  }

  private getDefaultRPM(): number | null {
    const envVar = process.env.CODEVAULT_EMBEDDING_RATE_LIMIT_RPM || process.env.CODEVAULT_RATE_LIMIT_RPM || process.env.CODEVAULT_RATE_LIMIT;
    if (envVar) {
      const limit = parseInt(envVar, 10);
      if (!isNaN(limit) && limit > 0) {
        return limit;
      }
    }
    return null;
  }

  private getDefaultTPM(): number | null {
    const envVar = process.env.CODEVAULT_EMBEDDING_RATE_LIMIT_TPM || process.env.CODEVAULT_RATE_LIMIT_TPM;
    if (envVar) {
      const limit = parseInt(envVar, 10);
      if (!isNaN(limit) && limit > 0) {
        return limit;
      }
    }
    return null;
  }

  private canMakeRequest(estimatedTokens = 0): boolean {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    this.requestTimes = this.requestTimes.filter(time => time > oneMinuteAgo);
    this.tokenUsage = this.tokenUsage.filter(entry => entry.time > oneMinuteAgo);

    if (this.rpm !== null && this.requestTimes.length >= this.rpm) {
      return false;
    }

    if (this.tpm !== null && estimatedTokens > 0) {
      const tokensInLastMinute = this.tokenUsage.reduce((sum, entry) => sum + entry.tokens, 0);
      if (tokensInLastMinute + estimatedTokens > this.tpm) {
        return false;
      }
    }

    return true;
  }

  private recordRequest(tokensUsed = 0): void {
    const now = Date.now();
    
    if (this.rpm !== null) {
      this.requestTimes.push(now);
    }
    
    if (this.tpm !== null && tokensUsed > 0) {
      this.tokenUsage.push({ time: now, tokens: tokensUsed });
    }
  }

  private getDelayUntilNextSlot(estimatedTokens = 0): number {
    const now = Date.now();
    let delay = 0;

    if (this.rpm !== null && this.requestTimes.length > 0) {
      const oldestRequest = this.requestTimes[0];
      const rpmDelay = 60000 - (now - oldestRequest);
      delay = Math.max(delay, rpmDelay);
    }

    if (this.tpm !== null && estimatedTokens > 0 && this.tokenUsage.length > 0) {
      const tokensInLastMinute = this.tokenUsage.reduce((sum, entry) => sum + entry.tokens, 0);
      if (tokensInLastMinute + estimatedTokens > this.tpm) {
        const oldestToken = this.tokenUsage[0];
        const tpmDelay = 60000 - (now - oldestToken.time);
        delay = Math.max(delay, tpmDelay);
      }
    }
    
    return Math.max(0, delay + 100);
  }

  async execute<T>(fn: () => Promise<T>, retryCount = 0, estimatedTokens = 0): Promise<T> {
    return new Promise((resolve, reject) => {
      // FIX: Reject if queue is at max capacity to prevent memory exhaustion
      if (this.queue.length >= this.maxQueueSize) {
        reject(new Error(`Rate limiter queue is full (${this.maxQueueSize} items). Too many concurrent requests.`));
        return;
      }
      
      this.queue.push({
        fn,
        resolve: resolve as (value: unknown) => void,
        reject,
        retryCount,
        estimatedTokens
      });
      void this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue[0];
      const { fn, resolve, reject, retryCount, estimatedTokens } = item;
      
      while (!this.canMakeRequest(estimatedTokens || 0)) {
        const delay = this.getDelayUntilNextSlot(estimatedTokens || 0);
        if (delay > 0) {
          await new Promise(r => setTimeout(r, delay));
        }
      }

      this.queue.shift();

      try {
        const result = await fn();

        const tokensUsed = estimatedTokens || extractTokensUsed(result) || 0;
        this.recordRequest(tokensUsed);

        resolve(result);
      } catch (error) {
        if (this.isRateLimitError(error)) {
          const maxRetries = this.retryDelays.length;
          
          if (retryCount < maxRetries) {
            const delay = this.retryDelays[retryCount];
            console.warn(`⚠️  Rate limit hit (429). Retrying in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
            
            await new Promise(r => setTimeout(r, delay));
            
            this.queue.unshift({ fn, resolve, reject, retryCount: retryCount + 1, estimatedTokens });
          } else {
            reject(new Error(`Rate limit exceeded after ${maxRetries} retries: ${(error as Error).message}`));
          }
        } else {
          reject(error as Error);
        }
      }
    }

    this.processing = false;
  }

  private isRateLimitError(error: unknown): boolean {
    if (!error) return false;

    const errorObj = error as Record<string, unknown>;
    const message = typeof errorObj.message === 'string' ? errorObj.message : '';
    const status = typeof errorObj.status === 'number' ? errorObj.status : (typeof errorObj.statusCode === 'number' ? errorObj.statusCode : 0);

    return status === 429 ||
           message.includes('429') ||
           message.includes('rate limit') ||
           message.includes('too many requests');
  }

  getStats(): {
    rpm: number | null;
    tpm: number | null;
    queueLength: number;
    maxQueueSize: number;
    queueUtilization: string;
    requestsInLastMinute: number;
    tokensInLastMinute: number;
    isRpmLimited: boolean;
    isTpmLimited: boolean;
    isLimited: boolean;
  } {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const tokensInLastMinute = this.tokenUsage
      .filter(entry => entry.time > oneMinuteAgo)
      .reduce((sum, entry) => sum + entry.tokens, 0);
        
    return {
      rpm: this.rpm,
      tpm: this.tpm,
      queueLength: this.queue.length,
      maxQueueSize: this.maxQueueSize,
      queueUtilization: `${((this.queue.length / this.maxQueueSize) * 100).toFixed(1)  }%`,
      requestsInLastMinute: this.requestTimes.filter(t => t > oneMinuteAgo).length,
      tokensInLastMinute,
      isRpmLimited: this.rpm !== null,
      isTpmLimited: this.tpm !== null,
      isLimited: this.rpm !== null || this.tpm !== null
    };
  }

  reset(): void {
    this.queue = [];
    this.requestTimes = [];
    this.tokenUsage = [];
    this.processing = false;
  }
}

export function createRateLimiter(providerName: string): RateLimiter {
  const defaultLimits: Record<string, { rpm: number | null; tpm: number | null }> = {
    'OpenAI': { rpm: 50, tpm: null },
    'Qwen': { rpm: 10000, tpm: 600000 },
  };

  if (process.env.CODEVAULT_RATE_LIMIT_RPM || process.env.CODEVAULT_RATE_LIMIT || process.env.CODEVAULT_RATE_LIMIT_TPM) {
    return new RateLimiter();
  }

  const limits = defaultLimits[providerName] ?? { rpm: null, tpm: null };
  return new RateLimiter(limits.rpm, limits.tpm);
}
