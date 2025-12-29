import { defineConfig } from 'vitest/config';
import * as path from 'path';

export default defineConfig({
  // Benchmarks should run without dev logging noise.
  // This also keeps output stable so ratios don't degrade into NaN due to console flooding.
  define: {
    'process.env.NODE_ENV': '"production"',
  },
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
