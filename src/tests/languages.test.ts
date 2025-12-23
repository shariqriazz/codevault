import test from 'node:test';
import assert from 'node:assert/strict';
import { LANG_RULES, getSupportedLanguageExtensions, type LanguageRule } from '../languages/rules.js';
import { RESOLVED_LANGUAGES } from '../languages/tree-sitter-loader.js';

// ============================================================================
// Test: RESOLVED_LANGUAGES - Tree-sitter parser loading
// ============================================================================

test('RESOLVED_LANGUAGES contains all expected language parsers', () => {
  const expectedLanguages = [
    'bash', 'c', 'csharp', 'cpp', 'css', 'elixir', 'go', 'haskell',
    'html', 'java', 'javascript', 'json', 'kotlin', 'lua', 'markdown',
    'ocaml', 'php', 'python', 'ruby', 'rust', 'scala', 'swift', 'tsx', 'typescript'
  ];

  for (const lang of expectedLanguages) {
    assert.ok(
      lang in RESOLVED_LANGUAGES,
      `RESOLVED_LANGUAGES should contain '${lang}'`
    );
  }
});

test('RESOLVED_LANGUAGES parsers are non-null objects', () => {
  for (const [lang, parser] of Object.entries(RESOLVED_LANGUAGES)) {
    assert.ok(
      parser !== null && parser !== undefined,
      `Parser for '${lang}' should not be null or undefined`
    );
    assert.equal(
      typeof parser,
      'object',
      `Parser for '${lang}' should be an object`
    );
  }
});

test('RESOLVED_LANGUAGES count matches expected number of languages', () => {
  const languageCount = Object.keys(RESOLVED_LANGUAGES).length;
  assert.equal(
    languageCount,
    24,
    `RESOLVED_LANGUAGES should contain 24 languages, got ${languageCount}`
  );
});

// ============================================================================
// Test: LANG_RULES - Language rules structure
// ============================================================================

test('LANG_RULES contains rules for all expected file extensions', () => {
  const expectedExtensions = [
    '.php', '.py', '.js', '.jsx', '.ts', '.tsx', '.go', '.java', '.cs',
    '.rs', '.rb', '.cpp', '.hpp', '.cc', '.c', '.h', '.scala', '.swift',
    '.sh', '.bash', '.kt', '.lua', '.html', '.htm', '.css', '.json',
    '.ml', '.mli', '.hs', '.ex', '.exs', '.md', '.markdown'
  ];

  for (const ext of expectedExtensions) {
    assert.ok(
      ext in LANG_RULES,
      `LANG_RULES should contain rule for extension '${ext}'`
    );
  }
});

test('Each LANG_RULES entry has required properties', () => {
  for (const [ext, rule] of Object.entries(LANG_RULES)) {
    assert.ok(
      typeof rule.lang === 'string' && rule.lang.length > 0,
      `Rule for '${ext}' should have non-empty 'lang' string`
    );
    assert.ok(
      Array.isArray(rule.nodeTypes),
      `Rule for '${ext}' should have 'nodeTypes' array`
    );
    assert.ok(
      rule.nodeTypes.length > 0,
      `Rule for '${ext}' should have at least one nodeType`
    );
    assert.ok(
      'commentPattern' in rule,
      `Rule for '${ext}' should have 'commentPattern' property`
    );
    assert.ok(
      rule.commentPattern === null || rule.commentPattern instanceof RegExp,
      `Rule for '${ext}' commentPattern should be null or RegExp`
    );
    assert.ok(
      'ts' in rule,
      `Rule for '${ext}' should have 'ts' property for tree-sitter parser`
    );
  }
});

test('Each LANG_RULES entry has valid subdivisionTypes', () => {
  for (const [ext, rule] of Object.entries(LANG_RULES)) {
    if (rule.subdivisionTypes) {
      assert.ok(
        typeof rule.subdivisionTypes === 'object',
        `Rule for '${ext}' subdivisionTypes should be an object`
      );
      for (const [nodeType, subTypes] of Object.entries(rule.subdivisionTypes)) {
        assert.ok(
          Array.isArray(subTypes),
          `subdivisionTypes['${nodeType}'] for '${ext}' should be an array`
        );
      }
    }
  }
});

