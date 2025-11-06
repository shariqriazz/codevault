module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  rules: {
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

    // Prefer const over let
    'prefer-const': 'warn',

    // Require === instead of ==
    eqeqeq: ['error', 'always'],

    // No var declarations
    'no-var': 'error',

    // Prefer template literals
    'prefer-template': 'warn',

    // No implicit any on 'this'
    '@typescript-eslint/no-this-alias': 'error',
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '.codevault/',
    '*.cjs',
    '*.config.js',
  ],
};
