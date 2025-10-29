import LangBash from 'tree-sitter-bash';
import LangC from 'tree-sitter-c';
import LangCSharp from 'tree-sitter-c-sharp';
import LangCpp from 'tree-sitter-cpp';
import LangCSS from 'tree-sitter-css/bindings/node/index.js';
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

function resolveTreeSitterLanguage(module: any, preferredKey: string | null = null): any {
  if (!module) {
    return null;
  }

  if (module.default) {
    return resolveTreeSitterLanguage(module.default, preferredKey);
  }

  if (preferredKey && module[preferredKey]) {
    return resolveTreeSitterLanguage(module[preferredKey], null);
  }

  if (typeof module === 'object' && module !== null) {
    if (module.language && typeof module.language === 'object') {
      return module;
    }

    const values = Object.values(module);
    for (const value of values) {
      const resolved = resolveTreeSitterLanguage(value, null);
      if (resolved && resolved.language && typeof resolved.language === 'object') {
        return resolved;
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