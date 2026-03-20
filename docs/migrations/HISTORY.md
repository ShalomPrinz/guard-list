# Migration History

| # | Name | Summary |
|---|------|---------|
| 001 | Rename, App Icon, Time Picker | The app rendered the name "מתזמן שמירות" as the main title with no icon and inconsistent time inputs across browsers. |
| 002 | Back Navigation Fix & Icon Deduplication | The "Continue Round" flow re-enters the wizard in continuation mode but Back from ResultScreen navigated to the wrong screen. |
| 003 | Expanded E2E Test Coverage | `tests/e2e/` contained only one file covering granular group CRUD with no tests for wizard steps or complete flows. |
| 004 | Scroll to Top, Post-Create Editing, Swap Recalculation | Three independent UX and logic issues existed in the wizard and result flow: no scroll-to-top, read-only ResultScreen, and stale times after station swaps. |
| 005 | Global Header with Logo and Home Button | There was no persistent header across screens — no branding and no shortcut back to HomeScreen from inner screens. |
| 006 | Welcome Screen, Header Icon Fix, Dark Mode Toggle | Three issues existed: no welcome state when no group exists, invisible app icon in the header, and no manual dark/light mode toggle. |
| 007 | Stations Page Cleanup, Date/Time Formats, Date Field Relocation | Step1_Stations had an outdated station-count selector, a headcount type toggle to remove, and inconsistent date/time display across the app. |
| 008 | Review Screen Fixes, HomeScreen Interactions, Text Corrections | Several UX issues existed across the review screen and HomeScreen: lost quote/author on back-nav, read-only remnants, inert card areas, and wrong terminology. |
| 009 | CI/CD Pipeline | The app was deployed via Vercel with no CI step — every push triggered deployment regardless of test results. |
| 010 | כיתת כוננות Feature | The app supported only time-based guard duty lists; a lightweight standby-unit flow with no scheduling math was needed. |
| 011 | Show All Warriors in Order Screen & Drag Hold Threshold | "בית" members were invisible in Step3_Order and drag-and-drop activated too easily during normal touch scrolling. |
| 012 | Drag Handle Hit Area, Free Dragging, Empty Station Persistence, Recalculate Times | Three remaining drag issues existed after 011.1: undersized hit area, clipped cross-station drag, and disappearing empty "לא משובצים" section; plus no way to recalculate times in Step4_Review. |
| 013 | Continue Round Order Logic & Unite Lists Feature | The "Continue Round" feature currently skips the stations setup step and uses a fixed participant order. |
| 014 | Citations Management | Persistent citations DB with CRUD and search, author auto-format to initials + family name, random/collection/manual citation modes in Step4_Review, used citations tracked via usedInListIds, citation counts added to StatisticsScreen |
| 015 | Unite Lists for All Guard Lists | Show "איחוד רשימות" on every ResultScreen and let the user choose any schedule from history as the union target, with a shortcut to the direct parent for continued rounds. |
| 016 | Vercel KV Persistence | Persist all durable app data (groups, station configs, schedules, citations, statistics, user preferences) to Vercel KV as a transparent durable backup, syncing on top of localStorage with full offline fallback when KV is unreachable. |
| 017 | Username & Per-User KV Namespacing | Introduce a username-based identity layer that scopes all KV keys per user, persists the chosen username to localStorage indefinitely, and blocks app access until a username is set. |