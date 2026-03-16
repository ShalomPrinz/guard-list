## Migration 006 — Welcome Screen, Header Icon Fix, Dark Mode Toggle

**Type:** UI / Feature  
**Depends on:** Migration 005 complete

**Context:**

> Three issues exist in the current state:
>
> 1. If no saved group exists, HomeScreen renders an empty groups section with no guidance. The user has no clear entry point and the "New Schedule" button leads nowhere useful.
> 2. The app icon in the global Header is black, rendering it invisible against the dark blue header background in both light and dark mode.
> 3. There is no way for the user to toggle between dark and light mode — the app currently follows the system preference only, with no manual override.

**Goal:** Show a welcome screen when no group exists. Fix icon visibility in the header. Add a dark/light mode toggle to the header.

**Tell Claude Code:**

> **Welcome screen:** In HomeScreen, check whether `groups` in localStorage is empty or absent. If so, render a welcome state instead of the normal HomeScreen content. The welcome state must:
>
> - Show the app icon and name centered on the screen
> - Show a short Hebrew message explaining the user needs to create a group first, e.g. "ברוך הבא! כדי להתחיל, צור קבוצת לוחמים שמורה"
> - Show a single prominent CTA button: "צור קבוצה" which navigates directly to the group creation flow
> - Not show the "New Schedule", "Statistics", or past schedules sections
> - Disappear automatically once the first group is saved and the user returns to HomeScreen
>
> **Header icon color:** In `Header.tsx`, apply `filter: brightness(0) invert(1)` via a Tailwind class (or inline style if needed) to the `app-icon.png` image element. This forces the icon to render white regardless of the original PNG color, making it visible on any dark background. Verify it also looks correct in light mode — if the header background is light in light mode, use a dark-colored icon instead. Conditionally apply the filter based on the active theme.
>
> **Dark mode toggle:** Add a sun/moon icon button to the right side of `Header.tsx` (opposite side from the logo and title). Use a sun icon (☀️ or an SVG icon from lucide-react) for light mode and a moon icon (🌙 or lucide-react) for dark mode, each indicating what mode the app is currently in.
>
> - Store the user's preference in localStorage under the key `theme` with values `"dark"` or `"light"`
> - On app load, read `theme` from localStorage and apply the corresponding Tailwind `dark` class to the root `<html>` element. Fall back to system preference if no value is stored
> - Toggling updates both the `<html>` class and the localStorage value immediately
> - All existing components already use Tailwind `dark:` classes (established in Step 1) — no component changes are needed beyond the header and the theme bootstrap logic
>
> Add E2E tests in `tests/e2e/` covering:
>
> - HomeScreen with empty localStorage renders the welcome state and not the normal sections
> - Clicking "צור קבוצה" from the welcome state navigates to group creation
> - After saving the first group and returning to HomeScreen, the normal HomeScreen renders
> - Toggling dark mode updates the `<html>` class and persists the value to localStorage
> - On reload with `theme: "dark"` in localStorage, the `dark` class is present on `<html>` before first render

**Deliverables:** Empty-group state shows a Hebrew welcome screen with a single CTA. Header icon is white and visible on the header background in both modes. Dark/light toggle button appears in the header, persists preference, and applies immediately. Tests pass with ≥90% coverage.

---

### Migration 006.1 - Bug Fix

**Type:** Bugfix

**Context:**

> The dark/light mode toggle implemented in Migration 006 applies the `dark` class to the `<html>` element correctly, but in practice only the header visually changes. The remaining screens (HomeScreen, wizard steps, ResultScreen, StatisticsScreen) do not respond to the theme change. This is likely because screen and component backgrounds are hardcoded to a fixed color class (e.g. `bg-white`) instead of a theme-aware equivalent (e.g. `bg-white dark:bg-gray-900`).

**Goal:** Make every component and screen in the app respond correctly to the dark/light mode toggle.

**Tell Claude Code:**

> Audit every component and screen file in `src/screens/` and `src/components/`. For each hardcoded color class that does not have a `dark:` counterpart, add the appropriate dark mode variant. At minimum cover:
>
> - Page/screen background colors (e.g. `bg-white` → `bg-white dark:bg-gray-900`)
> - Card and container backgrounds (e.g. `bg-gray-100` → `bg-gray-100 dark:bg-gray-800`)
> - Text colors (e.g. `text-gray-900` → `text-gray-900 dark:text-gray-100`)
> - Input fields, textareas, and selects — background, text, border, and placeholder colors
> - Buttons — both primary and secondary variants
> - Dividers and borders
> - Confirmation dialogs and modals
> - The step indicator component
>
> Do not change any logic, routing, or localStorage behavior. The `dark` class on `<html>` is already set correctly by Migration 006 — this migration is purely a Tailwind class audit across all visual elements.
>
> After applying changes, manually verify (or write a smoke test) that toggling the header button switches the entire viewport — not just the header — between a clearly light and clearly dark appearance.

**Deliverables:** Every screen and component responds to the dark/light toggle. No element remains hardcoded to a fixed color that ignores the active theme. Tests pass with ≥90% coverage.
