# Conventions

Decisions already made in this codebase. Do not re-decide these. Apply them consistently in every session and every new file.

---

## Code Quality

### ESLint
Always fix the underlying issue first. Only suppress a rule if fixing is genuinely wrong — then add an inline explanation of *why* (e.g. `// eslint-disable-line react-hooks/exhaustive-deps -- intentional: effect must only run on mount, adding deps would cause infinite loop`). Never write a bare `eslint-disable` comment without justification.

---

## Language

- UI strings: Hebrew, hardcoded directly in the component. No i18n library, no translation file, no constants object.
- Code: English only — variable names, function names, file names, type names, comments.
- Docs: English only — all `.md` files are in English.
- Term for guard position: always "עמדה" (singular) / "עמדות" (plural). Never "תחנה" / "תחנות" anywhere in the UI.
- App name: "רשימת שמירה". Appears in the global Header and `index.html` `<title>`. Nowhere else.

---

## File & Folder Structure

- One screen per file in `src/screens/`. File name matches the screen name exactly (e.g. `StandbyScreen.tsx`, `CitationsScreen.tsx`).
- Shared UI primitives in `src/components/`. Before creating a new component, check this folder — do not duplicate existing ones.
- All scheduling and calculation logic in `src/logic/` as pure functions with no React imports. No exceptions.
- All localStorage access through typed helpers in `src/storage/`. Never call `localStorage.getItem` / `setItem` directly from a component or screen.
- Test files for logic: co-located as `src/logic/foo.test.ts` next to `src/logic/foo.ts`.
- Tests in `tests/` organized into three subfolders:
  - `wizard/` — individual wizard step tests (Step1–Step4 in isolation)
  - `flows/` — end-to-end schedule creation flows and navigation flows
  - `features/` — isolated feature/screen tests (group management, drag-drop, citations, etc.)
- Path alias `@` maps to `src/`. Use `@/` for all imports from `src/` in test files. Never use `../../src/` or deeper relative paths.

---

## TypeScript

- All persisted data types defined in `src/types/index.ts`. Single source of truth for data shape.
- Never use `any`. Use `unknown` and narrow if needed.
- Unused variables must be prefixed with `_` or removed. A declared-but-unused variable breaks the Vercel build via `tsc --noEmit`.
- Run `tsc --noEmit` across the full project including `tests/` before declaring any prompt run as done.

---

## Data Model — Key Types

- `Member` has: `id`, `name`, `availability: "base" | "home"`, `role: "commander" | "warrior"` (default `"warrior"`).
- `Citation` has: `id`, `text`, `author` (formatted string), `usedInListIds: string[]`, `createdByUsername?: string` (undefined = legacy, treated as owned by current user).
- `GuestCitationSubmission` has: `id`, `text`, `author`, `submittedAt` (ms timestamp). Stored in KV at `{username}:guestCitations:{id}`. Never in localStorage — fetched on demand via `kvListGuestCitationsLatest()` when the user opens the inbox in `SharingCenterScreen`.
- `citationAuthorLinks` in localStorage maps `authorString → memberId` for statistics attribution.
- `Schedule` has `parentScheduleId?: string` when it is a continued round, `createdFromShortList?: boolean` when generated via short-list wizard, and `customWhatsAppText?: string` when the user has manually edited the WhatsApp preview text in ResultScreen. The `createdFromShortList` flag enables ResultScreen back button to reconstruct the short-list session from a schedule opened from history — allowing users to edit and regenerate short-list schedules seamlessly.
- `ScheduledParticipant` has `note?: string` (optional per-warrior note, never shown in WhatsApp output).
- `ShortListWizardSession` holds ephemeral state for quick schedule generation: `groupId`, `stations` (array of `StationConfig`), `startHour`, `minutesPerWarrior`, `numberOfWarriors` (interpreted as "warriors per station", not total), `name?: string` (default "רשימת שמירה"). Never persisted to KV or localStorage — session-only, cleared when returning home.
- All persisted types live in `src/types/index.ts`. Never define a persisted interface elsewhere.

---

## Toasts & User Notifications