test('Each LANG_RULES entry has valid variableTypes', () => {
  for (const [ext, rule] of Object.entries(LANG_RULES)) {
    if (rule.variableTypes) {
      assert.ok(
        Array.isArray(rule.variableTypes),
        `Rule for '${ext}' variableTypes should be an array`
      );
    }
  }
});

// ============================================================================
// Test: Language detection via file extension mapping
// ============================================================================

test('File extension maps to correct language name', () => {
  const extensionToLang: Record<string, string> = {
    '.php': 'php',
    '.py': 'python',
    '.js': 'javascript',
    '.jsx': 'tsx',
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.go': 'go',
    '.java': 'java',
    '.cs': 'csharp',
    '.rs': 'rust',
    '.rb': 'ruby',
    '.cpp': 'cpp',
    '.hpp': 'cpp',
    '.cc': 'cpp',
    '.c': 'c',
    '.h': 'c',
    '.scala': 'scala',
    '.swift': 'swift',
    '.sh': 'bash',
    '.bash': 'bash',
    '.kt': 'kotlin',
    '.lua': 'lua',
    '.html': 'html',
    '.htm': 'html',
    '.css': 'css',
    '.json': 'json',
    '.ml': 'ocaml',
    '.mli': 'ocaml',
    '.hs': 'haskell',
    '.ex': 'elixir',
    '.exs': 'elixir',
    '.md': 'markdown',
    '.markdown': 'markdown'
  };

  for (const [ext, expectedLang] of Object.entries(extensionToLang)) {
    const rule = LANG_RULES[ext];
    assert.ok(rule, `Rule for extension '${ext}' should exist`);
    assert.equal(
      rule.lang,
      expectedLang,
      `Extension '${ext}' should map to language '${expectedLang}', got '${rule.lang}'`
    );
  }
});

test('Aliases map to same tree-sitter parser', () => {
  // C++ extensions should use same parser
  assert.strictEqual(
    LANG_RULES['.cpp'].ts,
    LANG_RULES['.hpp'].ts,
    '.cpp and .hpp should use same parser'
  );
  assert.strictEqual(
    LANG_RULES['.cpp'].ts,
    LANG_RULES['.cc'].ts,
    '.cpp and .cc should use same parser'
  );

  // C extensions should use same parser
  assert.strictEqual(
    LANG_RULES['.c'].ts,
    LANG_RULES['.h'].ts,
    '.c and .h should use same parser'
  );

  // Bash extensions should use same parser
  assert.strictEqual(
    LANG_RULES['.sh'].ts,
    LANG_RULES['.bash'].ts,
    '.sh and .bash should use same parser'
  );

  // HTML extensions should use same parser
  assert.strictEqual(
    LANG_RULES['.html'].ts,
    LANG_RULES['.htm'].ts,
    '.html and .htm should use same parser'
  );

  // Markdown extensions should use same parser
  assert.strictEqual(
    LANG_RULES['.md'].ts,
    LANG_RULES['.markdown'].ts,
    '.md and .markdown should use same parser'
  );

  // Elixir extensions should use same parser
  assert.strictEqual(
    LANG_RULES['.ex'].ts,
    LANG_RULES['.exs'].ts,
    '.ex and .exs should use same parser'
  );

  // OCaml extensions should use same parser
  assert.strictEqual(
    LANG_RULES['.ml'].ts,
    LANG_RULES['.mli'].ts,
    '.ml and .mli should use same parser'
  );
});

// ============================================================================
// Test: Parsing rule correctness for specific languages
// ============================================================================

test('JavaScript rule has correct node types for functions and classes', () => {
  const jsRule = LANG_RULES['.js'];
  assert.ok(jsRule.nodeTypes.includes('function_declaration'));
  assert.ok(jsRule.nodeTypes.includes('method_definition'));
  assert.ok(jsRule.nodeTypes.includes('class_declaration'));
  assert.ok(jsRule.nodeTypes.includes('export_statement'));
});

test('TypeScript rule has correct node types', () => {
  const tsRule = LANG_RULES['.ts'];
  assert.ok(tsRule.nodeTypes.includes('function_declaration'));
  assert.ok(tsRule.nodeTypes.includes('method_definition'));
  assert.ok(tsRule.nodeTypes.includes('class_declaration'));
  assert.ok(tsRule.nodeTypes.includes('export_statement'));
  assert.ok(tsRule.nodeTypes.includes('lexical_declaration'));
});

