## Migration 009 — CI/CD Pipeline

**Type:** Infrastructure  
**Depends on:** Migration 008.1 complete

**Context:**

> The app is deployed via Vercel connected directly to the GitHub repository. Currently there is no CI step — every push to main triggers a Vercel deployment immediately regardless of test results. Tests exist and must pass before any production deployment goes live.

**Goal:** Add a GitHub Actions workflow that runs all tests on every push to main and blocks Vercel deployment if tests fail.

**Tell Claude Code:**

> Create `.github/workflows/ci.yml`. The workflow must:
>
> - Trigger on every push to `main` and on every pull request targeting `main`
> - Run on `ubuntu-latest`
> - Install dependencies with `npm ci`
> - Run `vitest run --coverage`
> - Fail the workflow if coverage drops below 90% for `src/logic/` and `src/storage/` — configure this threshold in `vitest.config.ts` under `coverage.thresholds` so the command itself exits with a non-zero code on failure, rather than relying on a separate check step
>
> **Block Vercel on test failure:** Use Vercel's native GitHub Checks integration rather than the CLI. In the Vercel dashboard, go to Project → Settings → Git and enable "Required Checks". Add the GitHub Actions workflow job name (e.g. `test`) as a required check. This tells Vercel to wait for that check to pass before deploying — no CLI, no tokens, no extra workflow steps needed. Add a comment at the top of the workflow file explaining this setup:
>
> ```yaml
> # To complete CI/CD setup, go to Vercel Dashboard → Project → Settings → Git
> # and add this workflow's job name ("test") as a Required Check.
> # Vercel will not deploy until this job passes.
> ```
>
> The workflow steps in order:
>
> 1. Checkout code
> 2. Setup Node.js (match the version in `package.json` engines field, or default to 20)
> 3. Install dependencies (`npm ci`)
> 4. Run tests with coverage (`vitest run --coverage`)
>
> Do not add any other workflow files or change any application code.

**Deliverables:** `.github/workflows/ci.yml` exists and triggers on push to main. Tests and coverage threshold run automatically. Setup instructions for the Vercel Required Checks configuration are documented in the workflow file as comments.
