const { expect } = require("@playwright/test");
const { loginSmart, runStep, ensureVisualArtifactDirectories, sanitizeArtifactName } = require("../../utils/smartActions");

async function runVisualScenario(page, testInfo, suiteName, scenario) {
  const appUrl = process.env.APP_URL;

  expect(appUrl, "APP_URL must be configured before running the visual suites.").toBeTruthy();

  ensureVisualArtifactDirectories();

  const scenarioPrefix = [
    testInfo.project.name,
    suiteName,
    scenario.key || scenario.title,
  ]
    .map(value => sanitizeArtifactName(value))
    .filter(Boolean)
    .join("__");

  console.log(`\nSuite: ${suiteName.toUpperCase()}`);
  console.log(`Scenario: ${scenario.title}`);
  console.log(`Project: ${testInfo.project.name}`);
  console.log(`Screenshot prefix: ${scenarioPrefix}\n`);

  await page.goto(appUrl);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);

  await loginSmart(page);

  for (const step of scenario.steps) {
    await runStep(page, step, { screenshotPrefix: scenarioPrefix });
  }
}

module.exports = { runVisualScenario };
