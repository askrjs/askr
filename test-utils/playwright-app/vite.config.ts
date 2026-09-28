import { defineConfig } from 'vite';
import {
  createNodeEnvDefine,
  createPackageAliases,
} from '../../tooling/askr-tooling';

export default defineConfig({
  define: createNodeEnvDefine('development'),
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: '@askrjs/askr',
    },
  },
  resolve: {
    alias: createPackageAliases(),
  },
});
