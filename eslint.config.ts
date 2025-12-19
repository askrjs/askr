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
