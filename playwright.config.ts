import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${PORT} test-utils/playwright-app`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      testMatch: /tests\/playwright\/e2e\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-a11y',
      testMatch: /tests\/playwright\/a11y\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-perf',
      testMatch: /tests\/playwright\/perf\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'browser-perf',
      testMatch: /benches\/browser\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
      workers: 1,
      retries: 0,
    },
    {
      name: 'firefox',
      testMatch: /tests\/playwright\/e2e\/.*\.spec\.ts/,
      grep: /@smoke/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testMatch: /tests\/playwright\/e2e\/.*\.spec\.ts/,
      grep: /@smoke/,
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
