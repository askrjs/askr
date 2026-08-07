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
    include: ['tests/unit/**/*.test.{ts,tsx}'],
  },
  resolve: {
    // Tests should bind package imports to source entries rather than dist.
    alias: createPackageAliases(),
  },
});
