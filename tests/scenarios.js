const fs = require("fs");
const path = require("path");

const stepsFile = path.join(__dirname, "../steps.txt");
const DEFAULT_SUITE = "regression";
const DEFAULT_TITLE = "Steps from steps.txt";

function normalizeLine(line) {
  return String(line || "").trim();
}

function buildScenarioKey(value, fallbackIndex) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  return normalized || `scenario_${fallbackIndex}`;
}

function createScenario(title, index) {
  return {
    key: buildScenarioKey(title, index),
    title: title || `${DEFAULT_TITLE} ${index}`,
    labels: [],
    steps: [],
  };
}

function parseHeader(line, type) {
  const bracketPattern = new RegExp(`^\\[${type}\\s*:\\s*(.+?)\\]$`, "i");
  const plainPattern = new RegExp(`^${type}\\s*:\\s*(.+)$`, "i");
  const bracketMatch = line.match(bracketPattern);
  if (bracketMatch) {
    return bracketMatch[1].trim();
  }

  const plainMatch = line.match(plainPattern);
  return plainMatch ? plainMatch[1].trim() : null;
}

function finalizeScenario(suites, suiteName, scenario) {
  if (!scenario || scenario.steps.length === 0) {
    return;
  }

  if (!suites[suiteName]) {
    suites[suiteName] = [];
  }

  suites[suiteName].push(scenario);
}

function parseLabels(value) {
  return String(value || "")
    .split(/[,\s]+/)
    .map(label => label.trim().replace(/^@+/, ""))
    .filter(Boolean)
    .map(label => `@${buildScenarioKey(label, "label")}`);
}

function parseStepsFile() {
  const rawContent = fs.readFileSync(stepsFile, "utf-8");
  const lines = rawContent.split(/\r?\n/);
  const suites = {};
  let suiteName = DEFAULT_SUITE;
  let scenarioIndex = 1;
  let currentScenario = createScenario(DEFAULT_TITLE, scenarioIndex);

  for (const rawLine of lines) {
    const line = normalizeLine(rawLine);

    if (!line || line.startsWith("#") || line.startsWith("//")) {
      continue;
    }

    const parsedSuiteName = parseHeader(line, "suite");
    if (parsedSuiteName) {
      finalizeScenario(suites, suiteName, currentScenario);
      suiteName = buildScenarioKey(parsedSuiteName, suiteName);
      scenarioIndex = 1;
      currentScenario = createScenario(DEFAULT_TITLE, scenarioIndex);
      continue;
    }

    const parsedTestTitle = parseHeader(line, "test");
    if (parsedTestTitle) {
      finalizeScenario(suites, suiteName, currentScenario);
      scenarioIndex = (suites[suiteName]?.length || 0) + 1;
      currentScenario = createScenario(parsedTestTitle, scenarioIndex);
      continue;
    }

    const parsedLabels = parseHeader(line, "labels");
    if (parsedLabels) {
      currentScenario.labels = parseLabels(parsedLabels);
      continue;
    }

    if (/^login\b/i.test(line)) {
      continue;
    }

    currentScenario.steps.push(line);
  }

  finalizeScenario(suites, suiteName, currentScenario);

  return suites;
}

const suites = parseStepsFile();

module.exports = { suites, parseStepsFile };
