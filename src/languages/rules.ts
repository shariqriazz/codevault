import { RESOLVED_LANGUAGES } from './tree-sitter-loader.js';

export interface LanguageRule {
  lang: string;
  ts: any;
  nodeTypes: string[];
  subdivisionTypes?: Record<string, string[]>;
  variableTypes?: string[];
  commentPattern: RegExp | null;
}

export const LANG_RULES: Record<string, LanguageRule> = {
  '.php': {
    lang: 'php',
    ts: RESOLVED_LANGUAGES.php,
    nodeTypes: ['function_definition', 'method_declaration'],
    subdivisionTypes: {
      'class_declaration': ['method_declaration', 'function_definition'],
      'function_definition': ['function_definition', 'if_statement', 'try_statement'],
      'method_declaration': ['function_definition', 'if_statement', 'try_statement']
    },
    variableTypes: ['const_declaration', 'assignment_expression'],
    commentPattern: /\/\*\*[\s\S]*?\*\//g
  },
  '.py': {
    lang: 'python',
    ts: RESOLVED_LANGUAGES.python,
    nodeTypes: ['function_definition', 'class_definition'],
    subdivisionTypes: {
      'class_definition': ['function_definition'],
      'function_definition': ['function_definition', 'if_statement', 'try_statement', 'with_statement']
    },
    variableTypes: ['assignment', 'expression_statement'],
    commentPattern: /"""[\s\S]*?"""|'''[\s\S]*?'''/g
  },
  '.js': {
    lang: 'javascript',
    ts: RESOLVED_LANGUAGES.javascript,
    nodeTypes: ['function_declaration', 'method_definition', 'class_declaration', 'export_statement', 'lexical_declaration', 'expression_statement'],
    subdivisionTypes: {
      'class_declaration': ['method_definition', 'field_definition'],
      'function_declaration': ['function_declaration', 'if_statement', 'try_statement'],
      'method_definition': ['function_declaration', 'if_statement', 'try_statement'],
      'export_statement': ['object', 'function_declaration'],
      'expression_statement': ['call_expression', 'function']
    },
    variableTypes: ['const_declaration', 'let_declaration', 'variable_declaration'],
    commentPattern: /\/\*\*[\s\S]*?\*\//g
  },
  '.jsx': {
    lang: 'tsx',
    ts: RESOLVED_LANGUAGES.tsx,
    nodeTypes: ['function_declaration', 'class_declaration', 'export_statement', 'lexical_declaration', 'expression_statement'],
    subdivisionTypes: {
      'class_declaration': ['method_definition', 'field_definition'],
      'export_statement': ['object', 'function_declaration'],
      'expression_statement': ['call_expression', 'function']
    },
    variableTypes: ['const_declaration', 'let_declaration', 'variable_declaration'],
    commentPattern: /\/\*\*[\s\S]*?\*\//g
  },
  '.ts': {
    lang: 'typescript',
    ts: RESOLVED_LANGUAGES.typescript,
    nodeTypes: ['function_declaration', 'method_definition', 'class_declaration', 'export_statement', 'lexical_declaration', 'expression_statement'],
    subdivisionTypes: {
      'class_declaration': ['method_definition', 'field_definition'],
      'function_declaration': ['function_declaration', 'if_statement', 'try_statement'],
      'method_definition': ['function_declaration', 'if_statement', 'try_statement'],
      'export_statement': ['object', 'function_declaration'],
      'expression_statement': ['call_expression', 'function']
    },
    variableTypes: ['const_declaration', 'let_declaration', 'variable_declaration'],
    commentPattern: /\/\*\*[\s\S]*?\*\//g
  },
  '.tsx': {
    lang: 'tsx',
    ts: RESOLVED_LANGUAGES.tsx,
    nodeTypes: ['function_declaration', 'class_declaration', 'export_statement', 'lexical_declaration', 'expression_statement'],
    subdivisionTypes: {
      'class_declaration': ['method_definition', 'field_definition'],
      'export_statement': ['object', 'function_declaration'],
      'expression_statement': ['call_expression', 'function']
    },
    variableTypes: ['const_declaration', 'let_declaration', 'variable_declaration'],
    commentPattern: /\/\*\*[\s\S]*?\*\//g
  },
  '.go': {
    lang: 'go',
    ts: RESOLVED_LANGUAGES.go,
    nodeTypes: ['function_declaration', 'method_declaration'],
    variableTypes: ['const_declaration', 'var_declaration'],
    commentPattern: /\/\*[\s\S]*?\*\//g
  },
  '.java': {
    lang: 'java',
    ts: RESOLVED_LANGUAGES.java,
    nodeTypes: ['method_declaration', 'class_declaration'],
    variableTypes: ['variable_declaration', 'field_declaration'],
    commentPattern: /\/\*\*[\s\S]*?\*\//g
  },
  '.cs': {
    lang: 'csharp',
    ts: RESOLVED_LANGUAGES.csharp,
    nodeTypes: ['method_declaration', 'class_declaration', 'struct_declaration', 'interface_declaration'],
    subdivisionTypes: {
      'class_declaration': ['method_declaration', 'property_declaration', 'field_declaration'],
      'struct_declaration': ['method_declaration', 'property_declaration', 'field_declaration'],
      'interface_declaration': ['method_declaration', 'property_declaration'],
      'method_declaration': ['if_statement', 'try_statement', 'foreach_statement']
    },
    variableTypes: ['variable_declaration', 'field_declaration', 'property_declaration'],
    commentPattern: /\/\*\*[\s\S]*?\*\//g
  },
  '.rs': {
    lang: 'rust',
    ts: RESOLVED_LANGUAGES.rust,
    nodeTypes: ['function_item', 'impl_item', 'struct_item', 'enum_item', 'trait_item', 'mod_item'],
    subdivisionTypes: {
      'impl_item': ['function_item'],
      'mod_item': ['function_item', 'struct_item', 'enum_item', 'trait_item'],
      'trait_item': ['function_signature']
    },
    variableTypes: ['let_declaration', 'const_item', 'static_item'],
    commentPattern: /\/\/\/.*|\/\*\*[\s\S]*?\*\//g
  },
  '.rb': {
    lang: 'ruby',
    ts: RESOLVED_LANGUAGES.ruby,
    nodeTypes: ['method', 'class', 'module', 'singleton_method'],
    subdivisionTypes: {
      'class': ['method', 'singleton_method'],
      'module': ['method', 'singleton_method']
    },
    variableTypes: ['assignment', 'instance_variable', 'class_variable'],
    commentPattern: /#.*$/gm
  },
  '.cpp': {
    lang: 'cpp',
    ts: RESOLVED_LANGUAGES.cpp,
    nodeTypes: ['function_definition', 'class_specifier', 'struct_specifier', 'namespace_definition'],
    subdivisionTypes: {
      'class_specifier': ['function_definition', 'field_declaration'],
      'struct_specifier': ['function_definition', 'field_declaration'],
      'namespace_definition': ['function_definition', 'class_specifier', 'struct_specifier']
    },
    variableTypes: ['declaration', 'field_declaration'],
    commentPattern: /\/\*[\s\S]*?\*\//g
  },
  '.hpp': {
    lang: 'cpp',
    ts: RESOLVED_LANGUAGES.cpp,
    nodeTypes: ['function_definition', 'class_specifier', 'struct_specifier', 'namespace_definition'],
    subdivisionTypes: {
      'class_specifier': ['function_definition', 'field_declaration'],
      'struct_specifier': ['function_definition', 'field_declaration'],
      'namespace_definition': ['function_definition', 'class_specifier', 'struct_specifier']
    },
    variableTypes: ['declaration', 'field_declaration'],
    commentPattern: /\/\*[\s\S]*?\*\//g
  },
  '.cc': {
    lang: 'cpp',
    ts: RESOLVED_LANGUAGES.cpp,
    nodeTypes: ['function_definition', 'class_specifier', 'struct_specifier', 'namespace_definition'],
    subdivisionTypes: {
      'class_specifier': ['function_definition', 'field_declaration'],
      'struct_specifier': ['function_definition', 'field_declaration'],
      'namespace_definition': ['function_definition', 'class_specifier', 'struct_specifier']
    },
    variableTypes: ['declaration', 'field_declaration'],
    commentPattern: /\/\*[\s\S]*?\*\//g
  },
  '.c': {
    lang: 'c',
    ts: RESOLVED_LANGUAGES.c,
    nodeTypes: ['function_definition', 'struct_specifier', 'declaration'],
    subdivisionTypes: {
      'struct_specifier': ['field_declaration']
    },
    variableTypes: ['declaration'],
    commentPattern: /\/\*[\s\S]*?\*\//g
  },
  '.h': {
    lang: 'c',
    ts: RESOLVED_LANGUAGES.c,
    nodeTypes: ['function_definition', 'struct_specifier', 'declaration'],
    subdivisionTypes: {
      'struct_specifier': ['field_declaration']
    },
    variableTypes: ['declaration'],
    commentPattern: /\/\*[\s\S]*?\*\//g
  },
  '.scala': {
    lang: 'scala',
    ts: RESOLVED_LANGUAGES.scala,
    nodeTypes: ['function_definition', 'class_definition', 'object_definition', 'trait_definition'],
    subdivisionTypes: {
      'class_definition': ['function_definition', 'val_definition', 'var_declaration'],
      'object_definition': ['function_definition', 'val_definition'],
      'trait_definition': ['function_definition', 'function_declaration']
    },
    variableTypes: ['val_definition', 'var_declaration'],
    commentPattern: /\/\*\*[\s\S]*?\*\//g
  },
  '.swift': {
    lang: 'swift',
    ts: RESOLVED_LANGUAGES.swift,
    nodeTypes: ['function_declaration', 'class_declaration', 'struct_declaration', 'protocol_declaration'],
    subdivisionTypes: {
      'class_declaration': ['function_declaration', 'property_declaration'],
      'struct_declaration': ['function_declaration', 'property_declaration'],
      'protocol_declaration': ['function_declaration']
    },
    variableTypes: ['property_declaration', 'variable_declaration'],
    commentPattern: /\/\*\*[\s\S]*?\*\//g
  },
  '.sh': {
    lang: 'bash',
    ts: RESOLVED_LANGUAGES.bash,
    nodeTypes: ['function_definition', 'command'],
    subdivisionTypes: {
      'function_definition': ['command', 'if_statement', 'for_statement', 'while_statement']
    },
    variableTypes: ['variable_assignment'],
    commentPattern: /#.*$/gm
  },
  '.bash': {
    lang: 'bash',
    ts: RESOLVED_LANGUAGES.bash,
    nodeTypes: ['function_definition', 'command'],
    subdivisionTypes: {
      'function_definition': ['command', 'if_statement', 'for_statement', 'while_statement']
    },
    variableTypes: ['variable_assignment'],
    commentPattern: /#.*$/gm
  },
  '.kt': {
    lang: 'kotlin',
    ts: RESOLVED_LANGUAGES.kotlin,
    nodeTypes: ['function_declaration', 'property_declaration', 'class_declaration', 'object_declaration'],
    subdivisionTypes: {
      'class_declaration': ['function_declaration', 'property_declaration'],
      'object_declaration': ['function_declaration', 'property_declaration'],
      'function_declaration': ['if_expression', 'when_expression', 'try_expression']
    },
    variableTypes: ['property_declaration', 'variable_declaration'],
    commentPattern: /\/\*\*[\s\S]*?\*\//g
  },
  '.lua': {
    lang: 'lua',
    ts: RESOLVED_LANGUAGES.lua,
    nodeTypes: ['function_declaration', 'function_definition', 'function_call', 'table_constructor'],
    subdivisionTypes: {
      'function_definition': ['function_definition', 'if_statement', 'for_statement']
    },
    variableTypes: ['variable_declaration', 'assignment_statement'],
    commentPattern: /--.*$/gm
  },
  '.html': {
    lang: 'html',
    ts: RESOLVED_LANGUAGES.html,
    nodeTypes: ['element', 'start_tag', 'script_element', 'style_element'],
    subdivisionTypes: {
      'element': ['element']
    },
    variableTypes: [],
    commentPattern: /<!--[\s\S]*?-->/g
  },
  '.htm': {
    lang: 'html',
    ts: RESOLVED_LANGUAGES.html,
    nodeTypes: ['element', 'start_tag', 'script_element', 'style_element'],
    subdivisionTypes: {
      'element': ['element']
    },
    variableTypes: [],
    commentPattern: /<!--[\s\S]*?-->/g
  },
  '.css': {
    lang: 'css',
    ts: RESOLVED_LANGUAGES.css,
    nodeTypes: ['rule_set', 'declaration', 'selector'],
    subdivisionTypes: {
      'rule_set': ['declaration']
    },
    variableTypes: [],
    commentPattern: /\/\*[\s\S]*?\*\//g
  },
  '.json': {
    lang: 'json',
    ts: RESOLVED_LANGUAGES.json,
    nodeTypes: ['object', 'array', 'pair'],
    subdivisionTypes: {
      'object': ['pair'],
      'array': ['object', 'array']
    },
    variableTypes: [],
    commentPattern: null
  },
  '.ml': {
    lang: 'ocaml',
    ts: RESOLVED_LANGUAGES.ocaml,
    nodeTypes: ['value_definition', 'type_definition', 'module_definition', 'let_binding'],
    subdivisionTypes: {
      'module_definition': ['value_definition', 'type_definition'],
      'value_definition': ['let_binding']
    },
    variableTypes: ['let_binding', 'value_definition'],
    commentPattern: /\(\*[\s\S]*?\*\)/g
  },
  '.mli': {
    lang: 'ocaml',
    ts: RESOLVED_LANGUAGES.ocaml,
    nodeTypes: ['value_specification', 'type_definition', 'module_definition'],
    subdivisionTypes: {
      'module_definition': ['value_specification', 'type_definition']
    },
    variableTypes: ['value_specification'],
    commentPattern: /\(\*[\s\S]*?\*\)/g
  },
  '.hs': {
    lang: 'haskell',
    ts: RESOLVED_LANGUAGES.haskell,
    nodeTypes: ['function', 'type_signature', 'data_declaration', 'class_declaration'],
    subdivisionTypes: {
      'class_declaration': ['function', 'type_signature'],
      'data_declaration': ['constructor']
    },
    variableTypes: ['signature', 'bind'],
    commentPattern: /--.*$/gm
  },
  '.ex': {
    lang: 'elixir',
    ts: RESOLVED_LANGUAGES.elixir,
    nodeTypes: ['call', 'anonymous_function'],
    subdivisionTypes: {
      'call': ['call', 'anonymous_function']
    },
    variableTypes: ['identifier'],
    commentPattern: /#.*$/gm
  },
  '.exs': {
    lang: 'elixir',
    ts: RESOLVED_LANGUAGES.elixir,
    nodeTypes: ['call', 'anonymous_function'],
    subdivisionTypes: {
      'call': ['call', 'anonymous_function']
    },
    variableTypes: ['identifier'],
    commentPattern: /#.*$/gm
  },
  '.md': {
    lang: 'markdown',
    ts: RESOLVED_LANGUAGES.markdown,
    nodeTypes: ['atx_heading', 'setext_heading', 'section', 'fenced_code_block', 'list_item'],
    subdivisionTypes: {
      'section': ['atx_heading', 'setext_heading', 'paragraph', 'fenced_code_block', 'list', 'block_quote'],
      'list': ['list_item'],
      'fenced_code_block': []
    },
    variableTypes: [],
    commentPattern: /<!--[\s\S]*?-->/g
  },
  '.markdown': {
    lang: 'markdown',
    ts: RESOLVED_LANGUAGES.markdown,
    nodeTypes: ['atx_heading', 'setext_heading', 'section', 'fenced_code_block', 'list_item'],
    subdivisionTypes: {
      'section': ['atx_heading', 'setext_heading', 'paragraph', 'fenced_code_block', 'list', 'block_quote'],
      'list': ['list_item'],
      'fenced_code_block': []
    },
    variableTypes: [],
    commentPattern: /<!--[\s\S]*?-->/g
  }
};

export function getSupportedLanguageExtensions(): string[] {
  return Object.keys(LANG_RULES);
}