- All non-inline user notifications use `react-toastify`. Import `{ toast }` from `'react-toastify'` and call `toast.error(...)` or `toast.success(...)` directly — no state, no timer, no JSX.
- `<ToastContainer>` is rendered once in `AuthenticatedApp` in `src/App.tsx`, outside `<Routes>`, with `position="top-right"`, `rtl={true}`, `theme="colored"`, `closeOnClick`.
- `ReactToastify.css` is imported once in `src/main.tsx`, after `./index.css`.
- Never build a custom floating toast using `useState` + `setTimeout` + a `fixed` `<div>`. That pattern is removed from `CitationsScreen` and must not return.
- Never use inline `<p>` error state (e.g. `inviteError`, `acceptError`) for async-action results in screens. Use `toast.error()` instead. Inline error elements are only permitted for synchronous form validation.
- When testing a component that calls `toast.error` / `toast.success`, mock `react-toastify` at the top of the test file and assert against the mocked function: `expect(toast.error).toHaveBeenCalledWith('...')`. Do not query the DOM for toast text — `<ToastContainer>` is not rendered in unit tests.

---

## Removed Features — Never Reintroduce

- Headcount station type: `stationType`, `headcountRequired`, `headcountParticipants` are gone. All stations are time-based. Zero occurrences must remain.
- Read-only mode: `isReadOnly`, `viewOnly`, `readOnly` props on ResultScreen. ResultScreen is always editable. Never add these back.
- RecalculateScreen: deleted. End time editing lives directly in Step4_Review as an editable field per station header.
- Participant lock: `locked: boolean` is removed from `WizardParticipant`, `ScheduledParticipant`, and all local interfaces (`ParticipantItem` in Step3_Order, `ReviewItem` in Step4_Review). The lock button (🔒/🔓) and `onToggleLock` prop are gone from Step3_Order. Shuffle logic in Step3_Order treats all participants as unlockable. Never reintroduce `locked` on any participant type.

---

## Styling

- Tailwind CSS only. No inline `style={{}}` except where a Tailwind class cannot express a dynamic value.
- Every color class must have a `dark:` counterpart. Never add `bg-`, `text-`, `border-` without its dark mode variant.
- Minimum tap target: 44px height for all interactive elements on mobile.
- App is RTL — layout, text alignment, and flex direction must reflect Hebrew reading direction.
- Dark mode is toggled by adding/removing the `dark` class on `<html>`. Preference persisted in localStorage under key `theme`. Applied before first render.
- Global header is sticky. Every screen's content area must have top padding that clears the header height — set at the layout level in `Layout.tsx`, not per screen.

---

## Date & Time Display

- All times: `HH:MM` 24-hour zero-padded. Always via `formatTime()` from `src/logic/formatting.ts`. Never `.toLocaleTimeString()` or any locale-dependent method.
- All dates: `DD/MM/YYYY`. Always via `formatDate()` from `src/logic/formatting.ts`. Never `.toLocaleDateString()` or any locale-dependent method.
- Native `<input type="date">` is permitted for picker interaction only. The displayed value shown to the user must always be a label rendered via `formatDate()` alongside it — never via the input's value attribute alone.
- Midnight crossover: if `endTime < startTime`, end date = start date + 1 day. Logic lives in `src/logic/formatting.ts`. Never duplicate this inline in components.
- Schedules that cross midnight advance the participant's `date` field by 1 day for affected participants.

---

## Drag & Drop

- All drag and drop uses `@dnd-kit/core` and `@dnd-kit/sortable`.
- All sensor configs must use exactly:
```ts
  useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 5 } })
  useSensor(PointerSensor, { activationConstraint: { delay: 300, tolerance: 5 } })
```
  Never use a different activation constraint anywhere in the app.
- All drag handles use the shared `DragHandle` component (`src/components/DragHandle.tsx`). Never an ad-hoc icon. `DragHandle` always carries: `select-none touch-none cursor-grab active:cursor-grabbing p-3`.
- `DragOverlay` is always mounted at the root layout level in `Layout.tsx`. Never inside a scrollable container, station card, or any element with `overflow: hidden`.
- All `DndContext` instances use `measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}`.
- `touch-action: none` (`touch-none`) is applied exclusively to `DragHandle`. Never to list containers or the page itself.
- The scrollable page container uses `touch-action: pan-y` to allow native scroll during the hold period.
- Station lists use `SortableContext` with `verticalListSortingStrategy`. Items animate apart during drag to show insertion position.
- The "לא משובצים" section in Step3_Order is never conditionally unmounted. Always rendered with an empty droppable drop zone when item count is zero. Empty state shows a dashed border with placeholder text.

---

## Modals

