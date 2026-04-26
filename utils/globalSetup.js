const fs = require("fs");
const path = require("path");

const DIRECTORIES_TO_RESET = [
  "allure-results",
  "allure-report",
  "playwright-report",
  "test-results",
  path.join("screenshots", "current"),
  path.join("reports", "diff"),
];

function safeResetDirectory(relativeDirectory) {
  const targetPath = path.join(process.cwd(), relativeDirectory);

  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }

  fs.mkdirSync(targetPath, { recursive: true });
}

async function globalSetup() {
  DIRECTORIES_TO_RESET.forEach(safeResetDirectory);
}

module.exports = globalSetup;
