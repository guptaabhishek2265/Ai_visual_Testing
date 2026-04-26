require("dotenv").config();
const { defineConfig, devices } = require("@playwright/test");

const testTimeout = Number(process.env.PLAYWRIGHT_TIMEOUT_MS || 300000);

module.exports = defineConfig({
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  globalSetup: require.resolve("./utils/globalSetup"),
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["allure-playwright", { detail: true, outputFolder: "allure-results", suiteTitle: false }],
  ],
  retries: process.env.CI ? 1 : 0,
  testDir: "./tests",
  timeout: testTimeout,
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: process.env.APP_URL,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium",
      },
    },
    {
      name: "chrome",
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium",
        channel: "chrome",
      },
    },
  ],
});
