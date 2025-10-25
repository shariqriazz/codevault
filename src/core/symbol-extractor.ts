import type { TreeSitterNode } from '../types/ast.js';

export function extractSymbolName(node: TreeSitterNode, source: string): string | null {
  if (node.type === 'function_declaration' || node.type === 'function_definition') {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === 'identifier') {
        return source.slice(child.startIndex, child.endIndex);
      }
    }
  }

  if (node.type === 'method_declaration' || node.type === 'method_definition') {
    function findMethodName(n: TreeSitterNode): string | null {
      if (n.type === 'name' || n.type === 'identifier' || n.type === 'property_identifier') {
        const text = source.slice(n.startIndex, n.endIndex);
        if (!['public', 'private', 'protected', 'static', 'function', 'abstract', 'final'].includes(text)) {
          return text;
        }
      }

      for (let i = 0; i < n.childCount; i++) {
        const child = n.child(i);
        if (child) {
          const result = findMethodName(child);
          if (result) return result;
        }
      }
      return null;
    }

    const methodName = findMethodName(node);
    if (methodName) return methodName;
  }

  if (node.type === 'class_declaration') {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && (child.type === 'identifier' || child.type === 'type_identifier' || child.type === 'name')) {
        const text = source.slice(child.startIndex, child.endIndex);
        if (text !== 'class') {
          return text;
        }
      }
    }
  }

  function findAnyIdentifier(n: TreeSitterNode): string | null {
    if (n.type === 'identifier' || n.type === 'name' || n.type === 'property_identifier') {
      const text = source.slice(n.startIndex, n.endIndex);
      if (!['public', 'private', 'protected', 'static', 'function', 'class', 'abstract', 'final', 'const', 'var', 'let'].includes(text)) {
        return text;
      }
    }

    for (let i = 0; i < n.childCount; i++) {
      const child = n.child(i);
      if (child) {
        const result = findAnyIdentifier(child);
        if (result) return result;
      }
    }
    return null;
  }

  const anyIdentifier = findAnyIdentifier(node);
  if (anyIdentifier) return anyIdentifier;

  const code = source.slice(node.startIndex, node.endIndex);

  const phpMethodMatch = code.match(/(?:public|private|protected)?\s*(?:static)?\s*function\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
  if (phpMethodMatch) return phpMethodMatch[1];

  const jsFunctionMatch = code.match(/function\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
  if (jsFunctionMatch) return jsFunctionMatch[1];

  const jsMethodMatch = code.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*\{/);
  if (jsMethodMatch) return jsMethodMatch[1];

  const classMatch = code.match(/class\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
  if (classMatch) return classMatch[1];

  return `${node.type}_${node.startIndex}`;
}