import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4177';

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  webServer: process.env.PLAYWRIGHT_NO_SERVER
    ? undefined
    : {
        command: 'npx vite --host 127.0.0.1 --port 4177',
        url: baseURL,
        reuseExistingServer: true
      },
  use: {
    baseURL,
    trace: 'on-first-retry'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }
  ]
});
