# AI Visual Testing — Integration Guide

Use this guide to connect **your own repository** to this AI Visual Testing engine.
You do not need to fork this repository, share your source code, or give us access to your codebase.
All you need is:
- Your website's URL
- Login credentials for the app
- A Personal Access Token (PAT) we provide you

---

## Step 1 — Get a Personal Access Token from the Repo Owner

Contact the owner of the `Ai_visual_Testing` repository and ask them to generate a
**Personal Access Token (PAT)** with permission to trigger `repository_dispatch` events.

They will securely send you a token that looks like: `ghp_xxxxxxxxxxxxxxxxxxxxx`

> ⚠️ **Treat this token like a password. Never commit it to your code.**

---

## Step 2 — Add Secrets to Your Repository

Go to your repository on GitHub:
`Settings → Secrets and variables → Actions → New repository secret`

Add the following secrets:

| Secret Name              | Value                                       |
|--------------------------|---------------------------------------------|
| `VISUAL_TESTING_TOKEN`   | The PAT token given to you by the repo owner |
| `APP_PASSWORD`           | The password used to log in to your website  |

---

## Step 3 — Add the Trigger to Your Workflow

In your repository, create or edit the file `.github/workflows/deploy.yml`
and add the following job **after your deployment step**:

```yaml
name: Deploy and Test

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy your website
        run: echo "Your deployment steps here..."

      # Add this step AFTER your deployment completes
      - name: Trigger AI Visual Tests
        run: |
          curl -X POST \
            https://api.github.com/repos/guptaabhishek2265/Ai_visual_Testing/dispatches \
            -H "Accept: application/vnd.github.v3+json" \
            -H "Authorization: token ${{ secrets.VISUAL_TESTING_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{
              "event_type": "run-visual-tests",
              "client_payload": {
                "app_url":   "https://your-website.com/login",
                "email":     "testuser@your-website.com",
                "password":  "${{ secrets.APP_PASSWORD }}"
              }
            }'
```

> ✅ That's it! Every time you push code, your website deploys and visual tests
> run automatically on the live URL.

---

## Advanced Options

You can pass additional fields in the `client_payload`:

| Field            | Required | Description |
|------------------|----------|-------------|
| `app_url`        | ✅ Yes   | The full URL of your login page |
| `email`          | ✅ Yes   | The email/username to log in with |
| `password`       | ✅ Yes   | The password (stored in YOUR secrets, never ours) |
| `steps_url`      | ❌ No    | A public URL to a custom `steps.txt` file that defines your test flow |
| `source_repo`    | ❌ No    | Your GitHub repo name (e.g. `your-org/your-repo`) for commit tracking in the report |
| `commit_message` | ❌ No    | The commit message to display in the Allure report |
| `commit_sha`     | ❌ No    | The short commit SHA to display in the Allure report |

### Example with all optional fields

```yaml
- name: Trigger AI Visual Tests (full config)
  run: |
    curl -X POST \
      https://api.github.com/repos/guptaabhishek2265/Ai_visual_Testing/dispatches \
      -H "Accept: application/vnd.github.v3+json" \
      -H "Authorization: token ${{ secrets.VISUAL_TESTING_TOKEN }}" \
      -H "Content-Type: application/json" \
      -d '{
        "event_type": "run-visual-tests",
        "client_payload": {
          "app_url":        "https://your-website.com/login",
          "email":          "testuser@your-website.com",
          "password":       "${{ secrets.APP_PASSWORD }}",
          "steps_url":      "https://raw.githubusercontent.com/your-org/your-repo/main/visual-tests/steps.txt",
          "source_repo":    "${{ github.repository }}",
          "commit_message": "${{ github.event.head_commit.message }}",
          "commit_sha":     "${{ github.sha }}"
        }
      }'
```

---

## What is steps.txt?

The `steps.txt` file defines what your test will do in plain English.
If you do not provide a `steps_url`, the default test steps from this repository will be used.

To write your own `steps.txt`, use this format:

```
[suite: smoke]
[test: Homepage loads]
[labels: @critical]
Check the homepage and take a screenshot.

[suite: regression]
[test: User login flow]
[labels: @regression]
Log in and check the dashboard and take a screenshot.
Browse to the products page and take a screenshot.
```

Host it anywhere publicly accessible (e.g., a raw GitHub URL) and pass it as `steps_url`.

---

## Viewing Your Test Results

After the tests run, navigate to the `Ai_visual_Testing` repository:

1. Click the **Actions** tab
2. Find your workflow run
3. Download the **allure-report** artifact
4. Open `index.html` in your browser

The report will show:
- ✅ Green: No visual changes detected
- ❌ Red: Visual differences found, with diff images and AI explanations
