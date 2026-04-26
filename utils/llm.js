require("dotenv").config();
const Groq = require("groq-sdk");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function normalizeText(value) {
  return (value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function parseJsonResponse(content) {
  const text = content.replace(/```json|```/g, "").trim();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  const jsonText =
    firstBrace >= 0 && lastBrace >= firstBrace
      ? text.slice(firstBrace, lastBrace + 1)
      : text;

  return JSON.parse(jsonText);
}

function isRateLimitError(error) {
  return (
    error &&
    typeof error.message === "string" &&
    (error.message.includes("rate_limit_exceeded") || error.message.includes("Rate limit reached"))
  );
}

function buildFallbackLoginSelectors(html) {
  const source = String(html || "").toLowerCase();

  const pickSelector = options => {
    for (const option of options) {
      if (option.match(source)) {
        return option.selector;
      }
    }
    return options[0].selector;
  };

  return {
    email: pickSelector([
      { selector: "#email", match: text => text.includes('id="email"') || text.includes("id='email'") },
      { selector: 'input[name="email"]', match: text => text.includes('name="email"') || text.includes("name='email'") },
      { selector: 'input[type="email"]', match: text => text.includes('type="email"') || text.includes("type='email'") },
      { selector: 'input[placeholder*="Email" i]', match: text => text.includes("placeholder") && text.includes("email") },
      { selector: 'input[name="username"]', match: text => text.includes('name="username"') || text.includes("name='username'") },
      { selector: 'input[placeholder*="User" i]', match: text => text.includes("placeholder") && text.includes("user") },
    ]),
    password: pickSelector([
      { selector: "#password", match: text => text.includes('id="password"') || text.includes("id='password'") },
      { selector: 'input[name="password"]', match: text => text.includes('name="password"') || text.includes("name='password'") },
      { selector: 'input[type="password"]', match: text => text.includes('type="password"') || text.includes("type='password'") },
      { selector: 'input[placeholder*="Password" i]', match: text => text.includes("placeholder") && text.includes("password") },
    ]),
    submit: pickSelector([
      {
        selector: ".MuiButton-containedPrimary",
        match: text => text.includes("muibutton-containedprimary"),
      },
      {
        selector: 'button[type="submit"]',
        match: text => text.includes('button') && (text.includes('type="submit"') || text.includes("type='submit'")),
      },
      {
        selector: 'input[type="submit"]',
        match: text => text.includes('input') && (text.includes('type="submit"') || text.includes("type='submit'")),
      },
      {
        selector: 'button:has-text("Login")',
        match: text => text.includes(">login<") || text.includes("login"),
      },
      {
        selector: 'button:has-text("Sign in")',
        match: text => text.includes("sign in"),
      },
      {
        selector: '[role="button"]:has-text("Login")',
        match: text => text.includes('role="button"') && text.includes("login"),
      },
    ]),
  };
}

function hasPreviousAction(previousActions, action, selector) {
  return previousActions.some(item => item.action === action && item.selector === selector);
}

function findElement(interactiveElements, matcher) {
  return (interactiveElements || []).find(element => !element.disabled && matcher(element));
}

function buildAction(action, selector, reasoning, extra = {}) {
  return {
    action,
    selector: selector || null,
    element_index: extra.element_index ?? null,
    value: extra.value ?? null,
    screenshot_name: extra.screenshot_name || "step_state",
    reasoning,
  };
}

function isGenericFallbackAction(action) {
  return (
    action &&
    (
      action.action === "scroll" ||
      (action.action === "screenshot" && action.screenshot_name === "step_state")
    )
  );
}

function buildHeuristicAction({ testerStep, previousActions, pageUrl, pageTitle, html, interactiveElements }) {
  const step = normalizeText(testerStep);
  const title = normalizeText(pageTitle);
  const url = normalizeText(pageUrl);
  const dom = normalizeText(html).slice(0, 6000);
  const elements = interactiveElements || [];

  const hasCheckout = Boolean(findElement(elements, el => normalizeText(el.text).includes("checkout")));
  const hasAddToCart = Boolean(findElement(elements, el => normalizeText(el.text).includes("add to cart")));
  const hasShop = Boolean(findElement(elements, el => normalizeText(el.text) === "shop"));
  const hasCartSummary = title.includes("cart") || dom.includes("shopping cart") || dom.includes("subtotal");
  const isDashboard = title.includes("dashboard") || dom.includes("customer dashboard") || dom.includes("customer panel");
  const isCheckoutPage =
    url.includes("checkout") ||
    title.includes("checkout") ||
    dom.includes("checkout") ||
    dom.includes("shipping address") ||
    dom.includes("payment");

  if (step.includes("dashboard")) {
    if (isDashboard) {
      return buildAction("screenshot", null, "Heuristic fallback: the dashboard is already visible.", {
        screenshot_name: "check_the_dashboard",
      });
    }

    const dashboardButton = findElement(elements, el => normalizeText(el.text).includes("dashboard"));
    if (dashboardButton && !hasPreviousAction(previousActions, "click", dashboardButton.selector)) {
      return buildAction("click", dashboardButton.selector, "Heuristic fallback: open the dashboard first.", {
        element_index: dashboardButton.element_index,
        screenshot_name: "check_the_dashboard",
      });
    }
  }

  if (step.includes("browse") && (step.includes("food menu") || step.includes("menu"))) {
    if (hasAddToCart || hasCheckout || dom.includes("shopping cart")) {
      return buildAction("screenshot", null, "Heuristic fallback: the menu view is visible and ready.", {
        screenshot_name: "browse_the_food_menu",
      });
    }

    const shopButton = findElement(elements, el => normalizeText(el.text) === "shop");
    if (shopButton && !hasPreviousAction(previousActions, "click", shopButton.selector)) {
      return buildAction("click", shopButton.selector, "Heuristic fallback: click Shop to open the menu.", {
        element_index: shopButton.element_index,
        screenshot_name: "browse_the_food_menu",
      });
    }
  }

  if (step.includes("add all") && step.includes("cart")) {
    const addToCartButton = findElement(elements, el => normalizeText(el.text).includes("add to cart"));
    if (addToCartButton && !previousActions.some(item => item.action === "click_all")) {
      return buildAction("click_all", addToCartButton.selector, "Heuristic fallback: add all visible items to the cart.", {
        screenshot_name: "add_all_the_items_to_the_cart",
      });
    }

    if (hasCheckout || dom.includes("shopping cart")) {
      return buildAction("screenshot", null, "Heuristic fallback: cart updates are visible after adding items.", {
        screenshot_name: "add_all_the_items_to_the_cart",
      });
    }
  }

  if (step.includes("cart page")) {
    if (hasCartSummary || hasCheckout) {
      return buildAction("screenshot", null, "Heuristic fallback: the cart page is already visible.", {
        screenshot_name: "go_to_the_cart_page",
      });
    }

    const cartButton = findElement(
      elements,
      el => normalizeText(el.text).includes("cart") || normalizeText(el.aria_label).includes("cart")
    );
    if (cartButton && !hasPreviousAction(previousActions, "click", cartButton.selector)) {
      return buildAction("click", cartButton.selector, "Heuristic fallback: open the cart page.", {
        element_index: cartButton.element_index,
        screenshot_name: "go_to_the_cart_page",
      });
    }
  }

  if (step.includes("checkout")) {
    if (isCheckoutPage) {
      return buildAction("screenshot", null, "Heuristic fallback: the checkout page is visible.", {
        screenshot_name: "proceed_to_checkout",
      });
    }

    const checkoutButton = findElement(elements, el => normalizeText(el.text).includes("checkout"));
    if (checkoutButton && !hasPreviousAction(previousActions, "click", checkoutButton.selector)) {
      return buildAction("click", checkoutButton.selector, "Heuristic fallback: click Checkout to proceed.", {
        element_index: checkoutButton.element_index,
        screenshot_name: "proceed_to_checkout",
      });
    }
  }

  if (elements.length > 0 && !previousActions.some(item => item.action === "scroll")) {
    return buildAction("scroll", null, "Heuristic fallback: scroll once to reveal more of the page.");
  }

  return buildAction("screenshot", null, "Heuristic fallback: capture the current page state.", {
    screenshot_name: "step_state",
  });
}

function buildNextActionPrompt({
  testerStep,
  previousActions,
  pageUrl,
  pageTitle,
  html,
  interactiveElements,
}) {
  return `
You are a browser automation agent deciding the SINGLE next action for a web page.

Tester instruction: "${testerStep}"
Previous actions already taken: ${JSON.stringify(previousActions)}
Current page URL: ${pageUrl || ""}
Current page title: ${pageTitle || ""}

Return ONLY valid JSON. No markdown, no explanation.
{
  "action": "click" | "click_all" | "type" | "scroll" | "navigate" | "screenshot" | "done",
  "selector": "<Playwright selector of the element(s) to act on, or null if not needed>",
  "element_index": "<0-based index among matches for selector, or null>",
  "value": "<text to type, or URL to navigate to, or null>",
  "screenshot_name": "<short_snake_case name describing this page state, no extension>",
  "reasoning": "<one sentence explaining why>"
}

Rules:
- Use "screenshot" when the current page matches the tester instruction and is ready to capture.
- Use "done" only after the screenshot has already been taken for this step.
- "screenshot_name" must be stable and descriptive so baseline vs current images can be matched.
- Prefer selectors from the Visible interactive elements list whenever possible.
- Treat "selector" as a Playwright locator string, for example: button:has-text("Checkout"), a:has-text("Cart"), [data-testid="checkout"].
- Use "element_index" when the selector matches multiple similar buttons and you need a specific one.
- Use "click_all" only when the tester instruction explicitly asks for all/every items and the selector clearly targets only the relevant repeated controls.
- Never click unrelated buttons or links that do not help satisfy the tester instruction.
- Never repeat an action from previousActions unless the page visibly changed or you are deliberately clicking a different element_index.
- If the target element may be below the fold, use "scroll" first.

Visible interactive elements:
${JSON.stringify(interactiveElements || [], null, 2)}

DOM snapshot:
${(html || "").slice(0, 8000)}
`;
}

// Reads page HTML and returns CSS selectors for login form
async function getLoginSelectors(html) {
  try {
    const res = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: `
Return ONLY valid JSON. No explanation, no markdown, no backticks.

Find the CSS selectors for the login form fields.

Format:
{
  "email": "<css selector for email or username input>",
  "password": "<css selector for password input>",
  "submit": "<css selector for the login/submit button>"
}

HTML:
${html.slice(0, 8000)}
`,
      }],
    });

    return parseJsonResponse(res.choices[0].message.content.trim());
  } catch (error) {
    console.log("Login selector request failed, using local fallback:", error.message);
    return buildFallbackLoginSelectors(html);
  }
}

