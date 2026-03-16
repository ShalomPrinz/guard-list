## Migration 001 — Rename, App Icon, Time Picker

**Type:** UI / Polish  
**Depends on:** Step 3 (Hebrew UI) complete

**Context:**
> The app currently renders the name "מתזמן שמירות" as the main title and browser tab title. There is no app icon set. Time inputs across Step2_Time and any other time fields use the browser default `<input type="time">` which is inconsistent across desktop browsers and not optimized for mobile.

**Goal:** Rename the app, add an icon, and replace all time inputs with a consistent compact component.

**Tell Claude Code:**
> **Rename:** Replace every occurrence of "מתזמן שמירות" with "רשימת שמירה" across all components and the HTML `<title>` tag in `index.html`.
>
> **App icon:** Set `assets/app-icon.png` as the browser favicon in `index.html` using a `<link rel="icon">` tag. Also display it as a small inline icon next to the app title in the HomeScreen header.
>
> **Time picker:** Replace all `<input type="time">` elements in the app with a single reusable `TimePicker` component (`src/components/TimePicker.tsx`). The component must:
> - On mobile: render a native `<input type="time">` — this triggers the built-in clock UI on Android and iOS, which is the desired behavior
> - On desktop: render a clean custom time input showing two separate numeric spinners (HH and MM) side by side with a colon separator, styled with Tailwind, supporting keyboard input and scroll/click increment
> - Detect mobile vs desktop via a `window.matchMedia('(pointer: coarse)')` check
> - Accept `value: string` (HH:MM format) and `onChange: (value: string) => void` as props
>
> Do not change any scheduling logic or localStorage data. Run `vitest run --coverage` when done and confirm coverage is still at or above 90% for `src/logic/` and `src/storage/`.

**Deliverables:** App title and tab show "רשימת שמירה". Icon appears in browser tab and app header. All time inputs use the new `TimePicker` component. Tests pass with ≥90% coverage.