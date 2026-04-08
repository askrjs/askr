import { defineConfig } from 'vite-plus';
import {
  askrEsbuild,
  createNodeEnvDefine,
  createPackageAliases,
} from './tooling/askr-tooling';

export default defineConfig({
  define: createNodeEnvDefine('development', { bench: true }),
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: '@askrjs/askr',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}', 'checks/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup-env.ts'],
  },
  esbuild: askrEsbuild,
  resolve: {
    // Tests should bind package imports to source entries rather than dist.
    alias: createPackageAliases(),
  },
});
