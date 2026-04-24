import { defineConfig } from 'vite-plus';
import { playwright } from 'vite-plus/test/browser/providers/playwright';
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
    globals: true,
    include: ['tests/playwright/**/*.browser.{ts,tsx}'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
  resolve: {
    alias: createPackageAliases(),
  },
});
