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
      '@askrjs/askr/foundations': path.resolve(
        __dirname,
        'src/foundations/index.ts'
      ),
      '@askrjs/askr/resources': path.resolve(__dirname, 'src/resources/index.ts'),
      '@askrjs/askr/fx': path.resolve(__dirname, 'src/fx/index.ts'),
      '@askrjs/askr/router': path.resolve(__dirname, 'src/router/index.ts'),
      '@askrjs/askr/ssr': path.resolve(__dirname, 'src/ssr/index.ts'),
      '@askrjs/askr/vite': path.resolve(__dirname, 'src/dev/vite-plugin-askr.ts'),
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
