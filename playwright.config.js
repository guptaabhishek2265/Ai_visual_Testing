require("dotenv").config();
const { defineConfig } = require("@playwright/test");

const testTimeout = Number(process.env.PLAYWRIGHT_TIMEOUT_MS || 300000);

module.exports = defineConfig({
  testDir: "./tests",
  timeout: testTimeout,
  use: {
    headless: "true",
    viewport: { width: 1280, height: 720 },
  },
});
