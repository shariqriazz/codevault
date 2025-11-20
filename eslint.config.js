import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  // Ignore patterns
  {
    ignores: [
      'dist/',
      'node_modules/',
      '.codevault/',
      '*.cjs',
      '*.config.js',
    ],
  },
  // Base ESLint recommended rules
  eslint.configs.recommended,
  // TypeScript files configuration
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // TypeScript ESLint recommended rules
      ...tseslint.configs.recommended.rules,
      ...tseslint.configs['recommended-requiring-type-checking'].rules,

      // Prevent use of 'any'
      '@typescript-eslint/no-explicit-any': 'warn',

      // Require explicit return types on functions
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
        },
      ],

      // Prevent console.log (use logger instead)
      'no-console': ['warn', { allow: ['error', 'warn'] }],

      // Prevent floating promises (must await or void)
      '@typescript-eslint/no-floating-promises': 'error',

      // Require proper error handling
      '@typescript-eslint/no-misused-promises': 'error',

      // Warn about async functions without await (often intentional for interface consistency)
      '@typescript-eslint/require-await': 'warn',

      // Prevent unused variables
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      // Require proper null checks
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // Prevent unsafe member access
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',

      // Prefer const over let
      'prefer-const': 'warn',

      // Require === instead of ==
      'eqeqeq': ['error', 'always'],

      // No var declarations
      'no-var': 'error',

      // Prefer template literals
      'prefer-template': 'warn',

      // No implicit any on 'this'
      '@typescript-eslint/no-this-alias': 'error',

      // Disable no-undef for TypeScript - TypeScript compiler handles this
      'no-undef': 'off',
    },
  },
  // Test files configuration
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      // Test runners handle promise rejections
      '@typescript-eslint/no-floating-promises': 'off',
      // Tests often use console for debugging
      'no-console': 'off',
    },
  },
];
