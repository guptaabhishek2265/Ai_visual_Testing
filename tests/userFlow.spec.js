require("dotenv").config();
const { test } = require("@playwright/test");
const { loginSmart, runStep } = require("../utils/smartActions");
const fs = require("fs");
const path = require("path");

const BASELINE_DIR = "screenshots/baseline";
const CURRENT_DIR = "screenshots/current";

function hasSavedScreenshots(dir) {
  return fs
    .readdirSync(dir)
    .some(file => !file.startsWith(".") && file.toLowerCase().endsWith(".png"));
}

[BASELINE_DIR, CURRENT_DIR, "reports"].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const stepsFile = path.join(__dirname, "../steps.txt");
const steps = fs
  .readFileSync(stepsFile, "utf-8")
  .split("\n")
  .map(s => s.trim())
  .filter(Boolean);

const executableSteps = steps.filter(step => !/^login\b/i.test(step));

const baselineEmpty = !hasSavedScreenshots(BASELINE_DIR);
const screenshotDir = baselineEmpty ? BASELINE_DIR : CURRENT_DIR;

console.log(`\nMode: ${baselineEmpty ? "BASELINE (first run)" : "CURRENT (comparison run)"}`);
console.log(`Screenshots will be saved to: ${screenshotDir}`);
console.log(`Steps loaded: ${steps.length}`);
console.log(`Executable steps: ${executableSteps.length}\n`);

test("Agentic visual regression test", async ({ page }) => {
  await page.goto(process.env.APP_URL);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);

  await loginSmart(page);

  for (const step of executableSteps) {
    await runStep(page, step, screenshotDir);
  }

  console.log(`\nAll steps complete. Screenshots in: ${screenshotDir}`);

  if (!baselineEmpty) {
    console.log("Run 'python compare.py' to see visual diff results.");
  } else {
    console.log("Baseline saved. Make your code changes then run again to compare.");
  }
});
