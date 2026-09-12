import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: '**/*.spec.js', fullyParallel: false, workers: 1,
  timeout: 60_000, reporter: [['list']], outputDir: '../build/onaria-web-results',
  use: { baseURL: 'http://127.0.0.1:8799', browserName: 'chromium',
    ...(process.env.WEB_BROWSER_CHANNEL ? { channel: process.env.WEB_BROWSER_CHANNEL } : {}),
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node e2e/fixture.mjs', url: 'http://127.0.0.1:8799/health', reuseExistingServer: false },
});
