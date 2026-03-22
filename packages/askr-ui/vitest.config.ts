import { defineConfig } from 'vitest/config';
import { askr } from '@askrjs/askr/vite';

export default defineConfig({
  plugins: [askr()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
  },
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: '@askrjs/askr',
    },
    jsxInject:
      "import { jsx, jsxs, Fragment } from '@askrjs/askr/jsx-runtime';",
  },
  resolve: {
    alias: {},
  },
});
