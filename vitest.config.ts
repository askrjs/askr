import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup-env.ts'],
  },
  esbuild: {
    jsx: 'automatic',
    // Use the package-style import so tooling resolves consistently
    jsxImportSource: 'askr-jsx',
  },
  resolve: {
    alias: {
      'askr-jsx': path.resolve(__dirname, 'src/jsx'),
    },
  },
});
