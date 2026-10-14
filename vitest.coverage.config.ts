import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    projects: [
      {
        extends: './vitest.test.unit.config.ts',
        test: { name: 'coverage-unit' },
      },
      {
        extends: './vitest.test.jsdom.config.ts',
        test: { name: 'coverage-jsdom' },
      },
      {
        extends: './vitest.test.browser.config.ts',
        test: { name: 'coverage-browser' },
      },
    ],
    coverage: {
      enabled: true,
      provider: 'v8',
      include: [
        'src/core/dom/**/*.ts',
        'src/ssr/**/*.ts',
        'src/data/**/*.ts',
        'src/router/**/*.ts',
      ],
      exclude: ['**/*.d.ts'],
      reportsDirectory: 'coverage/runtime',
      reporter: ['text', 'json', 'json-summary', 'html'],
      reportOnFailure: true,
      // Rounded down from the measured Node/jsdom/Chromium aggregate. Keep
      // each area independent so gains elsewhere cannot mask a regression.
      thresholds: {
        'src/core/dom/**': {
          lines: 94,
          branches: 89,
          functions: 97,
          statements: 92,
        },
        'src/ssr/**': {
          lines: 93,
          branches: 85,
          functions: 95,
          statements: 91,
        },
        'src/data/**': {
          lines: 94,
          branches: 88,
          functions: 98,
          statements: 93,
        },
        'src/router/**': {
          lines: 92,
          branches: 87,
          functions: 92,
          statements: 91,
        },
      },
    },
  },
});
