import LangBash from 'tree-sitter-bash';
import LangC from 'tree-sitter-c';
import LangCSharp from 'tree-sitter-c-sharp';
import LangCpp from 'tree-sitter-cpp';
import * as LangCSSModule from 'tree-sitter-css/bindings/node/index.js';
const LangCSS = (LangCSSModule as Record<string, unknown>).default || LangCSSModule;
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

function resolveTreeSitterLanguage(module: unknown, preferredKey: string | null = null): unknown {
  if (!module) {
    return null;
  }

  if (typeof module === 'object' && module !== null) {
    const modObj = module as Record<string, unknown>;

    if (modObj.default) {
      return resolveTreeSitterLanguage(modObj.default, preferredKey);
    }

    if (preferredKey && modObj[preferredKey]) {
      return resolveTreeSitterLanguage(modObj[preferredKey], null);
    }

    if (modObj.language && typeof modObj.language === 'object') {
      return module;
    }

    const values = Object.values(modObj);
    for (const value of values) {
      const resolved = resolveTreeSitterLanguage(value, null);
      if (resolved && typeof resolved === 'object' && resolved !== null) {
        const resolvedObj = resolved as Record<string, unknown>;
        if (resolvedObj.language && typeof resolvedObj.language === 'object') {
          return resolved;
        }
      }
    }
  }

  return module;
}

export const RESOLVED_LANGUAGES = {
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