test('Python rule has correct node types', () => {
  const pyRule = LANG_RULES['.py'];
  assert.ok(pyRule.nodeTypes.includes('function_definition'));
  assert.ok(pyRule.nodeTypes.includes('class_definition'));
});

test('Go rule has correct node types', () => {
  const goRule = LANG_RULES['.go'];
  assert.ok(goRule.nodeTypes.includes('function_declaration'));
  assert.ok(goRule.nodeTypes.includes('method_declaration'));
  assert.ok(goRule.nodeTypes.includes('type_declaration'));
});

test('Rust rule has correct node types for items', () => {
  const rsRule = LANG_RULES['.rs'];
  assert.ok(rsRule.nodeTypes.includes('function_item'));
  assert.ok(rsRule.nodeTypes.includes('impl_item'));
  assert.ok(rsRule.nodeTypes.includes('struct_item'));
  assert.ok(rsRule.nodeTypes.includes('enum_item'));
  assert.ok(rsRule.nodeTypes.includes('trait_item'));
  assert.ok(rsRule.nodeTypes.includes('mod_item'));
});

test('Java rule has correct node types', () => {
  const javaRule = LANG_RULES['.java'];
  assert.ok(javaRule.nodeTypes.includes('method_declaration'));
  assert.ok(javaRule.nodeTypes.includes('class_declaration'));
  assert.ok(javaRule.nodeTypes.includes('interface_declaration'));
});

test('C# rule has correct node types', () => {
  const csRule = LANG_RULES['.cs'];
  assert.ok(csRule.nodeTypes.includes('method_declaration'));
  assert.ok(csRule.nodeTypes.includes('class_declaration'));
  assert.ok(csRule.nodeTypes.includes('struct_declaration'));
  assert.ok(csRule.nodeTypes.includes('interface_declaration'));
});

test('Ruby rule has correct node types', () => {
  const rbRule = LANG_RULES['.rb'];
  assert.ok(rbRule.nodeTypes.includes('method'));
  assert.ok(rbRule.nodeTypes.includes('class'));
  assert.ok(rbRule.nodeTypes.includes('module'));
  assert.ok(rbRule.nodeTypes.includes('singleton_method'));
});

// ============================================================================
// Test: Comment patterns for different languages
// ============================================================================

test('JSDoc-style comment patterns match correctly', () => {
  const jsdocPattern = LANG_RULES['.js'].commentPattern;
  assert.ok(jsdocPattern !== null);

  const jsdocComment = '/** This is a JSDoc comment */';
  const matches = jsdocComment.match(jsdocPattern as RegExp);
  assert.ok(matches !== null, 'Should match JSDoc comments');
  assert.equal(matches[0], jsdocComment);
});

test('Python docstring pattern matches correctly', () => {
  const pyPattern = LANG_RULES['.py'].commentPattern;
  assert.ok(pyPattern !== null);

  const tripleDoubleQuote = '"""This is a docstring"""';
  const tripleSingleQuote = "'''This is also a docstring'''";

  assert.ok(tripleDoubleQuote.match(pyPattern as RegExp) !== null);
  assert.ok(tripleSingleQuote.match(pyPattern as RegExp) !== null);
});

test('Ruby comment pattern matches correctly', () => {
  const rbPattern = LANG_RULES['.rb'].commentPattern;
  assert.ok(rbPattern !== null);

  const rubyComment = '# This is a Ruby comment';
  const matches = rubyComment.match(rbPattern as RegExp);
  assert.ok(matches !== null, 'Should match Ruby line comments');
});

test('Haskell comment pattern matches correctly', () => {
  const hsPattern = LANG_RULES['.hs'].commentPattern;
  assert.ok(hsPattern !== null);

  const haskellComment = '-- This is a Haskell comment';
  const matches = haskellComment.match(hsPattern as RegExp);
  assert.ok(matches !== null, 'Should match Haskell line comments');
});

test('Lua comment pattern matches correctly', () => {
  const luaPattern = LANG_RULES['.lua'].commentPattern;
  assert.ok(luaPattern !== null);

  const luaComment = '-- This is a Lua comment';
  const matches = luaComment.match(luaPattern as RegExp);
  assert.ok(matches !== null, 'Should match Lua line comments');
});

