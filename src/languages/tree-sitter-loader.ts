import LangBash from 'tree-sitter-bash';
import LangC from 'tree-sitter-c';
import LangCSharp from 'tree-sitter-c-sharp';
import LangCpp from 'tree-sitter-cpp';
import * as LangCSSModule from 'tree-sitter-css/bindings/node/index.js';
const LangCSS = ('default' in LangCSSModule ? LangCSSModule.default : LangCSSModule) as TreeSitterLanguage;
import LangElixir from 'tree-sitter-elixir';
import LangGo from 'tree-sitter-go';
import LangHaskell from 'tree-sitter-haskell';
import LangHTML from 'tree-sitter-html';
import LangJava from 'tree-sitter-java';
import LangJS from 'tree-sitter-javascript';
import LangJSON from 'tree-sitter-json';
import LangKotlin from '@tree-sitter-grammars/tree-sitter-kotlin';
import LangMarkdown from '@tree-sitter-grammars/tree-sitter-markdown';
import LangLua from 'tree-sitter-lua';
import LangOCaml from 'tree-sitter-ocaml';
import LangPHP from 'tree-sitter-php';
import LangPython from 'tree-sitter-python';
import LangRuby from 'tree-sitter-ruby';
import LangRust from 'tree-sitter-rust';
import LangScala from 'tree-sitter-scala';
import LangSwift from 'tree-sitter-swift';
import LangTSX from 'tree-sitter-typescript/bindings/node/tsx.js';
import LangTS from 'tree-sitter-typescript/bindings/node/typescript.js';

export interface TreeSitterLanguage {
  language: unknown;
  [key: string]: unknown;
}

function resolveTreeSitterLanguage(module: unknown, preferredKey: string | null = null): TreeSitterLanguage | null {
  if (!module) {
    return null;
  }

  // Check if module is an object with properties we can access
  if (typeof module === 'object' && module !== null) {
    const moduleObj = module as Record<string, unknown>;

    // Check for default export
    if ('default' in moduleObj && moduleObj.default) {
      return resolveTreeSitterLanguage(moduleObj.default, preferredKey);
    }

    // Check for preferred key
    if (preferredKey && preferredKey in moduleObj && moduleObj[preferredKey]) {
      return resolveTreeSitterLanguage(moduleObj[preferredKey], null);
    }

    // Check if this object has a language property
    if ('language' in moduleObj && typeof moduleObj.language === 'object') {
      return moduleObj as TreeSitterLanguage;
    }

    // Search through object values
    const values = Object.values(moduleObj);
    for (const value of values) {
      const resolved = resolveTreeSitterLanguage(value, null);
      if (resolved && 'language' in resolved && typeof resolved.language === 'object') {
        return resolved;
      }
    }
  }

  // Return the module as-is if it looks like a language object
  if (typeof module === 'object' && module !== null) {
    return module as TreeSitterLanguage;
  }

  return null;
}

export const RESOLVED_LANGUAGES: Record<string, TreeSitterLanguage | null> = {
  bash: resolveTreeSitterLanguage(LangBash),
  c: resolveTreeSitterLanguage(LangC),
  csharp: resolveTreeSitterLanguage(LangCSharp),
  cpp: resolveTreeSitterLanguage(LangCpp),
  css: resolveTreeSitterLanguage(LangCSS),
  elixir: resolveTreeSitterLanguage(LangElixir),
  go: resolveTreeSitterLanguage(LangGo),
  haskell: resolveTreeSitterLanguage(LangHaskell),
  html: resolveTreeSitterLanguage(LangHTML),
  java: resolveTreeSitterLanguage(LangJava),
  javascript: resolveTreeSitterLanguage(LangJS, 'javascript'),
  json: resolveTreeSitterLanguage(LangJSON),
  kotlin: resolveTreeSitterLanguage(LangKotlin),
  lua: resolveTreeSitterLanguage(LangLua),
  markdown: resolveTreeSitterLanguage(LangMarkdown),
  ocaml: resolveTreeSitterLanguage(LangOCaml, 'ocaml'),
  php: resolveTreeSitterLanguage(LangPHP, 'php'),
  python: resolveTreeSitterLanguage(LangPython),
  ruby: resolveTreeSitterLanguage(LangRuby),
  rust: resolveTreeSitterLanguage(LangRust),
  scala: resolveTreeSitterLanguage(LangScala),
  swift: resolveTreeSitterLanguage(LangSwift),
  tsx: resolveTreeSitterLanguage(LangTSX),
  typescript: resolveTreeSitterLanguage(LangTS)
};