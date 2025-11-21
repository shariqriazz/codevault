import type { LanguageRule } from '../languages/rules.js';
import type { TreeSitterNode } from '../types/ast.js';

export interface CodevaultMetadata {
  tags: string[];
  intent: string | null;
  description: string | null;
}

export function extractCodevaultMetadata(commentText: string | null): CodevaultMetadata {
  const metadata: CodevaultMetadata = {
    tags: [],
    intent: null,
    description: null
  };

  if (!commentText) return metadata;

  const tagsMatch = commentText.match(/@codevault-tags:\s*([^\n]+)/);
  if (tagsMatch) {
    metadata.tags = tagsMatch[1].split(',').map(tag => tag.trim());
  }

  const intentMatch = commentText.match(/@codevault-intent:\s*([^\n]+)/);
  if (intentMatch) {
    metadata.intent = intentMatch[1].trim();
  }

  const descMatch = commentText.match(/@codevault-description:\s*([^\n]+)/);
  if (descMatch) {
    metadata.description = descMatch[1].trim();
  }

  return metadata;
}

export function extractSemanticTags(filePath: string, symbolName: string | null, code: string): string[] {
  const tags = new Set<string>();

  const pathParts = filePath.split('/').map(part => part.replace(/\.(php|js|ts|tsx)$/, ''));
  pathParts.forEach(part => {
    const words = part.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[\s_-]+/);
    words.forEach(word => {
      if (word.length > 2) {
        tags.add(word);
      }
    });
  });

  if (symbolName) {
    const symbolWords = symbolName
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[\s_-]+/);

    symbolWords.forEach(word => {
      if (word.length > 2) {
        tags.add(word);
      }
    });
  }

  const technicalKeywords = [
    'stripe', 'payment', 'session', 'checkout', 'purchase',
    'auth', 'authentication', 'login', 'register', 'middleware',
    'database', 'connection', 'pool', 'config', 'service',
    'controller', 'model', 'repository', 'test', 'api',
    'customer', 'user', 'admin', 'notification', 'email',
    'validation', 'request', 'response', 'http', 'route'
  ];

  const codeText = code.toLowerCase();
  technicalKeywords.forEach(keyword => {
    if (codeText.includes(keyword)) {
      tags.add(keyword);
    }
  });

  const patterns = [
    /class\s+(\w+)/gi,
    /function\s+(\w+)/gi,
    /const\s+(\w+)/gi,
    /interface\s+(\w+)/gi,
    /trait\s+(\w+)/gi
  ];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const name = match[1];
      const words = name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[\s_-]+/);
      words.forEach(word => {
        if (word.length > 2) {
          tags.add(word);
        }
      });
    }
  });

  return Array.from(tags).slice(0, 10);
}

export interface ImportantVariable {
  type: string;
  name: string;
  value: string;
}

export function extractImportantVariables(node: TreeSitterNode, source: string, rule: LanguageRule): ImportantVariable[] {
  const variables: ImportantVariable[] = [];

  function walkForVariables(n: TreeSitterNode): void {
    if (rule.variableTypes && rule.variableTypes.includes(n.type)) {
      const varText = source.slice(n.startIndex, n.endIndex);

      if (isImportantVariable(varText, n.type)) {
        variables.push({
          type: n.type,
          name: extractVariableName(n, source),
          value: varText.length > 100 ? `${varText.substring(0, 100)  }...` : varText
        });
      }
    }

    for (let i = 0; i < n.childCount; i++) {
      const child = n.child(i);
      if (child) {
        walkForVariables(child);
      }
    }
  }

  walkForVariables(node);
  return variables;
}

export function isImportantVariable(varText: string, nodeType: string): boolean {
  const importantPatterns = [
    /const\s+\w*(config|setting|option|endpoint|url|key|secret|token)\w*/i,
    /const\s+\w*(api|service|client|provider)\w*/i,
    /const\s+[A-Z_]{3,}/,
    /export\s+const/,
    /static\s+(final\s+)?[A-Z_]+/,
  ];

  return importantPatterns.some(pattern => pattern.test(varText));
}

export function extractVariableName(node: TreeSitterNode, source: string): string {
  function findIdentifier(n: TreeSitterNode): string | null {
    if (n.type === 'identifier' || n.type === 'type_identifier') {
      return source.slice(n.startIndex, n.endIndex);
    }

    for (let i = 0; i < n.childCount; i++) {
      const child = n.child(i);
      if (child) {
        const result = findIdentifier(child);
        if (result) return result;
      }
    }

    return null;
  }

  return findIdentifier(node) || 'unknown';
}

export function extractDocComments(source: string, node: TreeSitterNode, rule: LanguageRule): string | null {
  const commentPattern = rule.commentPattern;
  if (!commentPattern) return null;

  const beforeNode = source.slice(Math.max(0, node.startIndex - 500), node.startIndex);
  const comments = beforeNode.match(commentPattern);

  if (comments && comments.length > 0) {
    return comments[comments.length - 1];
  }

  return null;
}

export function generateEnhancedEmbeddingText(
  code: string,
  metadata: CodevaultMetadata,
  variables: ImportantVariable[],
  docComments: string | null
): string {
  let enhancedText = code;

  if (docComments) {
    enhancedText = `${docComments  }\n\n${  enhancedText}`;
  }

  if (metadata.intent) {
    enhancedText += `\n\n// Intent: ${metadata.intent}`;
  }

  if (metadata.description) {
    enhancedText += `\n\n// Description: ${metadata.description}`;
  }

  if (metadata.tags.length > 0) {
    enhancedText += `\n\n// Tags: ${metadata.tags.join(', ')}`;
  }

  if (variables.length > 0) {
    const varNames = variables.map(v => v.name).join(', ');
    enhancedText += `\n\n// Uses variables: ${varNames}`;
  }

  return enhancedText;
}
