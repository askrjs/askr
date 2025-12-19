import { defineConfig } from 'vitest/config';
import * as path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['benches/**/*.bench.ts', 'benches/**/*.bench.tsx'],
    benchmark: {
      include: ['benches/**/*.bench.ts', 'benches/**/*.bench.tsx'],
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'askr-jsx',
  },
  resolve: {
    alias: {
      // Use an absolute path for alias to ensure Vite resolves it reliably in bench runs
      'askr-jsx': path.resolve(__dirname, './src/jsx'),
    },
  },
});
