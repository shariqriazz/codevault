declare module 'tree-sitter' {
  export interface SyntaxNode {
    type: string;
    startIndex: number;
    endIndex: number;
    childCount: number;
    child(index: number): SyntaxNode | null;
    id: number;
  }

  export interface Tree {
    rootNode: SyntaxNode;
  }

  export default class Parser {
    setLanguage(language: any): void;
    parse(input: string | ((index: number, position?: any) => string | null)): Tree;
  }
}