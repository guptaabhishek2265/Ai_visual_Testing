# AI Visual Testing Engine

Playwright-based visual automation for an AI-guided testing flow, with suite-based execution, SSIM image comparison, Allure reporting, and full support for dynamic triggers from external repositories. This engine can test any website simply by providing a URL, credentials, and plain English test steps.

## What Is Included

- `smoke` suite for the most critical app availability checks
- `sanity` suite for core navigation and cart confidence checks
- `regression` suite for the end-to-end shopper journey
- Test labels such as `@critical`, `@menu`, `@cart`, and `@checkout`
- Browser support for `chromium` and local `chrome`
- Playwright HTML report, trace, video, and screenshot capture on failures
- Allure results and generated Allure HTML report
- SSIM-based visual comparison with optional AI commentary for changed screenshots

## Integration / Testing Any Website

This repository acts as a central Testing-as-a-Service engine. You can trigger it from **any external repository** securely via GitHub Actions without sharing your codebase or hardcoding credentials here.

See the [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md) for step-by-step instructions on how to connect your repository.

## Suite Design

Test scenarios are defined in plain English. The default suites provided in this repo (which can be overridden remotely) are:

- `smoke`: Covers login and basic visibility checks.
- `sanity`: Covers core navigation.
- `regression`: Covers deeper end-to-end user journeys.

Scenario definitions are now driven from [steps.txt](/c:/Users/richa/OneDrive/Desktop/samsung_prism/Sami/ai-visual-testing/steps.txt). The parser in [tests/scenarios.js](/c:/Users/richa/OneDrive/Desktop/samsung_prism/Sami/ai-visual-testing/tests/scenarios.js) only reads that file.

## Setup

1. Install Node dependencies:

```bash
npm install
```

2. Install Playwright browsers:

```bash
npx playwright install
```

3. Install Python dependencies for visual comparison:

```bash
pip install opencv-python scikit-image numpy requests
```

4. Configure `.env` with your default testing target:

```bash
APP_URL=https://your-website.com/login
EMAIL=testuser@example.com
PASSWORD=your_secret
GROQ_API_KEY=gsk_...
```

## Local Commands

Run the fastest important checks in Chromium:

```bash
npm test
```

Run all lean suites in Chromium:

```bash
npm run test:all
```

Run individual suites:

```bash
npm run test:smoke
npm run test:sanity
npm run test:regression
```

Run by label:

```bash
npm run test:critical
npm run test:cart
npm run test:checkout
npm run test:menu
```

Run in local Chrome:

```bash
npm run test:chrome
npm run test:smoke:chrome
```

Run in Playwright UI mode:

```bash
npm run test:ui
npm run test:ui:chrome
```

Run headed:

```bash
npm run test:headed
```

Run visual comparison:

```bash
npm run compare
```

Generate and open Allure:

```bash
npm run allure:generate
npm run allure:open
```

Run the CI-like local flow:

```bash
npm run ci:test
```

## How Baselines Work

- Baseline screenshots are stored in `screenshots/baseline/`
- New comparison screenshots are stored in `screenshots/current/`
- Screenshot names now include the browser project, suite, and scenario key so suites do not overwrite each other

If a screenshot does not have a baseline yet, the first capture is saved as baseline automatically. Later runs save the same screenshot name into `screenshots/current/` for comparison.

## Reports

Playwright outputs:

- `playwright-report/`
- `test-results/`
- `allure-results/`
- `allure-report/`

Visual comparison outputs:

- `reports/report.txt`
- `reports/report.json`
- `reports/diff/`

## CI/CD

GitHub Actions now runs on every PR to `main` and on pushes to `main`.
It also supports manual runs from the GitHub Actions tab with:

- `test_label`, for example `@smoke`, `@sanity`, `@regression`, `@critical`, `@cart`, `@checkout`, or `@menu`
- `browser_project`, either `chromium` or `chrome`

The workflow:

1. Installs Node, Python, Java, and Playwright dependencies
2. Masks any passwords passed dynamically
3. Optionally downloads a custom `steps.txt` if triggered externally
4. Runs visual tests on the provided URL
5. Runs SSIM visual comparison
6. Generates an Allure HTML report
7. Uploads Playwright, Allure, and visual diff artifacts

Required GitHub repository secrets for standalone runs:

- `APP_URL`
- `EMAIL`
- `PASSWORD`
- `GROQ_API_KEY`

If `FAIL_ON_VISUAL_DIFF=true`, the comparison step fails the workflow when significant visual changes or missing baselines are detected.
