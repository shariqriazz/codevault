function getAPIUrl(): string {
  return process.env.CODEVAULT_RERANK_API_URL || '';
}

function getAPIKey(): string {
  return process.env.CODEVAULT_RERANK_API_KEY || '';
}

function getModel(): string {
  return process.env.CODEVAULT_RERANK_MODEL || 'rerank-v3.5';
}

function getMaxFromEnv(): number {
  const envMax = Number.parseInt(process.env.CODEVAULT_RERANKER_MAX || '50', 10);
  return Number.isFinite(envMax) && envMax > 0 ? envMax : 50;
}

function getMaxTokensFromEnv(): number {
  const envMax = Number.parseInt(process.env.CODEVAULT_RERANKER_MAX_TOKENS || '8192', 10);
  return Number.isFinite(envMax) && envMax > 0 ? envMax : 8192;
}

function truncateText(text: string, maxTokens: number): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  const maxChars = maxTokens * 4;
  
  if (text.length <= maxChars) {
    return text;
  }

  return text.slice(0, maxChars);
}

export function isAPIRerankingConfigured(): boolean {
  const url = getAPIUrl();
  const key = getAPIKey();
  return Boolean(url && key);
}

interface RerankAPIConfig {
  apiUrl?: string;
  apiKey?: string;
  model?: string;
}

interface RerankResult {
  index: number;
  relevance_score?: number;
  score?: number;
  logit?: number;
}

async function callRerankAPI(query: string, documents: string[], config: RerankAPIConfig = {}): Promise<RerankResult[]> {
  const apiUrl = config.apiUrl || getAPIUrl();
  const apiKey = config.apiKey || getAPIKey();
  const model = config.model || getModel();

  if (!apiUrl) {
    throw new Error('CODEVAULT_RERANK_API_URL is not configured');
  }

  if (!apiKey) {
    throw new Error('CODEVAULT_RERANK_API_KEY is not configured');
  }

  // Standard reranking API format (Novita, Cohere, Jina AI, Voyage AI)
  const requestBody = {
    model: model,
    query: query,
    documents: documents,
    top_n: documents.length
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Rerank API error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as any;

  // Handle standard reranking response format
  // Most providers (Novita, Cohere, Jina AI, Voyage AI) use this format
  if (data.results && Array.isArray(data.results)) {
    return data.results;
  }

  // Alternative response format (some providers use data array)
  if (data.data && Array.isArray(data.data)) {
    return data.data;
  }

  // Fallback for direct array response
  if (Array.isArray(data)) {
    return data;
  }

  throw new Error(`Unexpected rerank API response format. Expected {results: [...]} but got: ${JSON.stringify(data).slice(0, 200)}`);
}

interface Candidate {
  rerankerScore?: number;
  rerankerRank?: number;
  [key: string]: any;
}

interface RerankOptions {
  max?: number;
  maxTokens?: number;
  getText?: (candidate: Candidate) => string;
  getTextAsync?: (candidate: Candidate) => Promise<string>;
  apiUrl?: string;
  apiKey?: string;
  model?: string;
}

export async function rerankWithAPI(query: string, candidates: Candidate[], options: RerankOptions = {}): Promise<Candidate[]> {
  if (!Array.isArray(candidates) || candidates.length <= 1) {
    return candidates;
  }

  const maxCandidates = Math.min(
    typeof options.max === 'number' && Number.isFinite(options.max) && options.max > 0 
      ? Math.floor(options.max) 
      : getMaxFromEnv(),
    candidates.length
  );
  
  if (maxCandidates <= 1) {
    return candidates;
  }

  const topCandidates = candidates.slice(0, maxCandidates);
  const configuredMaxTokens = typeof options.maxTokens === 'number' && Number.isFinite(options.maxTokens)
    ? options.maxTokens
    : getMaxTokensFromEnv();
  const maxTokens = Math.max(1, configuredMaxTokens);

  try {
    const texts = await Promise.all(
      topCandidates.map(async candidate => {
        let text: string;
        if (options.getTextAsync && typeof options.getTextAsync === 'function') {
          text = await options.getTextAsync(candidate);
        } else if (options.getText && typeof options.getText === 'function') {
          text = options.getText(candidate);
        } else {
          text = '';
        }
        const textStr = typeof text === 'string' ? text : '';
        return truncateText(textStr, maxTokens);
      })
    );

    const apiConfig: RerankAPIConfig = {
      apiUrl: options.apiUrl,
      apiKey: options.apiKey,
      model: options.model
    };

    const results = await callRerankAPI(query, texts, apiConfig);

    const scoreMap = new Map<number, number>();
    for (const result of results) {
      const index = result.index;
      const score = result.relevance_score || result.score || 0;
      scoreMap.set(index, score);
    }

    const scored = topCandidates.map((candidate, index) => ({
      candidate,
      score: scoreMap.get(index) || 0
    })).sort((a, b) => b.score - a.score);

    scored.forEach((entry, index) => {
      entry.candidate.rerankerScore = entry.score;
      entry.candidate.rerankerRank = index + 1;
    });

    const rerankedTop = scored.map(entry => entry.candidate);
    const remainder = candidates.slice(maxCandidates);
    return [...rerankedTop, ...remainder];

  } catch (error) {
    console.error('API reranking failed:', (error as Error).message);
    return candidates;
  }
}
