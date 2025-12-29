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
      // Tests run against source, not built dist artifacts. Provide aliases for
      // package subpath exports that normally point at dist/*.
      '@askrjs/askr/jsx-runtime': path.resolve(
        __dirname,
        'src/jsx/jsx-runtime.ts'
      ),
      '@askrjs/askr/jsx-dev-runtime': path.resolve(
        __dirname,
        'src/jsx/jsx-dev-runtime.ts'
      ),
    },
  },
});
