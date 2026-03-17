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

---

## Migration 009.1 — Fix CI and Build Errors

**Type:** Bugfix / Infrastructure

**Context:**

> Two categories of errors surfaced after setting up CI/CD in Migration 009. First, `window.scrollTo` is called in component mounts (added in Migration 004) but is not implemented in the jsdom test environment, producing noise across the entire CI log. Second, the Vercel build fails due to a TypeScript error in `tests/e2e/flowMigration008.test.tsx` — a declared but unused variable `user` causes `tsc` to exit with code 2, blocking deployment.

**Goal:** Silence the `window.scrollTo` error in the test environment. Fix all TypeScript errors that cause the build to fail.

**Tell Claude Code:**

> **Fix `window.scrollTo` in tests:** In the global test setup file (e.g. `src/test/setup.ts` or wherever `setupFilesAfterFramework` points in `vitest.config.ts`), add a mock for `window.scrollTo`:
>
> ```ts
> window.scrollTo = vi.fn();
> ```
>
> This suppresses the "Not implemented" jsdom warning across all test files without touching any component code. Do not mock it per-file — the global setup is the correct location.
>
> **Fix TypeScript unused variable errors:** Run `tsc --noEmit` locally across the entire project (not just `src/` — include `tests/`) to surface every TypeScript error that would cause the build to fail. Fix all of them. For the known case in `tests/e2e/flowMigration008.test.tsx` line 228: either remove the unused `user` variable or prefix it with `_` (e.g. `_user`) to signal intentional non-use, whichever is more appropriate given the context. Apply the same fix pattern to any other unused variables found by `tsc`.
>
> **Prevent recurrence:** In `vitest.config.ts`, ensure `typecheck` is enabled or add a dedicated `tsc --noEmit` step in `.github/workflows/ci.yml` before the test run step, so TypeScript errors are caught in CI before the Vercel build attempts. The workflow steps in order should now be:
>
> 1. Checkout code
> 2. Setup Node.js
> 3. Install dependencies (`npm ci`)
> 4. Type check (`npx tsc --noEmit`)
> 5. Run tests with coverage (`vitest run --coverage`)
>
> Do not change any application logic or component behavior.
>
> Run `vitest run --coverage` when done and confirm no `window.scrollTo` warnings appear in the output and coverage remains ≥90% for `src/logic/` and `src/storage/`.

**Deliverables:** No `window.scrollTo` errors in CI output. `tsc --noEmit` passes with zero errors across the full project. Vercel build succeeds. CI workflow runs type check before tests. Coverage ≥90% maintained.