test('OCaml comment pattern matches correctly', () => {
  const mlPattern = LANG_RULES['.ml'].commentPattern;
  assert.ok(mlPattern !== null);

  const ocamlComment = '(* This is an OCaml comment *)';
  const matches = ocamlComment.match(mlPattern as RegExp);
  assert.ok(matches !== null, 'Should match OCaml block comments');
});

test('HTML comment pattern matches correctly', () => {
  const htmlPattern = LANG_RULES['.html'].commentPattern;
  assert.ok(htmlPattern !== null);

  const htmlComment = '<!-- This is an HTML comment -->';
  const matches = htmlComment.match(htmlPattern as RegExp);
  assert.ok(matches !== null, 'Should match HTML comments');
});

test('JSON has null comment pattern (no comments)', () => {
  const jsonRule = LANG_RULES['.json'];
  assert.strictEqual(
    jsonRule.commentPattern,
    null,
    'JSON should have null comment pattern'
  );
});

// ============================================================================
// Test: Subdivision types for semantic chunking
// ============================================================================

test('JavaScript class subdivides into methods and fields', () => {
  const jsRule = LANG_RULES['.js'];
  assert.ok(jsRule.subdivisionTypes);
  const classSubdivisions = jsRule.subdivisionTypes['class_declaration'];
  assert.ok(Array.isArray(classSubdivisions));
  assert.ok(classSubdivisions.includes('method_definition'));
  assert.ok(classSubdivisions.includes('field_definition'));
});

test('Python class subdivides into functions', () => {
  const pyRule = LANG_RULES['.py'];
  assert.ok(pyRule.subdivisionTypes);
  const classSubdivisions = pyRule.subdivisionTypes['class_definition'];
  assert.ok(Array.isArray(classSubdivisions));
  assert.ok(classSubdivisions.includes('function_definition'));
});

test('Go type declaration subdivides into methods', () => {
  const goRule = LANG_RULES['.go'];
  assert.ok(goRule.subdivisionTypes);
  const typeSubdivisions = goRule.subdivisionTypes['type_declaration'];
  assert.ok(Array.isArray(typeSubdivisions));
  assert.ok(typeSubdivisions.includes('method_declaration'));
});

test('Rust impl item subdivides into functions', () => {
  const rsRule = LANG_RULES['.rs'];
  assert.ok(rsRule.subdivisionTypes);
  const implSubdivisions = rsRule.subdivisionTypes['impl_item'];
  assert.ok(Array.isArray(implSubdivisions));
  assert.ok(implSubdivisions.includes('function_item'));
});

test('Java class subdivides into methods, constructors, and fields', () => {
  const javaRule = LANG_RULES['.java'];
  assert.ok(javaRule.subdivisionTypes);
  const classSubdivisions = javaRule.subdivisionTypes['class_declaration'];
  assert.ok(Array.isArray(classSubdivisions));
  assert.ok(classSubdivisions.includes('method_declaration'));
  assert.ok(classSubdivisions.includes('constructor_declaration'));
  assert.ok(classSubdivisions.includes('field_declaration'));
});

test('C# class subdivides into methods, properties, and fields', () => {
  const csRule = LANG_RULES['.cs'];
  assert.ok(csRule.subdivisionTypes);
  const classSubdivisions = csRule.subdivisionTypes['class_declaration'];
  assert.ok(Array.isArray(classSubdivisions));
  assert.ok(classSubdivisions.includes('method_declaration'));
  assert.ok(classSubdivisions.includes('property_declaration'));
  assert.ok(classSubdivisions.includes('field_declaration'));
});

test('Ruby class subdivides into methods', () => {
  const rbRule = LANG_RULES['.rb'];
  assert.ok(rbRule.subdivisionTypes);
  const classSubdivisions = rbRule.subdivisionTypes['class'];
  assert.ok(Array.isArray(classSubdivisions));
  assert.ok(classSubdivisions.includes('method'));
  assert.ok(classSubdivisions.includes('singleton_method'));
});

test('Markdown section subdivides into headings, paragraphs, and code blocks', () => {
  const mdRule = LANG_RULES['.md'];
  assert.ok(mdRule.subdivisionTypes);
  const sectionSubdivisions = mdRule.subdivisionTypes['section'];
  assert.ok(Array.isArray(sectionSubdivisions));
  assert.ok(sectionSubdivisions.includes('atx_heading'));
  assert.ok(sectionSubdivisions.includes('paragraph'));
  assert.ok(sectionSubdivisions.includes('fenced_code_block'));
});

