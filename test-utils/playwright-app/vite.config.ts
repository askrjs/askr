import { defineConfig } from 'vite';
import {
  createNodeEnvDefine,
  createPackageAliases,
} from '../../tooling/askr-tooling';

export default defineConfig({
  define: createNodeEnvDefine('development', { bench: true }),
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: '@askrjs/askr',
  },
  resolve: {
    alias: createPackageAliases(),
  },
});
