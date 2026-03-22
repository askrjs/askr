import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-console': [
        'warn',
        {
          allow: ['warn', 'error'],
        },
      ],
    },
  },
  {
    ignores: ['dist', 'node_modules', '.prettierignore', '.eslintignore'],
  },
  // Disallow non-deterministic globals during synchronous SSR rendering
  {
    files: ['src/ssr/**/*.ts', 'src/ssr/**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {},
    },
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Avoid Math.random during synchronous SSR — use deterministic values or pre-compute outside SSR.',
        },
        {
          object: 'Date',
          property: 'now',
          message:
            'Avoid Date.now during synchronous SSR — pass timestamps explicitly or pre-compute outside SSR.',
        },
      ],
    },
  },
  // Ensure benches are picked up by editors / workspace ESLint
  {
    files: [
      'benches/**/*.ts',
      'benches/**/*.tsx',
      'tests/**/*.ts',
      'tests/**/*.tsx',
    ],
    languageOptions: {
      parser: tseslint.parser,
      // For benches we avoid type-aware linting (they live outside `src`) to prevent the parser
      // from requiring TS program files; use default parserOptions here.
      parserOptions: {},
    },
    rules: {
      // keep same baseline rules for benches
    },
  },
];
