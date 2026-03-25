import { defineConfig } from 'vite-plus';
import { askr } from '@askrjs/askr-vite';

export default defineConfig({
  plugins: [askr()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['benches/**/*.bench.ts', 'benches/**/*.bench.tsx'],
    benchmark: {
      include: ['benches/**/*.bench.ts', 'benches/**/*.bench.tsx'],
    },
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