// ============================================================================
// Test: Variable types for each language
// ============================================================================

test('JavaScript variable types are correct', () => {
  const jsRule = LANG_RULES['.js'];
  assert.ok(Array.isArray(jsRule.variableTypes));
  assert.ok(jsRule.variableTypes?.includes('const_declaration'));
  assert.ok(jsRule.variableTypes?.includes('let_declaration'));
  assert.ok(jsRule.variableTypes?.includes('variable_declaration'));
});

test('Python variable types are correct', () => {
  const pyRule = LANG_RULES['.py'];
  assert.ok(Array.isArray(pyRule.variableTypes));
  assert.ok(pyRule.variableTypes?.includes('assignment'));
  assert.ok(pyRule.variableTypes?.includes('expression_statement'));
});

test('Rust variable types are correct', () => {
  const rsRule = LANG_RULES['.rs'];
  assert.ok(Array.isArray(rsRule.variableTypes));
  assert.ok(rsRule.variableTypes?.includes('let_declaration'));
  assert.ok(rsRule.variableTypes?.includes('const_item'));
  assert.ok(rsRule.variableTypes?.includes('static_item'));
});

test('Go variable types are correct', () => {
  const goRule = LANG_RULES['.go'];
  assert.ok(Array.isArray(goRule.variableTypes));
  assert.ok(goRule.variableTypes?.includes('const_declaration'));
  assert.ok(goRule.variableTypes?.includes('var_declaration'));
  assert.ok(goRule.variableTypes?.includes('short_var_declaration'));
});

test('HTML and CSS have empty variable types', () => {
  const htmlRule = LANG_RULES['.html'];
  const cssRule = LANG_RULES['.css'];

  assert.ok(Array.isArray(htmlRule.variableTypes));
  assert.equal(htmlRule.variableTypes?.length, 0);

  assert.ok(Array.isArray(cssRule.variableTypes));
  assert.equal(cssRule.variableTypes?.length, 0);
});

// ============================================================================
// Test: getSupportedLanguageExtensions function
// ============================================================================

test('getSupportedLanguageExtensions returns all extension keys', () => {
  const extensions = getSupportedLanguageExtensions();
  const ruleKeys = Object.keys(LANG_RULES);

  assert.deepEqual(
    extensions.sort(),
    ruleKeys.sort(),
    'getSupportedLanguageExtensions should return all LANG_RULES keys'
  );
});

test('getSupportedLanguageExtensions returns array of strings', () => {
  const extensions = getSupportedLanguageExtensions();

  assert.ok(Array.isArray(extensions));
  for (const ext of extensions) {
    assert.equal(typeof ext, 'string');
    assert.ok(ext.startsWith('.'), `Extension '${ext}' should start with '.'`);
  }
});

test('getSupportedLanguageExtensions includes common file extensions', () => {
  const extensions = getSupportedLanguageExtensions();

  const commonExtensions = ['.js', '.ts', '.py', '.go', '.java', '.rs', '.rb', '.cpp', '.c'];
  for (const ext of commonExtensions) {
    assert.ok(extensions.includes(ext), `Should include common extension '${ext}'`);
  }
});

// ============================================================================
// Test: Fallback behavior for unsupported languages
// ============================================================================

test('Unsupported file extensions return undefined from LANG_RULES', () => {
  const unsupportedExtensions = ['.xyz', '.unknown', '.foo', '.bar', '.abc'];

  for (const ext of unsupportedExtensions) {
    assert.strictEqual(
      LANG_RULES[ext],
      undefined,
      `LANG_RULES['${ext}'] should be undefined for unsupported extension`
    );
  }
});

test('LANG_RULES can be safely accessed with bracket notation', () => {
  // This tests that accessing non-existent keys does not throw
  const result = LANG_RULES['.nonexistent'];
  assert.strictEqual(result, undefined);

  // Safe pattern for checking language support
  const ext = '.ts';
  if (ext in LANG_RULES) {
    const rule = LANG_RULES[ext];
    assert.ok(rule.lang === 'typescript');
  }
});

// ============================================================================
// Test: Tree-sitter parser references are consistent
// ============================================================================

