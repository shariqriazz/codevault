class LRUCache<K, V> {
  private maxSize: number;
  private cache = new Map<K, V>();

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;
    
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    
    this.cache.set(key, value);
    
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

interface TokenCountStats {
  totalRequests: number;
  cacheHits: number;
  charFilterSkips: number;
  actualTokenizations: number;
  batchTokenizations: number;
  cacheHitRate: string;
  charFilterRate: string;
  tokenizationRate: string;
}

const tokenCountCache = new LRUCache<string, number>(1000);
const stats = {
  totalRequests: 0,
  cacheHits: 0,
  charFilterSkips: 0,
  actualTokenizations: 0,
  batchTokenizations: 0
};

function estimateTokensFromChars(charCount: number): number {
  return Math.ceil(charCount / 4);
}

interface SizeLimits {
  min: number;
  max: number;
  optimal: number;
}

type Decision = 'too_small' | 'too_large' | 'needs_tokenization' | 'optimal';

interface PreFilterResult {
  decision: Decision;
  estimate: number;
}

function preFilterByChars(code: string, limits: SizeLimits): PreFilterResult {
  const charCount = code.length;
  const estimatedTokens = estimateTokensFromChars(charCount);
  
  const minEstimate = limits.min * 0.8;
  const maxEstimate = limits.max * 1.2;
  const optimalLow = limits.optimal * 0.8;
  const optimalHigh = limits.optimal * 1.2;
  
  if (estimatedTokens < minEstimate) {
    return { decision: 'too_small', estimate: estimatedTokens };
  }
  if (estimatedTokens > maxEstimate) {
    return { decision: 'too_large', estimate: estimatedTokens };
  }
  if (estimatedTokens >= optimalLow && estimatedTokens <= optimalHigh) {
    return { decision: 'optimal', estimate: estimatedTokens };
  }
  
  return { decision: 'needs_tokenization', estimate: estimatedTokens };
}

async function countTokensWithCache(code: string, tokenCounter: (text: string) => number | Promise<number>): Promise<number> {
  stats.totalRequests++;
  
  const cached = tokenCountCache.get(code);
  if (cached !== undefined) {
    stats.cacheHits++;
    return cached;
  }
  
  stats.actualTokenizations++;
  const result = tokenCounter(code);
  const count = result instanceof Promise ? await result : result;
  
  tokenCountCache.set(code, count);
  
  return count;
}

async function batchCountTokens(codeSnippets: string[], tokenCounter: (text: string) => number | Promise<number>): Promise<number[]> {
  stats.batchTokenizations++;
  
  const results: number[] = [];
  const uncached: string[] = [];
  const uncachedIndices: number[] = [];
  
  for (let i = 0; i < codeSnippets.length; i++) {
    const code = codeSnippets[i];
    const cached = tokenCountCache.get(code);
    
    if (cached !== undefined) {
      stats.cacheHits++;
      results[i] = cached;
    } else {
      uncached.push(code);
      uncachedIndices.push(i);
    }
  }
  
  if (uncached.length > 0) {
    stats.actualTokenizations += uncached.length;
    
    const counts = await Promise.all(
      uncached.map(async (code) => {
        const result = tokenCounter(code);
        return result instanceof Promise ? await result : result;
      })
    );
    
    for (let i = 0; i < counts.length; i++) {
      const code = uncached[i];
      const count = counts[i];
      tokenCountCache.set(code, count);
      results[uncachedIndices[i]] = count;
    }
  }
  
  return results;
}

export interface CodeSizeAnalysis {
  size: number;
  decision: Decision;
  method: string;
}

export async function analyzeCodeSize(
  code: string,
  limits: SizeLimits,
  tokenCounter: (text: string) => number | Promise<number>,
  allowEstimateForSkip = false
): Promise<CodeSizeAnalysis> {
  stats.totalRequests++;
  
  const preFilter = preFilterByChars(code, limits);
  
  if (allowEstimateForSkip && preFilter.decision === 'too_large') {
    stats.charFilterSkips++;
    return {
      size: preFilter.estimate,
      decision: preFilter.decision,
      method: 'char_estimate'
    };
  }
  
  const actualSize = await countTokensWithCache(code, tokenCounter);
  
  let decision: Decision;
  if (actualSize < limits.min) {
    decision = 'too_small';
  } else if (actualSize > limits.max) {
    decision = 'too_large';
  } else if (actualSize <= limits.optimal) {
    decision = 'optimal';
  } else {
    decision = 'needs_tokenization';
  }
  
  return {
    size: actualSize,
    decision,
    method: 'tokenized'
  };
}

export async function batchAnalyzeCodeSize(
  codeSnippets: string[],
  limits: SizeLimits,
  tokenCounter: (text: string) => number | Promise<number>,
  allowEstimateForSkip = false
): Promise<CodeSizeAnalysis[]> {
  const results: CodeSizeAnalysis[] = [];
  const needsTokenization: string[] = [];
  const needsTokenizationIndices: number[] = [];
  
  for (let i = 0; i < codeSnippets.length; i++) {
    const code = codeSnippets[i];
    const preFilter = preFilterByChars(code, limits);
    
    if (allowEstimateForSkip && preFilter.decision === 'too_large') {
      stats.charFilterSkips++;
      results[i] = {
        size: preFilter.estimate,
        decision: preFilter.decision,
        method: 'char_estimate'
      };
    } else {
      needsTokenization.push(code);
      needsTokenizationIndices.push(i);
    }
  }
  
  if (needsTokenization.length > 0) {
    const tokenCounts = await batchCountTokens(needsTokenization, tokenCounter);
    
    for (let i = 0; i < tokenCounts.length; i++) {
      const actualSize = tokenCounts[i];
      const idx = needsTokenizationIndices[i];
      
      let decision: Decision;
      if (actualSize < limits.min) {
        decision = 'too_small';
      } else if (actualSize > limits.max) {
        decision = 'too_large';
      } else if (actualSize <= limits.optimal) {
        decision = 'optimal';
      } else {
        decision = 'needs_tokenization';
      }
      
      results[idx] = {
        size: actualSize,
        decision,
        method: 'tokenized'
      };
    }
  }
  
  return results;
}

export function getTokenCountStats(): TokenCountStats {
  return {
    ...stats,
    cacheHitRate: stats.totalRequests > 0 
      ? (stats.cacheHits / stats.totalRequests * 100).toFixed(1) + '%'
      : '0%',
    charFilterRate: stats.totalRequests > 0
      ? (stats.charFilterSkips / stats.totalRequests * 100).toFixed(1) + '%'
      : '0%',
    tokenizationRate: stats.totalRequests > 0
      ? (stats.actualTokenizations / stats.totalRequests * 100).toFixed(1) + '%'
      : '0%'
  };
}

export function resetTokenCountStats(): void {
  stats.totalRequests = 0;
  stats.cacheHits = 0;
  stats.charFilterSkips = 0;
  stats.actualTokenizations = 0;
  stats.batchTokenizations = 0;
}

export function clearTokenCache(): void {
  tokenCountCache.clear();
}