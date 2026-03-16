## Migration 005 — Global Header with Logo and Home Button

**Type:** UI / Polish  
**Depends on:** Migration 004 complete

**Context:**
> There is currently no persistent header across screens. The app icon and name appear only on HomeScreen. Users on inner screens (wizard steps, ResultScreen, StatisticsScreen) have no visual branding and no shortcut back to HomeScreen other than the Back button chain.

**Goal:** Add a consistent global header showing the app icon and name on every screen, which acts as a home button.

**Tell Claude Code:**
> Create a `Header` component (`src/components/Header.tsx`). It must:
> - Display `assets/app-icon.png` (small, e.g. 32px) and the app name "רשימת שמירה" side by side
> - Be fully clickable as a single home button — clicking anywhere on it navigates to HomeScreen via `useNavigate`
> - Be visually distinct from page content (e.g. subtle bottom border or background fill) so it reads as a chrome element, not page content
> - Be fixed or sticky at the top so it remains visible when the user scrolls
> - Support dark mode via Tailwind `dark:` classes
>
> Mount `Header` in the root layout so it renders on every screen automatically — do not add it manually to each screen component. If no root layout component exists yet, create one (`src/components/Layout.tsx`) that wraps the router outlet and renders `Header` above it.
>
> Remove the app icon and name from HomeScreen's page-level content since they are now in the global header. Adjust HomeScreen's top padding so content does not sit flush against the header.
>
> Verify that the header's home button does not interfere with wizard Back navigation — clicking the logo is a deliberate jump to HomeScreen, not a Back step. If the user is mid-wizard and clicks the logo, they land on HomeScreen and the wizard state is cleared.
>
> Add E2E tests in `tests/e2e/` covering:
> - Header renders on HomeScreen, each wizard step, ResultScreen, and StatisticsScreen
> - Clicking the header from Step3_Order navigates to HomeScreen
> - Wizard state is cleared after navigating home via the header (a new wizard starts fresh)

**Deliverables:** A sticky global header with logo and app name appears on every screen and navigates to HomeScreen on click. No duplicate branding on HomeScreen. Tests pass with ≥90% coverage.