test('LANG_RULES.ts references RESOLVED_LANGUAGES correctly', () => {
  // Verify that each rule references its corresponding resolved language
  const mappings: Record<string, keyof typeof RESOLVED_LANGUAGES> = {
    '.php': 'php',
    '.py': 'python',
    '.js': 'javascript',
    '.jsx': 'tsx',
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.go': 'go',
    '.java': 'java',
    '.cs': 'csharp',
    '.rs': 'rust',
    '.rb': 'ruby',
    '.cpp': 'cpp',
    '.c': 'c',
    '.scala': 'scala',
    '.swift': 'swift',
    '.sh': 'bash',
    '.kt': 'kotlin',
    '.lua': 'lua',
    '.html': 'html',
    '.css': 'css',
    '.json': 'json',
    '.ml': 'ocaml',
    '.hs': 'haskell',
    '.ex': 'elixir',
    '.md': 'markdown'
  };

  for (const [ext, langKey] of Object.entries(mappings)) {
    const rule = LANG_RULES[ext];
    assert.ok(rule, `Rule for '${ext}' should exist`);
    assert.strictEqual(
      rule.ts,
      RESOLVED_LANGUAGES[langKey],
      `Rule for '${ext}' should reference RESOLVED_LANGUAGES.${langKey}`
    );
  }
});

// ============================================================================
// Test: LanguageRule interface compliance
// ============================================================================

test('All LANG_RULES entries comply with LanguageRule interface', () => {
  for (const [ext, rule] of Object.entries(LANG_RULES)) {
    // Required properties
    assert.ok(
      typeof rule.lang === 'string',
      `${ext}: 'lang' must be a string`
    );
    assert.ok(
      Array.isArray(rule.nodeTypes),
      `${ext}: 'nodeTypes' must be an array`
    );
    assert.ok(
      rule.commentPattern === null || rule.commentPattern instanceof RegExp,
      `${ext}: 'commentPattern' must be null or RegExp`
    );
    assert.ok(
      'ts' in rule,
      `${ext}: 'ts' property must exist`
    );

    // Optional properties when present
    if ('subdivisionTypes' in rule && rule.subdivisionTypes !== undefined) {
      assert.ok(
        typeof rule.subdivisionTypes === 'object',
        `${ext}: 'subdivisionTypes' must be an object when present`
      );
    }
    if ('variableTypes' in rule && rule.variableTypes !== undefined) {
      assert.ok(
        Array.isArray(rule.variableTypes),
        `${ext}: 'variableTypes' must be an array when present`
      );
    }
  }
});

// ============================================================================
// Test: Edge cases and boundary conditions
// ============================================================================

test('Extension with dot prefix lookup matches correctly', () => {
  // Verify that the extension format is consistent (always with leading dot)
  const validExtension = '.ts';
  const invalidFormat = 'ts'; // without dot

  assert.ok(LANG_RULES[validExtension] !== undefined);
  assert.strictEqual(LANG_RULES[invalidFormat], undefined);
});

test('Empty string extension returns undefined', () => {
  assert.strictEqual(LANG_RULES[''], undefined);
});

test('Single dot extension returns undefined', () => {
  assert.strictEqual(LANG_RULES['.'], undefined);
});

test('Case sensitivity of extensions', () => {
  // Extensions should be lowercase
  assert.ok(LANG_RULES['.ts'] !== undefined);
  assert.strictEqual(LANG_RULES['.TS'], undefined);
  assert.strictEqual(LANG_RULES['.Ts'], undefined);
});

// ============================================================================
// Test: Multiline comment patterns
// ============================================================================

test('C-style multiline comment pattern matches correctly', () => {
  const cPattern = LANG_RULES['.c'].commentPattern;
  assert.ok(cPattern !== null);

  const multilineComment = '/* This is a\nmultiline\ncomment */';
  const matches = multilineComment.match(cPattern as RegExp);
  assert.ok(matches !== null, 'Should match C multiline comments');
});

test('Python multiline docstring pattern matches correctly', () => {
  const pyPattern = LANG_RULES['.py'].commentPattern;
  assert.ok(pyPattern !== null);

  const multilineDocstring = '"""This is a\nmultiline\ndocstring"""';
  const matches = multilineDocstring.match(pyPattern as RegExp);
  assert.ok(matches !== null, 'Should match Python multiline docstrings');
});

