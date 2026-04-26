const { test } = require("@playwright/test");
const { suites } = require("./scenarios");
const { runVisualScenario } = require("./helpers/runVisualScenario");

for (const [suiteName, scenarios] of Object.entries(suites)) {
  test.describe(`${suiteName} suite`, () => {
    for (const scenario of scenarios) {
      const labels = [`@${suiteName}`, "@visual", ...(scenario.labels || [])]
        .filter(Boolean)
        .join(" ");

      test(`${scenario.title} ${labels}`, async ({ page }, testInfo) => {
        await runVisualScenario(page, testInfo, suiteName, scenario);
      });
    }
  });
}
