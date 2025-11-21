import { CHUNKING_CONSTANTS } from '../config/constants.js';
import { extractSymbolName } from './symbol-extractor.js';
import {
  extractCodevaultMetadata,
  extractSemanticTags,
  type CodevaultMetadata,
  type ImportantVariable,
  isImportantVariable,
  extractVariableName
} from './metadata.js';
import {
  buildSignature,
  extractCallNameFromSnippet,
  splitSymbolWords,
  type SymbolMetadata
} from '../symbols/extract.js';
import type { TreeSitterNode } from '../types/ast.js';
import type { LanguageRule } from '../languages/rules.js';

export interface UnifiedMetadata {
  symbol: string;
  codevaultMetadata: CodevaultMetadata;
  importantVariables: ImportantVariable[];
  symbolData: SymbolMetadata;
  docComments: string | null;
}

interface ExtractParams {
  node: TreeSitterNode;
  source: string;
  rule: LanguageRule;
  rel: string;
  code: string;
  docComments: string | null;
  symbol?: string;
}

export function extractUnifiedMetadata({
  node,
  source,
  rule,
  rel,
  code,
  docComments,
  symbol: providedSymbol
}: ExtractParams): UnifiedMetadata {
  const symbol = (providedSymbol ?? extractSymbolName(node, source)) || '';

  const metadata = extractCodevaultMetadata(docComments);
  const automaticTags = extractSemanticTags(rel, symbol, code);
  const mergedTags = [...new Set([...metadata.tags, ...automaticTags])];
  metadata.tags = mergedTags;

  const importantVariables: ImportantVariable[] = [];
  const calls = new Set<string>();

  function walk(current: TreeSitterNode): void {
    if (rule.variableTypes && rule.variableTypes.includes(current.type)) {
      const varText = source.slice(current.startIndex, current.endIndex);
      if (isImportantVariable(varText, current.type)) {
        importantVariables.push({
          type: current.type,
          name: extractVariableName(current, source),
          value: varText.length > 100 ? `${varText.substring(0, 100)}...` : varText
        });
      }
    }

    const nodeType = current.type || '';
    if (nodeType.includes('call') || nodeType.includes('invocation')) {
      const snippet = source.slice(
        current.startIndex,
        Math.min(current.endIndex, current.startIndex + CHUNKING_CONSTANTS.MAX_CALL_SNIPPET)
      );
      const callName = extractCallNameFromSnippet(snippet);
      if (callName) {
        calls.add(callName);
      }
    }

    for (let i = 0; i < current.childCount; i++) {
      const child = current.child(i);
      if (child) {
        walk(child);
      }
    }
  }

  walk(node);

  const signatureSnippet = source.slice(
    node.startIndex,
    Math.min(node.endIndex, node.startIndex + CHUNKING_CONSTANTS.MAX_SIGNATURE_SNIPPET)
  );
  const { signature, parameters, returnType } = buildSignature(symbol, signatureSnippet, node);
  const keywords = splitSymbolWords(symbol);

  const symbolData: SymbolMetadata = {
    signature,
    parameters,
    returnType,
    calls: Array.from(calls),
    keywords
  };

  return {
    symbol,
    codevaultMetadata: metadata,
    importantVariables,
    symbolData,
    docComments
  };
}