// Tries a multimodal request first. If Groq rejects image parts for the
// selected model/account, fall back to a text-only DOM snapshot prompt.
async function getNextAction({
  screenshotBase64,
  testerStep,
  previousActions,
  pageUrl,
  pageTitle,
  html,
  interactiveElements,
}) {
  const textPrompt = buildNextActionPrompt({
    testerStep,
    previousActions,
    pageUrl,
    pageTitle,
    html,
    interactiveElements,
  });

  const visionModel = process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";
  const textModel = process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile";

  try {
    const res = await groq.chat.completions.create({
      model: visionModel,
      max_tokens: 300,
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `${textPrompt}\nUse the attached screenshot as the primary source of truth for the visible UI.`,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${screenshotBase64}`,
              detail: "auto",
            },
          },
        ],
      }],
    });

    return parseJsonResponse(res.choices[0].message.content.trim());
  } catch (error) {
    console.log("Vision request failed, falling back to HTML context:", error.message);
    try {
      const res = await groq.chat.completions.create({
        model: textModel,
        max_tokens: 300,
        messages: [{
          role: "user",
          content: `${textPrompt}\nThe screenshot could not be attached, so use the DOM snapshot, URL, and page title instead.`,
        }],
      });

      return parseJsonResponse(res.choices[0].message.content.trim());
    } catch (fallbackError) {
      console.log("Text request failed, using local heuristic fallback:", fallbackError.message);

      const heuristicAction = buildHeuristicAction({
        testerStep,
        previousActions,
        pageUrl,
        pageTitle,
        html,
        interactiveElements,
      });

      if ((isRateLimitError(fallbackError) || isRateLimitError(error)) && isGenericFallbackAction(heuristicAction)) {
        throw new Error(
          "Groq rate limit reached and local fallback could not confidently satisfy this step. " +
          "Retry after the rate-limit window, reduce test scope, or improve deterministic selectors for this flow."
        );
      }

      if (!isRateLimitError(fallbackError) && !isRateLimitError(error)) {
        console.log("Proceeding with heuristic fallback to keep the test moving.");
      }

      return heuristicAction;
    }
  }
}

module.exports = { getLoginSelectors, getNextAction };
