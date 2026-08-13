const fs = require('fs');
let code = fs.readFileSync('utils/llm.js', 'utf8');

// 1. Remove groq imports and setup callGemini helper
code = code.replace(
  /const Groq = require\("groq-sdk"\);\s*const groq = new Groq\(\{ apiKey: process.env.GROQ_API_KEY \}\);/m,
  `async function callGemini(model, prompt, base64Image = null) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set in environment.');
  const url = \`https://generativelanguage.googleapis.com/v1beta/models/\${model}:generateContent?key=\${apiKey}\`;
  const parts = [{ text: prompt }];
  if (base64Image) {
    parts.push({ inline_data: { mime_type: 'image/png', data: base64Image } });
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0 } })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Gemini API Error');
  if (!data.candidates || data.candidates.length === 0) throw new Error('No candidates returned from Gemini');
  return data.candidates[0].content.parts[0].text;
}`
);

// 2. Replace rate limit checkers
code = code.replace(
  /function isRateLimitError\(error\) \{[\s\S]*?\}/,
  `function isRateLimitError(error) {
  return error && typeof error.message === 'string' && (error.message.includes('Quota exceeded') || error.message.includes('rate limit') || error.message.includes('429'));
}`
);

// 3. Replace getLoginSelectors groq call
code = code.replace(
  /const res = await groq\.chat\.completions\.create\(\{[\s\S]*?return parseJsonResponse\(res\.choices\[0\]\.message\.content\.trim\(\)\);/m,
  `const prompt = \`
Return ONLY valid JSON. No explanation, no markdown, no backticks.

Find the CSS selectors for the login form fields.

Format:
{
  "email": "<css selector for email or username input>",
  "password": "<css selector for password input>",
  "submit": "<css selector for the login/submit button>"
}

HTML:
\${html.slice(0, 8000)}
\`;
    const responseText = await callGemini('gemini-1.5-flash', prompt);
    return parseJsonResponse(responseText.trim());`
);

// 4. Replace getNextAction groq calls
code = code.replace(
  /const visionModel = process\.env\.GROQ_VISION_MODEL \|\| "llama-3\.2-11b-vision-preview";/,
  `const visionModel = process.env.GEMINI_VISION_MODEL || "gemini-1.5-pro";`
);
code = code.replace(
  /const textModel = process\.env\.GROQ_TEXT_MODEL \|\| "llama-3\.3-70b-versatile";/,
  `const textModel = process.env.GEMINI_TEXT_MODEL || "gemini-1.5-flash";`
);

code = code.replace(
  /const res = await groq\.chat\.completions\.create\(\{\s*model: visionModel,[\s\S]*?\}\);[\s\S]*?return parseJsonResponse\(res\.choices\[0\]\.message\.content\.trim\(\)\);/m,
  `const prompt = \`\${textPrompt}\\nUse the attached screenshot as the primary source of truth for the visible UI.\`;
      const responseText = await callGemini(visionModel, prompt, screenshotBase64);
      return parseJsonResponse(responseText.trim());`
);

code = code.replace(
  /const res = await groq\.chat\.completions\.create\(\{\s*model: textModel,[\s\S]*?\}\);[\s\S]*?return parseJsonResponse\(res\.choices\[0\]\.message\.content\.trim\(\)\);/m,
  `const prompt = \`\${textPrompt}\\nThe screenshot could not be attached, so use the DOM snapshot, URL, and page title instead.\`;
      const responseText = await callGemini(textModel, prompt);
      return parseJsonResponse(responseText.trim());`
);

code = code.replace(/Groq/g, 'Gemini');
code = code.replace(/groq/g, 'gemini');

fs.writeFileSync('utils/llm.js', code);
