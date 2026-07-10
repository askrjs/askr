import { defineConfig } from 'vite-plus';
import { playwright } from 'vite-plus/test/browser-playwright';
import {
  createNodeEnvDefine,
  createPackageAliases,
} from './tooling/askr-tooling';

const browser = (process.env.ASKR_BROWSER ?? 'chromium') as
  | 'chromium'
  | 'firefox'
  | 'webkit';

export default defineConfig({
  define: createNodeEnvDefine('development', { bench: true }),
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: '@askrjs/askr',
    },
  },
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser }],
    },
    globals: true,
    include: ['tests/browser/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup-env.ts'],
  },
  resolve: {
    alias: createPackageAliases(),
  },
});
