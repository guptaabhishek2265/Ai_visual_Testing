const { getLoginSelectors, getNextAction } = require("./llm");
const path = require("path");

const SCREENSHOT_ZOOM = Number(process.env.SCREENSHOT_ZOOM || 0.8);
const SCREENSHOT_SCROLL_STEP_PX = Number(process.env.SCREENSHOT_SCROLL_STEP_PX || 500);
const SCREENSHOT_SCROLL_WAIT_MS = Number(process.env.SCREENSHOT_SCROLL_WAIT_MS || 250);
const DEFAULT_LOGIN_SELECTORS = {
  email: [
    "#email",
    'input[name="email"]',
    'input[type="email"]',
    'input[placeholder*="Email" i]',
    'input[name="username"]',
    'input[placeholder*="User" i]',
  ],
  password: [
    "#password",
    'input[name="password"]',
    'input[type="password"]',
    'input[placeholder*="Password" i]',
  ],
  submit: [
    ".MuiButton-containedPrimary",
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Login")',
    'button:has-text("Sign in")',
    '[role="button"]:has-text("Login")',
  ],
};

function buildStepScreenshotName(testerStep) {
  return testerStep
    .toLowerCase()
    .replace(/take a screenshot/gi, "")
    .replace(/screenshot/gi, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .replace(/_and$/g, "") || "step_state";
}

function isSameAction(a, b) {
  return (
    a &&
    b &&
    a.action === b.action &&
    a.selector === b.selector &&
    a.element_index === b.element_index &&
    a.value === b.value &&
    a.screenshot_name === b.screenshot_name
  );
}

async function findFirstWorkingSelector(page, candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    const count = await page.locator(candidate).count().catch(() => 0);
    if (count > 0) {
      return candidate;
    }
  }
  return null;
}

async function withZoomedOutPage(page, callback) {
  const previousState = await page.evaluate(zoom => {
    const htmlZoom = document.documentElement.style.zoom || "";
    const bodyZoom = document.body ? document.body.style.zoom || "" : "";
    const scrollY = window.scrollY;

    document.documentElement.style.zoom = String(zoom);
    if (document.body) {
      document.body.style.zoom = String(zoom);
    }

    return { htmlZoom, bodyZoom, scrollY };
  }, SCREENSHOT_ZOOM);

  const pageHeight = await page.evaluate(() =>
    Math.max(
      document.body?.scrollHeight || 0,
      document.documentElement?.scrollHeight || 0,
      document.body?.offsetHeight || 0,
      document.documentElement?.offsetHeight || 0
    )
  );

  for (let scrollY = 0; scrollY < pageHeight; scrollY += SCREENSHOT_SCROLL_STEP_PX) {
    await page.evaluate(y => window.scrollTo(0, y), scrollY);
    await page.waitForTimeout(SCREENSHOT_SCROLL_WAIT_MS);
  }

  const result = await callback();

  await page.evaluate(previous => {
    document.documentElement.style.zoom = previous.htmlZoom;
    if (document.body) {
      document.body.style.zoom = previous.bodyZoom;
    }
    window.scrollTo(0, previous.scrollY);
  }, previousState);
  await page.waitForTimeout(400);

  return result;
}

async function captureZoomedScreenshot(page) {
  return withZoomedOutPage(page, () => page.screenshot({ fullPage: true }));
}

async function saveComparisonScreenshot(page, screenshotPath) {
  await withZoomedOutPage(page, async () => {
    await page.waitForTimeout(200);
  });

  return page.screenshot({ path: screenshotPath, fullPage: true });
}