test('HTML multiline comment pattern matches correctly', () => {
  const htmlPattern = LANG_RULES['.html'].commentPattern;
  assert.ok(htmlPattern !== null);

  const multilineComment = '<!-- This is a\nmultiline\ncomment -->';
  const matches = multilineComment.match(htmlPattern as RegExp);
  assert.ok(matches !== null, 'Should match HTML multiline comments');
});

// ============================================================================
// Test: Rust documentation comment pattern
// ============================================================================

test('Rust documentation comment patterns match correctly', () => {
  const rsPattern = LANG_RULES['.rs'].commentPattern;
  assert.ok(rsPattern !== null);

  // Rust doc comments (///)
  const docComment = '/// This is documentation';
  const matches = docComment.match(rsPattern as RegExp);
  assert.ok(matches !== null, 'Should match Rust doc comments');

  // Block doc comments (/**)
  const blockDocComment = '/** This is block documentation */';
  const blockMatches = blockDocComment.match(rsPattern as RegExp);
  assert.ok(blockMatches !== null, 'Should match Rust block doc comments');
});

// ============================================================================
// Test: Go comment pattern (both styles)
// ============================================================================

test('Go comment patterns match both line and block styles', () => {
  const goPattern = LANG_RULES['.go'].commentPattern;
  assert.ok(goPattern !== null);

  const lineComment = '// This is a line comment';
  const blockComment = '/* This is a block comment */';

  const lineMatches = lineComment.match(goPattern as RegExp);
  const blockMatches = blockComment.match(goPattern as RegExp);

  assert.ok(lineMatches !== null, 'Should match Go line comments');
  assert.ok(blockMatches !== null, 'Should match Go block comments');
});

// ============================================================================
// Test: Language count verification
// ============================================================================

test('LANG_RULES contains 33 file extensions', () => {
  const extensionCount = Object.keys(LANG_RULES).length;
  assert.equal(
    extensionCount,
    33,
    `LANG_RULES should contain 33 file extensions, got ${extensionCount}`
  );
});

test('Languages are distributed correctly across extensions', () => {
  // Count how many extensions map to each language
  const langCounts: Record<string, number> = {};

  for (const rule of Object.values(LANG_RULES)) {
    langCounts[rule.lang] = (langCounts[rule.lang] || 0) + 1;
  }

  // C++ has 3 extensions (.cpp, .hpp, .cc)
  assert.equal(langCounts['cpp'], 3, 'cpp should have 3 extensions');

  // C has 2 extensions (.c, .h)
  assert.equal(langCounts['c'], 2, 'c should have 2 extensions');

  // Bash has 2 extensions (.sh, .bash)
  assert.equal(langCounts['bash'], 2, 'bash should have 2 extensions');

  // HTML has 2 extensions (.html, .htm)
  assert.equal(langCounts['html'], 2, 'html should have 2 extensions');

  // Markdown has 2 extensions (.md, .markdown)
  assert.equal(langCounts['markdown'], 2, 'markdown should have 2 extensions');

  // TSX has 2 extensions (.tsx, .jsx)
  assert.equal(langCounts['tsx'], 2, 'tsx should have 2 extensions');

  // Elixir has 2 extensions (.ex, .exs)
  assert.equal(langCounts['elixir'], 2, 'elixir should have 2 extensions');

  // OCaml has 2 extensions (.ml, .mli)
  assert.equal(langCounts['ocaml'], 2, 'ocaml should have 2 extensions');
});

// ============================================================================
// Test: JSX uses TSX parser (intentional design choice)
// ============================================================================

test('JSX intentionally uses TSX parser for TypeScript compatibility', () => {
  const jsxRule = LANG_RULES['.jsx'];
  const tsxRule = LANG_RULES['.tsx'];

  assert.strictEqual(
    jsxRule.ts,
    tsxRule.ts,
    'JSX and TSX should use the same parser'
  );
  assert.equal(jsxRule.lang, 'tsx');
});

// ============================================================================
// Test: Empty subdivisionTypes arrays (valid case)
// ============================================================================

test('Markdown fenced_code_block has empty subdivisions array', () => {
  const mdRule = LANG_RULES['.md'];
  assert.ok(mdRule.subdivisionTypes);
  const codeBlockSubdivisions = mdRule.subdivisionTypes['fenced_code_block'];
  assert.ok(Array.isArray(codeBlockSubdivisions));
  assert.equal(codeBlockSubdivisions.length, 0);
});
