# Guard Duty Scheduler

Mobile-first React + TypeScript web app for managing military/team guard duty rotations. The primary output is a WhatsApp-shareable text message of the schedule. There is no live dashboard — the app is a scheduling and publishing tool.

## Architecture

- **Framework:** React + TypeScript (Vite)
- **Styling:** Tailwind CSS with dark mode (`class` strategy)
- **Routing:** React Router DOM (flat screen-per-file structure)
- **State:** React Context for active wizard session; localStorage for all persistence
- **Drag & Drop:** `@dnd-kit/core` (mobile touch support required)
- **No backend** — fully client-side, all data in localStorage

## Key Architectural Rules

- All localStorage access goes through typed helpers in `src/storage/` — never directly from components
- All scheduling math lives in pure functions in `src/logic/` — no side effects, no React
- Participant **name** is the unique key for statistics tracking across rounds
- Schedules are immutable once saved — history is never retroactively modified
- One-time renames in Step 4 do NOT propagate to the saved group

## Docs

@docs/business-logic.md
@docs/CONVENTIONS.md
@docs/ERRORS.md

## Requirements

- Every iteration, follow @TESTING.md rules.
- Run `vitest run --coverage` after every implementation step and every migration. Coverage must stay at or above 90% for `src/logic/` and `src/storage/` before moving on.
- When fixing an issue, write a dedicated test specifically for the broken feature that had the issue, to prevent any regression.
- Use `python3` for bash commands
- All UI text must be in hebrew.

## Commands

| Purpose                            | Command                                      |
| ---------------------------------- | -------------------------------------------- |
| Type check (must pass before done) | `npx tsc --noEmit`                           |
| Run all tests with coverage        | `npx vitest run --coverage`                  |
| Run a single test file             | `npx vitest run tests/e2e/fileName.test.tsx` |
| Dev server                         | `npm run dev`                                |
| Production build                   | `npm run build`                              |

**After every migration, run these two in order before declaring done:**

1. `npx tsc --noEmit` — zero errors required
2. `npx vitest run --coverage` — ≥90% coverage required for `src/logic/` and `src/storage/`