async function getInteractiveElements(page) {
  return page.evaluate(() => {
    const selectors = [
      "button",
      "a[href]",
      "input",
      "select",
      "textarea",
      "[role='button']",
      "[type='button']",
      "[type='submit']",
      "[onclick]",
    ];

    const normalizeText = value => (value || "").replace(/\s+/g, " ").trim();
    const escapeValue = value => String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const isVisible = element => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    const buildSelector = element => {
      const tag = element.tagName.toLowerCase();
      const id = element.id && normalizeText(element.id);
      const dataTestId = normalizeText(element.getAttribute("data-testid"));
      const dataTest = normalizeText(element.getAttribute("data-test"));
      const dataQa = normalizeText(element.getAttribute("data-qa"));
      const ariaLabel = normalizeText(element.getAttribute("aria-label"));
      const placeholder = normalizeText(element.getAttribute("placeholder"));
      const name = normalizeText(element.getAttribute("name"));
      const text = normalizeText(
        element.innerText ||
        element.textContent ||
        element.value ||
        element.getAttribute("title") ||
        ariaLabel
      ).slice(0, 80);
      const type = normalizeText(element.getAttribute("type"));

      if (id) return `#${CSS.escape(id)}`;
      if (dataTestId) return `[data-testid="${escapeValue(dataTestId)}"]`;
      if (dataTest) return `[data-test="${escapeValue(dataTest)}"]`;
      if (dataQa) return `[data-qa="${escapeValue(dataQa)}"]`;
      if (tag === "button" && text) return `button:has-text("${escapeValue(text)}")`;
      if (tag === "a" && text) return `a:has-text("${escapeValue(text)}")`;
      if (ariaLabel) return `${tag}[aria-label="${escapeValue(ariaLabel)}"]`;
      if (placeholder && (tag === "input" || tag === "textarea")) {
        return `${tag}[placeholder="${escapeValue(placeholder)}"]`;
      }
      if (name) return `${tag}[name="${escapeValue(name)}"]`;
      if (type) return `${tag}[type="${escapeValue(type)}"]`;
      return tag;
    };

    const selectorCounts = new Map();

    return Array.from(document.querySelectorAll(selectors.join(",")))
      .filter(isVisible)
      .slice(0, 80)
      .map(element => {
        const selector = buildSelector(element);
        const elementIndex = selectorCounts.get(selector) || 0;
        selectorCounts.set(selector, elementIndex + 1);

        return {
          tag: element.tagName.toLowerCase(),
          type: normalizeText(element.getAttribute("type")) || null,
          role: normalizeText(element.getAttribute("role")) || null,
          text: normalizeText(
            element.innerText ||
            element.textContent ||
            element.value ||
            element.getAttribute("title") ||
            element.getAttribute("aria-label")
          ).slice(0, 120) || null,
          aria_label: normalizeText(element.getAttribute("aria-label")) || null,
          placeholder: normalizeText(element.getAttribute("placeholder")) || null,
          href: normalizeText(element.getAttribute("href")) || null,
          selector,
          element_index: elementIndex,
          disabled: Boolean(element.disabled || element.getAttribute("aria-disabled") === "true"),
        };
      });
  });
}

function normalizeElementIndex(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function clickLocator(page, locator, selectorLabel) {
  try {
    await locator.click({ timeout: 5000 });
    await page.waitForTimeout(1500);
    return true;
  } catch (error) {
    console.log(`  Click failed on "${selectorLabel}": ${error.message}`);

    try {
      await locator.click({ timeout: 3000, force: true });
      await page.waitForTimeout(1500);
      console.log(`  Forced click succeeded on "${selectorLabel}"`);
      return true;
    } catch (forceError) {
      console.log(`  Forced click also failed on "${selectorLabel}": ${forceError.message}`);
      return false;
    }
  }
}

async function clickAction(page, selector, elementIndex) {
  const locator = page.locator(selector);
  const normalizedIndex = normalizeElementIndex(elementIndex);
  const target = normalizedIndex !== null
    ? locator.nth(normalizedIndex)
    : locator.first();

  await clickLocator(page, target, `${selector}${normalizedIndex !== null ? ` [${normalizedIndex}]` : ""}`);
}

async function clickAllAction(page, selector) {
  const maxClicks = Number(process.env.MAX_MULTI_CLICK_ACTIONS || 20);
  let clicks = 0;

  for (let attempt = 0; attempt < maxClicks; attempt++) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    let clicked = false;

    for (let index = 0; index < count; index++) {
      const candidate = locator.nth(index);
      const visible = await candidate.isVisible().catch(() => false);
      if (!visible) continue;

      const success = await clickLocator(page, candidate, `${selector} [${index}]`);
      if (success) {
        clicks += 1;
        clicked = true;
        break;
      }
    }

    if (!clicked) break;
  }

  console.log(`  Click-all completed. Clicked ${clicks} matching element(s).`);
}