- Use the shared `Modal` component (`src/components/Modal.tsx`) for all sheet-style modals (backdrop + panel + close button). Do not repeat this shell inline.
- `Modal` props: `onClose: () => void`, `title?: string`, `children: ReactNode`, `maxWidth?: string` (default `max-w-lg`). Render it conditionally: `{isOpen && <Modal onClose={...}>...</Modal>}`.
- `Modal` handles `useBodyScrollLock` internally — callers must not also call it. The `Modal` component calls `useBodyScrollLock(true)` unconditionally because it is only mounted when open.
- `ConfirmDialog` uses `Modal` as its base — it is a thin content wrapper (message + cancel/confirm buttons) that delegates backdrop, panel, scroll lock, and close behavior to `Modal`. Props: `message`, `onConfirm`, `onCancel`, `confirmLabel?` (default `'מחיקה'`). Pass `onCancel` — not `onClose` — to `ConfirmDialog`; it maps internally to `Modal`'s `onClose`. Use `ConfirmDialog` for all yes/no confirmation prompts; use `Modal` directly for all other sheet-style modal surfaces. Never introduce a new modal pattern or component without explicit approval from the user — ask before doing so.
- `Modal`'s inner panel carries `role="dialog"`. Tests that query a modal surface must use `findByRole('dialog')` — the role is on the panel `<div>`, not the backdrop.
- `UsernameGate.tsx` uses `fixed inset-0` for full-screen loading — it is NOT a modal and must never receive modal treatment.
- All modal surfaces use `fixed inset-0 z-50` as the backdrop. `Modal` uses `flex items-start justify-center pt-4` — never `items-end`.

---

## Navigation & Wizard State

- Back navigation never loses form state. Every wizard step reads its initial values from wizard session context, not from props or URL params.
- Every user-entered field in every wizard step must be part of wizard session context. Nothing the user typed disappears on Back navigation.
- ResultScreen has no read-only mode. The Back button is always visible. It detects whether the schedule was created via regular wizard or short-list wizard: if `schedule.createdFromShortList` is true (or active short-list session exists), it reconstructs the short-list session and navigates to `/short-list/step2`; otherwise, it reconstructs regular wizard context and navigates to `/schedule/new/step4`. The session is not cleared on back button — Step2 or Step4 will handle cleanup when user navigates home.
- Re-saving an edited schedule overwrites the existing localStorage entry by `id`. Never creates a duplicate.
- Clicking the global Header (logo + app name) navigates to HomeScreen and clears all wizard session state (both regular `WizardContext` and `ShortListWizardContext`).
- `window.scrollTo({ top: 0, behavior: 'instant' })` is called on mount of every screen and wizard step.
- **Wizard step guards** (`Step2_Time`, `Step3_Order`, `Step4_Review`): if `!session`, call `navigate('/fallback')` inside a `useEffect` and return `null` synchronously. Never call `navigate()` directly in the render body — it does not flush in the test environment and React Router warns against it.
- **User input always overrides pre-filled defaults.** Any field pre-filled programmatically (e.g. start time in continue round, end date from midnight crossover detection) must have a corresponding `userOverrodeX` boolean flag in wizard session state. When the user manually edits the field, set the flag to true. When generating the schedule, always prefer the user's value if the flag is true. Flags reset only when the wizard session is cleared.
- **Context-agnostic wizard steps:** `Step1_Stations` and `ResultScreen` are designed to work with multiple wizard contexts (e.g., `WizardContext` for regular schedules and `ShortListWizardContext` for quick short-list generation). These steps detect the active mode from the URL (`useLocation().pathname.startsWith('/short-list')`) and use the appropriate context. Never hardcode assumptions about which context is active.
- **Ephemeral session-only flows:** Short-list wizard sessions (`ShortListWizardContext`) and standby selections are intentionally ephemeral — they are never written to KV or localStorage. They persist only for the duration of the current browser session and are cleared when navigating home or switching to a different flow. Session-only flows provide a lightweight alternative to full wizard flows for quick operations.

---

## Testing

- `localStorageMock` (in-memory Map implementing Storage interface) shared utility for all tests. Never use real `localStorage` in tests.
- `window.scrollTo` mocked globally in test setup file. Never mock it per-file.
- `IntersectionObserver` mocked globally in test setup file (`src/test-setup.ts`): returns a mock observer with `observe`, `unobserve`, and `disconnect` methods. This mock is required for any component using infinite scroll patterns (e.g., CitationsScreen). Never mock it per-file.
- Coverage threshold ≥90% for `src/logic/` and `src/storage/`. Configured in `vitest.config.ts` under `coverage.thresholds` — command fails automatically if not met.
- CI workflow in `.github/workflows/ci.yml` runs: checkout → setup Node → `npm ci` → `tsc --noEmit` → `vitest run --coverage`. Vercel deploys only after all steps pass via Required Checks in Vercel dashboard.
- After every prompt run: run `tsc --noEmit` then `vitest run --coverage` before declaring done.
