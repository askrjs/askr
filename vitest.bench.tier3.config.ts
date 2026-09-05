import { defineConfig } from 'vite-plus';
import { playwright } from 'vite-plus/test/browser-playwright';
import {
  benchBrowserDefine,
  benchBrowserServer,
  benchExcludes,
  benchOxc,
  benchResolve,
  tier3BenchIncludes,
} from './vitest.bench.shared';

export default defineConfig({
  define: benchBrowserDefine,
  server: benchBrowserServer,
  oxc: benchOxc,
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
    globals: true,
    include: [...tier3BenchIncludes],
    exclude: [...benchExcludes],
    setupFiles: ['tests/setup-bench-env.ts'],
    benchmark: {
      include: [...tier3BenchIncludes],
      exclude: [...benchExcludes],
      includeSamples: false,
    },
  },
  resolve: benchResolve,
});
