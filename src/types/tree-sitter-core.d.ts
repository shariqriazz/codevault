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

  export interface Language {
    [key: string]: unknown;
  }

  export default class Parser {
    setLanguage(language: Language): void;
    parse(input: string | ((index: number, position?: { row: number; column: number }) => string | null)): Tree;
  }

  export namespace Parser {
    export { Language };
  }
}