# Unit Tests

Focus: Pure functions and utility logic in `src/logic/`.
Location: Test files co-located next to the logic they cover (`src/logic/*.test.ts`).
Tool: Vitest

Requirements:
- Test all scheduling calculations (duration from time range, all three rounding algorithms).
- Test schedule generation determinism: same inputs must always produce identical output.
- Test midnight crossover: participants whose shift crosses 00:00 must have their date incremented.
- Test uneven distribution logic — both Option A (equal duration) and Option B (equal end time) — for all edge counts (e.g. 7 participants across 2 stations).
- Test continue-round start time derivation: actual end time vs. planned end time paths.
- Test statistics update logic: correct increment of shifts and minutes per participant name; headcount station participants must never appear in stats.
- Test WhatsApp text formatter output format matches the expected template exactly.
- Test deduplication of member names on group creation.

# E2E Tests

Focus: Testing full wizard flows and localStorage persistence without a real browser session.
Location: `/tests/e2e/`
Tool: Vitest + `@testing-library/react` + `localStorageMock`

Approach:
- Mount the full wizard component tree with a mocked localStorage.
- Drive each step (Stations → Time → Order → Review → Create) programmatically via user-event.
- Assert the correct `Schedule` object is written to localStorage after "Create Schedule".
- Assert statistics are updated correctly after schedule creation.

Verify:
- Ensure "Create Schedule" is blocked when all participants are marked "Home".
- Ensure duration ≤ 0 blocks progression from Step 2.
- Ensure a continue-round schedule correctly inherits station structure and roster from the parent round.
- Ensure a one-time participant rename in Step 4 does not mutate the saved group in localStorage.

## Mocking Storage

When testing wizard flows, do not rely on a real browser's localStorage. Follow these rules:

- **Storage Injection:** The storage helpers in `src/storage/` accept an optional storage interface argument, defaulting to `window.localStorage`. Tests pass a `localStorageMock` (in-memory Map) instead.
- **Success Paths:** Pre-seed localStorage with a saved group and station config to verify the wizard reads and uses them correctly.
- **Failure Paths:** Pre-seed with edge-case data (empty group, all-Home members, single participant) to verify error states and blocked transitions.

**Most Important Rule — Zero Overhead:** E2E tests run entirely in-memory with no browser, no network, and no real DOM storage. Every test starts with a clean localStorage mock.

# Automation & CI

- Coverage: Aim for 90% logic coverage in `src/logic/` and `src/storage/`.
- Command: `vitest run --coverage`
- Pre-commit: Run unit tests before every push to ensure no regression in scheduling logic.
