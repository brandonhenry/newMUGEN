import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4177';
const webServerCommand = process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ?? 'npx vite --host 127.0.0.1 --port 4177';

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  webServer: process.env.PLAYWRIGHT_NO_SERVER
    ? undefined
    : {
        command: webServerCommand,
        url: baseURL,
        reuseExistingServer: true
      },
  use: {
    baseURL,
    trace: 'on-first-retry'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'compat-iphone-se', testMatch: /device-compat\.spec\.ts/, use: { ...devices['iPhone SE'], browserName: 'chromium' } },
    { name: 'compat-iphone-13', testMatch: /device-compat\.spec\.ts/, use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'compat-pixel-5', testMatch: /device-compat\.spec\.ts/, use: { ...devices['Pixel 5'], browserName: 'chromium' } },
    { name: 'compat-galaxy-s9', testMatch: /device-compat\.spec\.ts/, use: { ...devices['Galaxy S9+'], browserName: 'chromium' } },
    { name: 'compat-ipad-pro', testMatch: /device-compat\.spec\.ts/, use: { ...devices['iPad Pro 11'], browserName: 'chromium' } }
  ]
});
