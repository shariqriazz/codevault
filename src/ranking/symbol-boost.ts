import type { Codemap } from '../types/codemap.js';
import { SYMBOL_BOOST_CONSTANTS } from '../config/constants.js';

const SIGNATURE_MATCH_BOOST = SYMBOL_BOOST_CONSTANTS.SIGNATURE_MATCH_BOOST;
const NEIGHBOR_MATCH_BOOST = SYMBOL_BOOST_CONSTANTS.NEIGHBOR_MATCH_BOOST;
const MIN_TOKEN_LENGTH = SYMBOL_BOOST_CONSTANTS.MIN_TOKEN_LENGTH;
const MAX_SYMBOL_BOOST = SYMBOL_BOOST_CONSTANTS.MAX_SYMBOL_BOOST;

interface SearchResult {
  id: string;
  score?: number;
  symbolBoost?: number;
  symbolBoostSources?: string[];
  symbolMatchStrength?: number;
  symbolNeighborStrength?: number;
}

// Regex cache for performance
const regexCache = new Map<string, RegExp>();
const MAX_CACHE_SIZE = 1000;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildQueryTokenRegex(token: string): RegExp | null {
  if (!token || token.length < MIN_TOKEN_LENGTH) {
    return null;
  }

  // Check cache first
  const cached = regexCache.get(token);
  if (cached) {
    return cached;
  }

  const escaped = escapeRegex(token.toLowerCase());
  const regex = new RegExp(`\\b${escaped}[a-z0-9_]*\\b`, 'i');

  // Add to cache with size limit
  if (regexCache.size >= MAX_CACHE_SIZE) {
    // Clear oldest entries (simple FIFO)
    const firstKey = regexCache.keys().next().value;
    if (firstKey !== undefined) {
      regexCache.delete(firstKey);
    }
  }
  regexCache.set(token, regex);

  return regex;
}

function splitSymbolWords(symbol: string): string[] {
  if (!symbol) {
    return [];
  }

  const cleaned = symbol.replace(/[^A-Za-z0-9_]/g, ' ');
  return cleaned
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s_]+/)
    .map(word => word.trim().toLowerCase())
    .filter(word => word.length > 0);
}

function computeSignatureMatchStrength(query: string, entry: any): number {
  if (!entry) {
    return 0;
  }

  const queryLower = query.toLowerCase();
  const symbolRaw = entry.symbol;
  const rawSymbol = typeof symbolRaw === 'string' ? symbolRaw : '';
  const symbol = rawSymbol.toLowerCase();
  const signatureRaw = entry.symbol_signature;
  const signature = typeof signatureRaw === 'string' ? signatureRaw.toLowerCase() : '';

  let weight = 0;
  const matchedTokens = new Set<string>();

  if (symbol && queryLower.includes(symbol)) {
    weight += 4;
  }

  if (signature) {
    const normalizedSignature = signature.replace(/\s+/g, ' ');
    if (queryLower.includes(normalizedSignature)) {
      weight = Math.max(weight, 3.5);
    }
  }

  const symbolTokens = splitSymbolWords(rawSymbol).map(token => token.toLowerCase());
  let symbolTokenMatches = 0;
  for (const token of symbolTokens) {
    if (token.length < MIN_TOKEN_LENGTH || matchedTokens.has(token)) {
      continue;
    }

    const regex = buildQueryTokenRegex(token);
    if (regex && regex.test(query)) {
      matchedTokens.add(token);
      symbolTokenMatches += 1;
    }
  }

  if (symbolTokenMatches > 0) {
    weight += 1 + 0.5 * (symbolTokenMatches - 1);
  }

  let parameterMatches = 0;
  if (Array.isArray(entry.symbol_parameters)) {
    for (const param of entry.symbol_parameters) {
      if (typeof param !== 'string') {
        continue;
      }

      const parts = param
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map(part => part.trim())
        .filter(part => part.length >= MIN_TOKEN_LENGTH);

      for (const part of parts) {
        if (matchedTokens.has(part)) {
          continue;
        }

        const regex = buildQueryTokenRegex(part);
        if (regex && regex.test(query)) {
          matchedTokens.add(part);
          parameterMatches += 1;
          break;
        }
      }
    }
  }

  if (parameterMatches > 0) {
    weight += 0.35 * parameterMatches;
  }

  if (weight <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(weight / 4, 1));
}

function buildShaIndex(codemap: Codemap): Map<string, { chunkId: string; entry: any }> {
  const index = new Map<string, { chunkId: string; entry: any }>();
  if (!codemap || typeof codemap !== 'object') {
    return index;
  }

  for (const [chunkId, entry] of Object.entries(codemap)) {
    if (!entry || typeof entry.sha !== 'string') {
      continue;
    }
    index.set(entry.sha, { chunkId, entry });
  }

  return index;
}

export function applySymbolBoost(results: SearchResult[], { query, codemap }: { query: string; codemap: Codemap }): void {
  if (!Array.isArray(results) || results.length === 0) {
    return;
  }

  if (!codemap || typeof codemap !== 'object') {
    return;
  }

  const shaIndex = buildShaIndex(codemap);

  for (const result of results) {
    const metadata = codemap[result.id];
    if (!metadata) {
      continue;
    }

    let boost = 0;
    const sources: string[] = [];

    const matchStrength = computeSignatureMatchStrength(query, metadata);
    if (matchStrength > 0) {
      boost += SIGNATURE_MATCH_BOOST * matchStrength;
      sources.push('signature');
      result.symbolMatchStrength = matchStrength;
    }

    const neighborShas = Array.isArray(metadata.symbol_neighbors)
      ? metadata.symbol_neighbors
      : [];

    let bestNeighborStrength = 0;
    if (neighborShas.length > 0) {
      for (const neighborSha of neighborShas) {
        const neighbor = shaIndex.get(neighborSha);
        if (!neighbor) {
          continue;
        }

        const neighborStrength = computeSignatureMatchStrength(query, neighbor.entry);
        if (neighborStrength > bestNeighborStrength) {
          bestNeighborStrength = neighborStrength;
        }
      }
    }

    if (bestNeighborStrength > 0) {
      boost += NEIGHBOR_MATCH_BOOST * bestNeighborStrength;
      sources.push('neighbor');
      result.symbolNeighborStrength = bestNeighborStrength;
    }

    if (boost > 0) {
      const cappedBoost = Math.min(boost, MAX_SYMBOL_BOOST);
      const baseScore = Math.min(Math.max(typeof result.score === 'number' ? result.score : 0, 0), 1);
      result.score = Math.min(1, baseScore + cappedBoost);
      result.symbolBoost = cappedBoost;
      result.symbolBoostSources = sources;
    }
  }
}
