import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "test/e2e",
  timeout: 60000, // Increased timeout to 60 seconds
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'html',
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        launchOptions: {
          firefoxUserPrefs: {
            "dom.storage.testing.enabled": true,
          },
        },
      },
    },
  ],
  webServer: {
    command: "VITE_E2E=1 pnpm dev -m spa -H 0.0.0.0 -p 5174",
    url: "http://127.0.0.1:5174",
    timeout: 120_000,
    reuseExistingServer: false, // Force new server
  },
});
