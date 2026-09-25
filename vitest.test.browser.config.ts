import { defineConfig } from 'vite-plus';
import { playwright } from 'vite-plus/test/browser-playwright';
import {
  createNodeEnvDefine,
  createPackageAliases,
} from './tooling/askr-tooling.ts';

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
    // Browser test files share the runner page's History API. WebKit limits
    // that page to 100 pushState/replaceState calls per 10 seconds, so router
    // suites must not run their history-heavy files concurrently.
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser }],
    },
    globals: true,
    include: ['tests/browser/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup-env.ts', 'tests/browser/history-write-budget.ts'],
  },
  resolve: {
    alias: createPackageAliases(),
  },
});
