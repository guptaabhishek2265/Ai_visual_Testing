# AI Visual Testing

Automated visual regression testing using Playwright and AI-powered image comparison with SSIM (Structural Similarity Index).

## Features

- Automated screenshot capture with Playwright
- AI-powered visual comparison using SSIM algorithm
- CI/CD integration with GitHub Actions
- Detailed reporting with similarity scores
- Baseline management for visual regression testing

## Setup

1. Install dependencies:
```bash
npm install
pip install opencv-python scikit-image numpy
```

2. Install Playwright browsers:
```bash
npx playwright install
```

## Usage

### Running Tests

```bash
# Run visual tests
npm test

# Run tests in headed mode
npm run test:headed

# Run AI comparison
npm run compare
```

### First Run

On the first run, the comparison script will create baseline screenshots from your current screenshots. Subsequent runs will compare new screenshots against these baselines.

### CI/CD Pipeline

The GitHub Actions workflow automatically:
- Runs visual tests
- Performs AI comparison
- Uploads artifacts on failure
- Fails the build if visual differences exceed threshold

## Configuration

### Similarity Threshold

Adjust the SSIM threshold in `utils/compare.py`:
```python
compare_images(baseline_path, current_path, threshold=0.95)
```

### Test Configuration

Modify `playwright.config.js` for different browsers, viewports, or test settings.

## Reports

After running comparisons, check:
- `reports/report.json` - Detailed JSON results
- `reports/report.txt` - Human-readable summary

## Directory Structure

- `tests/` - Playwright test files
- `screenshots/baseline/` - Reference images
- `screenshots/current/` - New test screenshots
- `utils/` - AI comparison utilities
- `reports/` - Test results and reports