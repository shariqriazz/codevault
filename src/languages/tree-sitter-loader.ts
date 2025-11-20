import type Parser from 'tree-sitter';
import LangBash from 'tree-sitter-bash';
import LangC from 'tree-sitter-c';
import LangCSharp from 'tree-sitter-c-sharp';
import LangCpp from 'tree-sitter-cpp';
import * as LangCSSModule from 'tree-sitter-css/bindings/node/index.js';
const LangCSS = (LangCSSModule as { default?: unknown }).default ?? LangCSSModule;
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

/**
 * Type representing a tree-sitter language module.
 * Tree-sitter modules can be exported in various forms (default export, named export, or nested).
 */
interface LanguageModule {
  language?: Parser.Language;
  default?: unknown;
  [key: string]: unknown;
}

/**
 * Recursively resolves a tree-sitter language module to extract the Language object.
 * Handles various module export patterns (default, named, nested).
 *
 * @param module - The module to resolve
 * @param preferredKey - Optional key to check first when resolving
 * @returns The resolved language module
 */
function resolveTreeSitterLanguage(module: unknown, preferredKey: string | null = null): unknown {
  if (!module) {
    return module;
  }

  // Check if module is an object
  if (typeof module !== 'object' || module === null) {
    return module;
  }

  const langModule = module as LanguageModule;

  // Check for default export
  if ('default' in langModule && langModule.default !== undefined) {
    return resolveTreeSitterLanguage(langModule.default, preferredKey);
  }

  // Check for preferred key
  if (preferredKey && preferredKey in langModule && langModule[preferredKey] !== undefined) {
    return resolveTreeSitterLanguage(langModule[preferredKey], null);
  }

  // Check if this module has a language property
  if ('language' in langModule && typeof langModule.language === 'object' && langModule.language !== null) {
    return langModule;
  }

  // Search through all values for a language object
  const values = Object.values(langModule);
  for (const value of values) {
    const resolved = resolveTreeSitterLanguage(value, null);
    if (resolved && typeof resolved === 'object' && resolved !== null) {
      const resolvedModule = resolved as LanguageModule;
      if ('language' in resolvedModule && typeof resolvedModule.language === 'object' && resolvedModule.language !== null) {
        return resolved;
      }
    }
  }

  return module;
}

/**
 * Resolved tree-sitter language objects for all supported languages.
 * These can be passed directly to Parser.setLanguage().
 */
export const RESOLVED_LANGUAGES: Record<string, Parser.Language> = {
  bash: resolveTreeSitterLanguage(LangBash) as Parser.Language,
  c: resolveTreeSitterLanguage(LangC) as Parser.Language,
  csharp: resolveTreeSitterLanguage(LangCSharp) as Parser.Language,
  cpp: resolveTreeSitterLanguage(LangCpp) as Parser.Language,
  css: resolveTreeSitterLanguage(LangCSS) as Parser.Language,
  elixir: resolveTreeSitterLanguage(LangElixir) as Parser.Language,
  go: resolveTreeSitterLanguage(LangGo) as Parser.Language,
  haskell: resolveTreeSitterLanguage(LangHaskell) as Parser.Language,
  html: resolveTreeSitterLanguage(LangHTML) as Parser.Language,
  java: resolveTreeSitterLanguage(LangJava) as Parser.Language,
  javascript: resolveTreeSitterLanguage(LangJS, 'javascript') as Parser.Language,
  json: resolveTreeSitterLanguage(LangJSON) as Parser.Language,
  kotlin: resolveTreeSitterLanguage(LangKotlin) as Parser.Language,
  lua: resolveTreeSitterLanguage(LangLua) as Parser.Language,
  markdown: resolveTreeSitterLanguage(LangMarkdown) as Parser.Language,
  ocaml: resolveTreeSitterLanguage(LangOCaml, 'ocaml') as Parser.Language,
  php: resolveTreeSitterLanguage(LangPHP, 'php') as Parser.Language,
  python: resolveTreeSitterLanguage(LangPython) as Parser.Language,
  ruby: resolveTreeSitterLanguage(LangRuby) as Parser.Language,
  rust: resolveTreeSitterLanguage(LangRust) as Parser.Language,
  scala: resolveTreeSitterLanguage(LangScala) as Parser.Language,
  swift: resolveTreeSitterLanguage(LangSwift) as Parser.Language,
  tsx: resolveTreeSitterLanguage(LangTSX) as Parser.Language,
  typescript: resolveTreeSitterLanguage(LangTS) as Parser.Language
};