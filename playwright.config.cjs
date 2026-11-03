const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({ testDir: './tests/browser', fullyParallel: false, workers: 1, timeout: 30000,
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4317', trace: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }],
  webServer: { command: 'node tests/browser-server.cjs', url: 'http://127.0.0.1:4317/api/platform/session', reuseExistingServer: false, timeout: 30000 }
});