async function loginSmart(page) {
  await page.waitForSelector("input", { timeout: 15000 });
  const html = await page.content();
  let selectors = {};

  try {
    selectors = await getLoginSelectors(html);
  } catch (error) {
    console.log("Login selector resolution failed in loginSmart, using defaults:", error.message);
  }

  const emailSelector = await findFirstWorkingSelector(page, [
    selectors.email,
    ...DEFAULT_LOGIN_SELECTORS.email,
  ]);
  const passwordSelector = await findFirstWorkingSelector(page, [
    selectors.password,
    ...DEFAULT_LOGIN_SELECTORS.password,
  ]);
  const submitSelector = await findFirstWorkingSelector(page, [
    selectors.submit,
    ...DEFAULT_LOGIN_SELECTORS.submit,
  ]);

  if (!emailSelector || !passwordSelector || !submitSelector) {
    throw new Error(
      `Unable to resolve login selectors. email=${emailSelector} password=${passwordSelector} submit=${submitSelector}`
    );
  }

  console.log("Resolved login selectors:", {
    email: emailSelector,
    password: passwordSelector,
    submit: submitSelector,
  });

  await page.locator(emailSelector).first().fill(process.env.EMAIL);
  await page.locator(passwordSelector).first().fill(process.env.PASSWORD);
  await page.locator(submitSelector).first().click();

  await page.waitForTimeout(3000);
  console.log("Login complete");
}

async function runStep(page, testerStep, screenshotDir) {
  const previousActions = [];
  const maxIterations = Number(process.env.MAX_STEP_ITERATIONS || 8);
  let lastAction = null;
  let repeatedActionCount = 0;
  let screenshotSaved = false;
  const stepScreenshotName = buildStepScreenshotName(testerStep);

  async function saveStepScreenshot(reason) {
    const filepath = path.join(screenshotDir, `${stepScreenshotName}.png`);
    await saveComparisonScreenshot(page, filepath);
    screenshotSaved = true;
    console.log(`  Screenshot saved: ${filepath}`);
    if (reason) {
      console.log(`  Screenshot reason: ${reason}`);
    }
  }

  console.log(`\nStep: "${testerStep}"`);

  for (let i = 0; i < maxIterations; i++) {
    const screenshotBuffer = await captureZoomedScreenshot(page);
    const screenshotBase64 = screenshotBuffer.toString("base64");
    const html = await page.content();
    const pageUrl = page.url();
    const pageTitle = await page.title().catch(() => "");
    const interactiveElements = await getInteractiveElements(page);

    const action = await getNextAction({
      screenshotBase64,
      testerStep,
      previousActions,
      pageUrl,
      pageTitle,
      html,
      interactiveElements,
    });

    console.log(`  Action ${i + 1}:`, action.action, "|", action.reasoning);

    if (isSameAction(action, lastAction)) {
      repeatedActionCount += 1;
    } else {
      repeatedActionCount = 0;
    }
    lastAction = action;

    if (repeatedActionCount >= 2) {
      console.log("  Repeated action detected. Ending step to avoid an infinite loop.");
      if (!screenshotSaved) {
        await saveStepScreenshot("fallback capture after repeated action");
      }
      break;
    }

    previousActions.push({
      action: action.action,
      selector: action.selector,
      element_index: normalizeElementIndex(action.element_index),
      value: action.value,
    });

    if (action.action === "screenshot") {
      await saveStepScreenshot("model requested screenshot");
      console.log("  Step complete");
      break;
    }

    if (action.action === "done") {
      if (!screenshotSaved) {
        await saveStepScreenshot("fallback capture before done");
      }
      console.log("  Step complete");
      break;
    }

    if (action.action === "click" && action.selector) {
      await clickAction(page, action.selector, action.element_index);
    }

    if (action.action === "click_all" && action.selector) {
      await clickAllAction(page, action.selector);
    }

    if (action.action === "type" && action.selector && action.value) {
      try {
        await page.locator(action.selector).first().fill(action.value);
        await page.waitForTimeout(500);
      } catch (error) {
        console.log(`  Type failed on "${action.selector}": ${error.message}`);
      }
    }

    if (action.action === "scroll") {
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(800);
    }

    if (action.action === "navigate" && action.value) {
      await page.goto(action.value);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);
    }
  }

  if (!screenshotSaved) {
    await saveStepScreenshot("fallback capture after max iterations");
  }
}

module.exports = { loginSmart, runStep };
