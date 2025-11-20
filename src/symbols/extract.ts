import type { TreeSitterNode } from '../types/ast.js';
import type { CodemapChunk } from '../types/codemap.js';
import { CHUNKING_CONSTANTS, SYMBOL_BOOST_CONSTANTS } from '../config/constants.js';

const KEYWORD_BLACKLIST = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'class',
  'new', 'await', 'yield', 'isset', 'empty', 'echo', 'print', 'require', 'include'
]);

// Regex cache for performance
const regexCache = new Map<string, RegExp>();
const MAX_CACHE_SIZE = 1000;

export interface SymbolMetadata {
  signature: string;
  parameters: string[];
  returnType: string | null;
  calls: string[];
  keywords: string[];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sliceSignatureSnippet(source: string, node: TreeSitterNode): string {
  const start = node.startIndex;
  const end = Math.min(node.endIndex, start + CHUNKING_CONSTANTS.MAX_SIGNATURE_SNIPPET);
  return source.slice(start, end);
}

function findClosingParen(text: string, startIndex: number): number {
  let depth = 0;
  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function buildMemoizedRegex(word: string): RegExp {
  const cacheKey = `\\b${word}[a-z0-9_]*\\b`;
  const cached = regexCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const regex = new RegExp(cacheKey, 'i');

  // Add to cache with size limit
  if (regexCache.size >= MAX_CACHE_SIZE) {
    const firstKey = regexCache.keys().next().value;
    if (firstKey !== undefined) {
      regexCache.delete(firstKey);
    }
  }
  regexCache.set(cacheKey, regex);

  return regex;
}

function extractParameterSection(snippet: string): { paramsText: string; closeIndex: number } {
  const openIndex = snippet.indexOf('(');
  if (openIndex === -1) {
    return { paramsText: '', closeIndex: -1 };
  }

  const closeIndex = findClosingParen(snippet, openIndex);
  if (closeIndex === -1) {
    return { paramsText: '', closeIndex: -1 };
  }

  const paramsText = snippet.slice(openIndex + 1, closeIndex).trim();
  return { paramsText, closeIndex };
}

function normalizeParameter(param: string): string {
  if (!param) {
    return '';
  }

  const withoutDefaults = param.split('=')[0].trim();
  const cleaned = withoutDefaults.replace(/^[*&]+/, '').trim();
  return cleaned;
}

function extractParameters(snippet: string): { parameters: string[]; closeIndex: number } {
  const { paramsText, closeIndex } = extractParameterSection(snippet);
  if (closeIndex === -1 || paramsText.length === 0) {
    return { parameters: [], closeIndex };
  }

  const rawParams = paramsText.split(',');
  const parameters = rawParams
    .map(param => normalizeParameter(param))
    .filter(param => param.length > 0)
    .slice(0, SYMBOL_BOOST_CONSTANTS.MAX_PARAMETERS);

  return { parameters, closeIndex };
}

function extractReturnType(snippet: string, closeIndex: number): string | null {
  if (closeIndex === -1) {
    return null;
  }

  const after = snippet.slice(closeIndex + 1, closeIndex + CHUNKING_CONSTANTS.MAX_RETURN_TYPE_SNIPPET);
  const colonMatch = after.match(/:\s*([A-Za-z0-9_\\\[\]<>|?]+)/);
  if (colonMatch) {
    return colonMatch[1];
  }

  const arrowMatch = after.match(/->\s*([A-Za-z0-9_\\\[\]<>|?]+)/);
  if (arrowMatch) {
    return arrowMatch[1];
  }

  return null;
}

function buildSignature(symbol: string, snippet: string, node: TreeSitterNode): {
  signature: string;
  parameters: string[];
  returnType: string | null;
} {
  const normalizedSymbol = typeof symbol === 'string' ? symbol.trim() : '';
  const isClassNode = node.type && node.type.includes('class');

  if (isClassNode && normalizedSymbol) {
    return { signature: `class ${normalizedSymbol}`, parameters: [], returnType: null };
  }

  if (!normalizedSymbol) {
    return { signature: '', parameters: [], returnType: null };
  }

  const { parameters, closeIndex } = extractParameters(snippet);
  const returnType = extractReturnType(snippet, closeIndex);
  const paramText = parameters.length > 0 ? parameters.join(', ') : '';
  const signature = returnType
    ? `${normalizedSymbol}(${paramText}) : ${returnType}`
    : `${normalizedSymbol}(${paramText})`;

  return { signature, parameters, returnType };
}

function extractCallNameFromSnippet(snippet: string): string | null {
  const trimmed = snippet.trim();
  if (!trimmed.includes('(')) {
    return null;
  }

  const callMatch = trimmed.match(/(?:\$?[A-Za-z_][\w]*->|[A-Za-z_][\w]*::|[A-Za-z_][\w]*\.)*([A-Za-z_][\w]*)\s*\(/);
  if (!callMatch) {
    return null;
  }

  const candidate = callMatch[1];
  if (!candidate || KEYWORD_BLACKLIST.has(candidate)) {
    return null;
  }

  return candidate;
}

function collectCalls(node: TreeSitterNode, source: string, calls: Set<string>): void {
  const nodeType = node.type || '';
  const isCallNode = nodeType.includes('call') || nodeType.includes('invocation');

  if (isCallNode) {
    const snippet = source.slice(node.startIndex, Math.min(node.endIndex, node.startIndex + CHUNKING_CONSTANTS.MAX_CALL_SNIPPET));
    const name = extractCallNameFromSnippet(snippet);
    if (name) {
      calls.add(name);
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      collectCalls(child, source, calls);
    }
  }
}

function splitSymbolWords(symbol: string): string[] {
  if (!symbol) {
    return [];
  }

  const cleaned = symbol.replace(/[^A-Za-z0-9_]/g, ' ');
  const words = cleaned
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s_]+/)
    .map(word => word.trim().toLowerCase())
    .filter(word => word.length > 0);

  return words;
}

export function extractSymbolMetadata({ node, source, symbol }: {
  node: TreeSitterNode;
  source: string;
  symbol: string;
}): SymbolMetadata {
  const snippet = sliceSignatureSnippet(source, node);
  const { signature, parameters, returnType } = buildSignature(symbol, snippet, node);

  const calls = new Set<string>();
  collectCalls(node, source, calls);

  const symbolWords = splitSymbolWords(symbol);

  return {
    signature,
    parameters,
    returnType,
    calls: Array.from(calls),
    keywords: symbolWords
  };
}

export function queryMatchesSignature(
  query: string,
  metadata: Partial<CodemapChunk> | null | undefined
): boolean {
  if (!metadata || typeof metadata !== 'object') {
    return false;
  }

  const queryLower = query.toLowerCase();
  const signature = typeof metadata.signature === 'string' ? metadata.signature.toLowerCase() : '';
  const symbol = typeof metadata.symbol === 'string' ? metadata.symbol.toLowerCase() : '';

  if (symbol && queryLower.includes(symbol)) {
    return true;
  }

  if (signature && queryLower.includes(signature)) {
    return true;
  }

  if (Array.isArray(metadata.symbol_parameters)) {
    for (const param of metadata.symbol_parameters) {
      if (typeof param === 'string' && param.length > 2) {
        const needle = param.toLowerCase();
        if (queryLower.includes(needle)) {
          return true;
        }
      }
    }
  }

  if (Array.isArray(metadata.keywords) && metadata.keywords.length > 0) {
    for (const word of metadata.keywords) {
      if (!word || word.length < SYMBOL_BOOST_CONSTANTS.MIN_TOKEN_LENGTH) {
        continue;
      }
      const pattern = buildMemoizedRegex(escapeRegex(word));
      if (pattern.test(query)) {
        return true;
      }
    }
  }

  return false;
}
