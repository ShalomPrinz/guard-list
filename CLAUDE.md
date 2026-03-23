# Guard Duty Scheduler

Mobile-first React + TypeScript web app for managing military/team guard duty rotations. The primary output is a WhatsApp-shareable text message of the schedule. There is no live dashboard — the app is a scheduling and publishing tool.

## Architecture

- **Framework:** React + TypeScript (Vite)
- **Styling:** Tailwind CSS with dark mode (`class` strategy)
- **Routing:** React Router DOM (flat screen-per-file structure)
- **State:** React Context for active wizard session; localStorage for all persistence
- **Drag & Drop:** `@dnd-kit/core` (mobile touch support required)
- **Persistence:** localStorage as source of truth; Upstash Redis (via Vercel Edge Function at `api/kv.ts`) as silent background backup
- **Identity:** Username stored in localStorage indefinitely via `src/storage/userStorage.ts`; scopes all KV keys
- **No backend** — fully client-side except for the single Edge Function that proxies KV writes

### KV Database

- All KV (Upstash Redis) access goes through `src/storage/cloudStorage.ts` — never imported directly by components or logic
- KV is a fire-and-forget backup layer only — localStorage is always the source of truth. KV failure is always silent
- All KV keys are scoped by username: `{username}:{namespace}:{id}` — helpers add the prefix automatically, callers never include it
- `syncFromCloud()` runs once on app startup and only fills gaps — it never overwrites existing localStorage data
- Wizard session state, UniteScreen state, and standby selections are intentionally ephemeral — they are never written to KV

## Docs

@docs/business-logic.md
@docs/CONVENTIONS.md
@docs/ERRORS.md

## Keeping Project Memory Fresh

After completing any non-trivial piece of work, run:

> /update-docs

This prompts Claude Code to review the session and decide whether `docs/CONVENTIONS.md` or `docs/ERRORS.md` need new entries. It outputs only the additions — never rewrites the whole file.

Run it before ending any session where you: added a new component pattern, fixed a bug that took more than one attempt, or were told to never do something again.

## Requirements

- Every iteration, follow @TESTING.md rules.
- When fixing an issue, write a dedicated test specifically for the broken feature that had the issue, to prevent any regression.
- Use `python3` for bash commands
- All UI text must be in hebrew.

## Commands

| Purpose                            | Command                                      |
| ---------------------------------- | -------------------------------------------- |
| Type check (must pass before done) | `npx tsc --noEmit`                           |
| Run all tests with coverage        | `npx vitest run --coverage`                  |
| Run a single test file             | `npx vitest run tests/test-folder/fileName.test.tsx` |
| Dev server                         | `npm run dev`                                |
| Production build                   | `npm run build`                              |

**At the end of every prompt run which introduced any code change, run these two in order before declaring done:**

1. `npx tsc --noEmit` — zero errors required
2. `npx vitest run --coverage` — ≥90% coverage required for `src/logic/` and `src/storage/`
