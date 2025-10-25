export interface ModelProfile {
  maxTokens: number;
  optimalTokens: number;
  minChunkTokens: number;
  maxChunkTokens: number;
  overlapTokens: number;
  optimalChars: number;
  minChunkChars: number;
  maxChunkChars: number;
  overlapChars: number;
  dimensions: number;
  useTokens: boolean;
  tokenizerType: string;
  encoding?: string;
  tokenCounter?: (text: string) => number | Promise<number>;
}

export abstract class EmbeddingProvider {
  abstract generateEmbedding(text: string): Promise<number[]>;
  abstract getDimensions(): number;
  abstract getName(): string;
  abstract getModelName?(): string;
  abstract init?(): Promise<void>;
  
  rateLimiter?: any;
}

export const MODEL_PROFILES: Record<string, Omit<ModelProfile, 'tokenCounter'>> = {
  'text-embedding-3-large': {
    maxTokens: 8191,
    optimalTokens: 4000,
    minChunkTokens: 400,
    maxChunkTokens: 6000,
    overlapTokens: 100,
    optimalChars: 16000,
    minChunkChars: 1600,
    maxChunkChars: 24000,
    overlapChars: 400,
    dimensions: 3072,
    useTokens: true,
    tokenizerType: 'tiktoken',
    encoding: 'cl100k_base'
  },
  'text-embedding-3-small': {
    maxTokens: 8191,
    optimalTokens: 4000,
    minChunkTokens: 400,
    maxChunkTokens: 6000,
    overlapTokens: 100,
    optimalChars: 16000,
    minChunkChars: 1600,
    maxChunkChars: 24000,
    overlapChars: 400,
    dimensions: 1536,
    useTokens: true,
    tokenizerType: 'tiktoken',
    encoding: 'cl100k_base'
  },
  'text-embedding-ada-002': {
    maxTokens: 8191,
    optimalTokens: 4000,
    minChunkTokens: 400,
    maxChunkTokens: 6000,
    overlapTokens: 100,
    optimalChars: 16000,
    minChunkChars: 1600,
    maxChunkChars: 24000,
    overlapChars: 400,
    dimensions: 1536,
    useTokens: true,
    tokenizerType: 'tiktoken',
    encoding: 'cl100k_base'
  },
  'nomic-embed-text': {
    maxTokens: 8192,
    optimalTokens: 4000,
    minChunkTokens: 400,
    maxChunkTokens: 6000,
    overlapTokens: 100,
    optimalChars: 16000,
    minChunkChars: 1600,
    maxChunkChars: 24000,
    overlapChars: 400,
    dimensions: 768,
    useTokens: true,
    tokenizerType: 'tiktoken',
    encoding: 'cl100k_base'
  },
  'Qwen/Qwen3-Embedding-8B': {
    maxTokens: 32000,
    optimalTokens: 16000,
    minChunkTokens: 1000,
    maxChunkTokens: 28000,
    overlapTokens: 500,
    optimalChars: 64000,
    minChunkChars: 4000,
    maxChunkChars: 112000,
    overlapChars: 2000,
    dimensions: 4096,
    useTokens: true,
    tokenizerType: 'tiktoken',
    encoding: 'cl100k_base'
  },
  'default': {
    maxTokens: 512,
    optimalTokens: 400,
    minChunkTokens: 50,
    maxChunkTokens: 480,
    overlapTokens: 30,
    optimalChars: 1600,
    minChunkChars: 200,
    maxChunkChars: 1920,
    overlapChars: 120,
    dimensions: 384,
    useTokens: false,
    tokenizerType: 'estimate'
  }
};

export async function getModelProfile(providerName: string, modelName: string | null): Promise<ModelProfile> {
  let baseProfile = modelName ? MODEL_PROFILES[modelName] : undefined;
  
  if (!baseProfile) {
    const providerDefaults: Record<string, Omit<ModelProfile, 'tokenCounter'>> = {
      'OpenAI': MODEL_PROFILES['text-embedding-3-large'],
      'Ollama': MODEL_PROFILES['nomic-embed-text']
    };
    baseProfile = providerDefaults[providerName] || MODEL_PROFILES['default'];
  }
  
  const profile: ModelProfile = { ...baseProfile } as ModelProfile;
  
  if (process.env.CODEVAULT_MAX_TOKENS) {
    const maxTokens = parseInt(process.env.CODEVAULT_MAX_TOKENS, 10);
    if (!isNaN(maxTokens) && maxTokens > 0) {
      const originalMaxTokens = profile.maxTokens;
      const scalingRatio = maxTokens / originalMaxTokens;
      
      profile.maxTokens = maxTokens;
      profile.optimalTokens = Math.floor(maxTokens * 0.82);
      profile.minChunkTokens = Math.max(Math.floor(profile.minChunkTokens * scalingRatio), 50);
      profile.maxChunkTokens = Math.floor(maxTokens * 0.95);
      profile.overlapTokens = Math.floor(profile.overlapTokens * scalingRatio);
      
      console.log(`Using custom max tokens: ${maxTokens}`);
      console.log(`Auto-scaled optimal tokens: ${profile.optimalTokens} (82% of max)`);
      console.log(`Auto-scaled min tokens: ${profile.minChunkTokens}`);
      console.log(`Auto-scaled max chunk tokens: ${profile.maxChunkTokens} (95% of max)`);
    }
  }
  
  if (process.env.CODEVAULT_DIMENSIONS) {
    const dimensions = parseInt(process.env.CODEVAULT_DIMENSIONS, 10);
    if (!isNaN(dimensions) && dimensions > 0) {
      profile.dimensions = dimensions;
      console.log(`Using custom dimensions: ${dimensions}`);
    }
  }
  
  if (profile.useTokens) {
    const { getTokenCounter } = await import('./token-counter.js');
    const counter = await getTokenCounter(modelName || providerName);
    
    if (!counter) {
      console.warn(`Token counter unavailable for ${modelName}, using character estimation`);
      profile.useTokens = false;
      profile.tokenCounter = undefined;
    } else {
      profile.tokenCounter = counter;
    }
  }
  
  return profile as ModelProfile;
}

export function getSizeLimits(profile: ModelProfile): {
  optimal: number;
  min: number;
  max: number;
  overlap: number;
  unit: string;
} {
  if (profile.useTokens && profile.tokenCounter) {
    return {
      optimal: profile.optimalTokens,
      min: profile.minChunkTokens,
      max: profile.maxChunkTokens,
      overlap: profile.overlapTokens,
      unit: 'tokens'
    };
  }
  return {
    optimal: profile.optimalChars,
    min: profile.minChunkChars,
    max: profile.maxChunkChars,
    overlap: profile.overlapChars,
    unit: 'characters'
  };
}