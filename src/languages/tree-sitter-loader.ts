import Parser from 'tree-sitter';
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
 * @returns The resolved language module or null if not found
 */
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
function resolveTreeSitterLanguage(module: unknown, preferredKey: string | null = null): Parser.Language | null {
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
  if (!module) {
    return null;
  }

  // Check if module is an object
  if (typeof module !== 'object' || module === null) {
    return null;
  }

  const langModule = module as LanguageModule;

  // Check for default export
  if ('default' in langModule && langModule.default !== undefined) {
    const resolved = resolveTreeSitterLanguage(langModule.default, preferredKey);
    if (resolved) return resolved;
  }

  // Check for preferred key
  if (preferredKey && preferredKey in langModule && langModule[preferredKey] !== undefined) {
    const resolved = resolveTreeSitterLanguage(langModule[preferredKey], null);
    if (resolved) return resolved;
  }

  // Check if this module has a language property
  if ('language' in langModule && typeof langModule.language === 'object' && langModule.language !== null) {
    return langModule.language as Parser.Language;
  }

  // Check if this module itself looks like a language object (has name property)
  // Some tree-sitter modules export the language object directly
  if ('name' in langModule && typeof langModule.name === 'string') {
    return langModule as unknown as Parser.Language;
  }

  // Search through all values for a language object
  const values = Object.values(langModule);
  for (const value of values) {
    const resolved = resolveTreeSitterLanguage(value, null);
    if (resolved) {
      return resolved;
    }
  }

  return null;
/* eslint-enable @typescript-eslint/no-unsafe-assignment */
}

/**
 * Helper function to safely resolve a language or throw an error.
 */
function resolveLanguageOrThrow(module: unknown, languageName: string, preferredKey?: string): Parser.Language {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const resolved = resolveTreeSitterLanguage(module, preferredKey ?? null);
  if (!resolved) {
    throw new Error(`Failed to resolve tree-sitter language: ${languageName}`);
  }
  return resolved;
}

/**
 * Resolved tree-sitter language objects for all supported languages.
 * These can be passed directly to Parser.setLanguage().
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
export const RESOLVED_LANGUAGES: Record<string, Parser.Language> = {
  bash: resolveLanguageOrThrow(LangBash, 'bash'),
  c: resolveLanguageOrThrow(LangC, 'c'),
  csharp: resolveLanguageOrThrow(LangCSharp, 'csharp'),
  cpp: resolveLanguageOrThrow(LangCpp, 'cpp'),
  css: resolveLanguageOrThrow(LangCSS, 'css'),
  elixir: resolveLanguageOrThrow(LangElixir, 'elixir'),
  go: resolveLanguageOrThrow(LangGo, 'go'),
  haskell: resolveLanguageOrThrow(LangHaskell, 'haskell'),
  html: resolveLanguageOrThrow(LangHTML, 'html'),
  java: resolveLanguageOrThrow(LangJava, 'java'),
  javascript: resolveLanguageOrThrow(LangJS, 'javascript', 'javascript'),
  json: resolveLanguageOrThrow(LangJSON, 'json'),
  kotlin: resolveLanguageOrThrow(LangKotlin, 'kotlin'),
  lua: resolveLanguageOrThrow(LangLua, 'lua'),
  markdown: resolveLanguageOrThrow(LangMarkdown, 'markdown'),
  ocaml: resolveLanguageOrThrow(LangOCaml, 'ocaml', 'ocaml'),
  php: resolveLanguageOrThrow(LangPHP, 'php', 'php'),
  python: resolveLanguageOrThrow(LangPython, 'python'),
  ruby: resolveLanguageOrThrow(LangRuby, 'ruby'),
  rust: resolveLanguageOrThrow(LangRust, 'rust'),
  scala: resolveLanguageOrThrow(LangScala, 'scala'),
  swift: resolveLanguageOrThrow(LangSwift, 'swift'),
  tsx: resolveLanguageOrThrow(LangTSX, 'tsx'),
  typescript: resolveLanguageOrThrow(LangTS, 'typescript')
};
/* eslint-enable @typescript-eslint/no-unsafe-assignment */