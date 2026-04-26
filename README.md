# AI Visual Testing

Playwright-based visual automation for an AI-guided food ordering flow, with suite-based execution, SSIM image comparison, Allure reporting, and PR validation in GitHub Actions.

## What Is Included

- `smoke` suite for the most critical app availability checks
- `sanity` suite for core navigation and cart confidence checks
- `regression` suite for the end-to-end shopper journey
- Test labels such as `@critical`, `@menu`, `@cart`, and `@checkout`
- Browser support for `chromium` and local `chrome`
- Playwright HTML report, trace, video, and screenshot capture on failures
- Allure results and generated Allure HTML report
- SSIM-based visual comparison with optional AI commentary for changed screenshots

## Suite Design

The current app scenarios are based on the existing food ordering journey:

- `smoke`
  Covers login, dashboard visibility, and reaching the menu quickly.
- `sanity`
  Covers dashboard-to-menu navigation and adding items through the cart review flow.
- `regression`
  Covers the broader visual journey through dashboard, menu, cart, and checkout.

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

4. Configure `.env` with:

```bash
APP_URL=...
EMAIL=...
PASSWORD=...
GROQ_API_KEY=...
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
2. Runs all visual tests by default, or a selected label when manually triggered
3. Runs the SSIM visual comparison step
4. Generates an Allure HTML report
5. Uploads Playwright, Allure, and visual diff artifacts

Required GitHub repository secrets:

- `APP_URL`
- `EMAIL`
- `PASSWORD`
- `GROQ_API_KEY`

If `FAIL_ON_VISUAL_DIFF=true`, the comparison step fails the workflow when significant visual changes or missing baselines are detected.
