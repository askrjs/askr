import { defineConfig } from 'vite-plus';
import {
  createNodeEnvDefine,
  createPackageAliases,
} from './tooling/askr-tooling.ts';

export default defineConfig({
  define: createNodeEnvDefine('development', { bench: true }),
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: '@askrjs/askr',
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/checks/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: createPackageAliases(),
  },
});
