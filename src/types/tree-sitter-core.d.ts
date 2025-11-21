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

  export interface Point {
    row: number;
    column: number;
  }

  export default class Parser {
    setLanguage(language: unknown): void;
    parse(input: string | ((index: number, position?: Point) => string | null)): Tree;
  }
}