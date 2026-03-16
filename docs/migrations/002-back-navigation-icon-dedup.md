## Migration 002 — Back Navigation Fix & Icon Deduplication

**Type:** Bugfix  
**Depends on:** Migration 001 complete

**Context:**
> The "Continue Round" flow re-enters the wizard in continuation mode. After the user completes the continuation and lands on ResultScreen, pressing "Back" navigates to the wrong screen instead of returning to the continuation wizard's last step (Step4_Review). This is likely caused by the continuation flow pushing the wrong history entry or sharing router state with the original creation flow.
>
> Additionally, `app-icon.png` exists in both `assets/` and `public/`. Migration 001 referenced `assets/app-icon.png` — check which path is actually used in `index.html` and in the HomeScreen header, then delete the unused copy.

**Goal:** Fix the Back button destination after creating a continuation round. Remove the duplicate icon file.

**Tell Claude Code:**
> **Back navigation fix:** Trace the router history in the "Continue Round" flow. When the user presses "Back" from ResultScreen after a continuation, they should return to Step4_Review of that continuation wizard — not to the original ResultScreen or HomeScreen. Ensure the wizard state (stations, time config, participant order) for the continuation is still intact when navigating back, so the user can make edits and re-create. Do not change Back navigation behavior in the original (non-continuation) creation flow.
>
> **Icon deduplication:** Check which path (`assets/app-icon.png` or `public/app-icon.png`) is referenced in `index.html` and in the HomeScreen header component. Delete the file at the other path. Do not change any import or reference — only remove the unused file.
>
> Run `vitest run --coverage` when done and confirm coverage is still ≥90% for `src/logic/` and `src/storage/`.

**Deliverables:** Back button from a continuation ResultScreen returns to Step4_Review with wizard state intact. Exactly one copy of `app-icon.png` remains in the project. Tests pass with ≥90% coverage.