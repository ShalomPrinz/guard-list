## Migration 010 — כיתת כוננות Feature

**Type:** Feature  
**Depends on:** Migration 009.1 complete

**Context:**

> The app currently supports only time-based guard duty lists created through the full wizard. A new lightweight feature is needed for "כיתת כוננות" (standby unit) duty — selecting available people from a saved group with no time range, no scheduling math, and no wizard. The output is a simple numbered list shared via WhatsApp text.

**Goal:** Add a "כיתת כוננות" flow accessible from HomeScreen that lets the user pick available members from a saved group and share the result as a formatted WhatsApp message.

**Tell Claude Code:**

> **Entry point:** Add a new button on HomeScreen directly below the "צור שמירה" button, labeled "כיתת כוננות". If no saved group exists, apply the same guard as the welcome screen (Migration 006) — show an error or disable the button with a tooltip explaining a saved group is required.
>
> **StandbyScreen (`src/screens/StandbyScreen.tsx`):** A single screen, no wizard. It must:
>
> - Show the saved group name as a subtitle
> - List all group members with their current availability status. Members marked "בסיס" are shown and selectable. Members marked "בית" are shown but grayed out and non-selectable — do not hide them, so the user has full visibility of who is unavailable
> - Each "בסיס" member has a checkbox. All "בסיס" members are selected by default on screen mount
> - A "בחר הכל" / "בטל הכל" toggle button selects or deselects all available members at once
> - A text input at the top for the list title, pre-filled with "כיתת כוננות"
> - Two action buttons at the bottom: "העתק לווטסאפ" and "שלח בווטסאפ" — same behavior as the equivalent buttons in ResultScreen
> - A Back button that returns to HomeScreen without saving anything
>
> **Output format** for both WhatsApp actions:
>
> ```
> [title]
>
> 1. Soldier A
> 2. Soldier B
> 3. Soldier C
> ```
>
> The numbered list contains only the selected members, in the order they appear on screen. No times, no stations, no extra formatting.
>
> **No persistence:** Do not save standby lists to localStorage. This screen is stateless — every visit starts fresh. Do not update statistics from standby selections.
>
> **If multiple saved groups exist:** Show a group selector at the top of StandbyScreen (a simple dropdown) so the user can pick which group to draw members from. If only one group exists, skip the selector.
>
> Add E2E tests in `tests/e2e/standby.test.tsx` covering:
>
> - StandbyScreen renders all "בסיס" members as selected and all "בית" members as grayed and unselectable
> - Deselecting a member removes them from the formatted output
> - "בחר הכל" selects all available members; "בטל הכל" deselects all
> - The formatted WhatsApp text matches the expected numbered list format with the correct title
> - With multiple groups, selecting a different group updates the member list
> - Clicking Back returns to HomeScreen
>
> Run `vitest run --coverage` when done and confirm coverage is ≥90% for `src/logic/` and `src/storage/`.

**Deliverables:** "כיתת כוננות" button appears on HomeScreen. StandbyScreen shows available members with checkboxes, a title input, and WhatsApp share buttons. Output is a clean numbered list. No persistence. Tests pass with ≥90% coverage.
