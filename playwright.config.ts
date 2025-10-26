import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  // Maximum time one test can run for.
  timeout: 30 * 1000,
  expect: {
    // Maximum time expect() should wait for a condition to be met.
    timeout: 5000,
  },
  // Run tests in files in parallel
  fullyParallel: true,
  // Reporter to use
  reporter: 'html',

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        // Run in headless mode to avoid opening a browser window
        headless: true,
      },
    },
  ],

  // ** THIS IS THE CRITICAL PART **
  // Configure the development server to run before tests.
  webServer: {
    command: 'pnpm run dev',
    port: 9000, // The port the dev server runs on
    reuseExistingServer: !process.env.CI, // Use existing server if not in CI
  },

  use: {
    // ** AND THIS IS **
    // Base URL to use in actions like `await page.goto('/')`.
    baseURL: 'http://localhost:9000',
    // Collect trace when retrying the failed test.
    trace: 'on-first-retry',
  },
});
