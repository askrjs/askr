import { defineConfig } from 'vite-plus';
import {
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
    include: ['tests/jsdom/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup-env.ts'],
  },
  resolve: {
    alias: createPackageAliases(),
  },
});
