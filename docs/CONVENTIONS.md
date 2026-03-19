# Conventions

Decisions already made in this codebase. Do not re-decide these. Apply them consistently in every migration and every new file.

---

## Language

- **UI strings:** Hebrew, hardcoded directly in the component. No i18n library, no translation file, no constants object.
- **Code:** English only — variable names, function names, file names, comments, type names, test descriptions.
- **Docs:** English only — all `.md` files are in English.
- **Term for guard position:** always "עמדה" (singular) / "עמדות" (plural). Never "תחנה" / "תחנות". This applies everywhere in the UI.
- **App name:** "רשימת שמירה". Appears in the global Header and `index.html` `<title>`. Nowhere else.

---

## File & Folder Structure

- One screen per file in `src/screens/`. File name matches the screen name exactly (e.g. `StandbyScreen.tsx`).
- Shared UI primitives in `src/components/`. Before creating a new component, check this folder — do not duplicate existing ones.
- All scheduling and calculation logic in `src/logic/` as **pure functions with no React imports**. No exceptions.
- All localStorage access through typed helpers in `src/storage/`. Never call `localStorage.getItem` / `setItem` directly from a component or screen.
- Test files co-located with logic: `src/logic/foo.test.ts` next to `src/logic/foo.ts`.
- E2E tests flat in `tests/e2e/`. No subfolders.

---

## TypeScript

- All persisted data types are defined in `src/storage/types.ts`. This is the single source of truth for data shape.
- Never use `any`. Use `unknown` and narrow if needed.
- Unused variables must be prefixed with `_` (e.g. `_user`) or removed. A declared-but-unused variable will break the Vercel build via `tsc --noEmit`.
- Run `tsc --noEmit` across the full project (including `tests/`) before declaring any migration done.

---

## Styling

- Tailwind CSS only. No inline `style={{}}` except where a Tailwind class genuinely cannot express the value (e.g. a dynamic pixel calculation).
- Every color class must have a `dark:` counterpart. Never add a `bg-`, `text-`, `border-` class without its dark mode variant.
- Minimum tap target size: 44px height for all interactive elements on mobile.
- The app is RTL — ensure layout, text alignment, and flex direction reflect Hebrew reading direction.

---

## Date & Time Display

- All times display as `HH:MM` (24-hour, zero-padded). Always use `formatTime()` from `src/logic/formatting.ts`. Never use `.toLocaleTimeString()` or any locale-dependent method.
- All dates display as `DD/MM/YYYY`. Always use `formatDate()` from `src/logic/formatting.ts`. Never use `.toLocaleDateString()` or any locale-dependent method.
- Native `<input type="date">` is permitted for the date picker interaction, but the displayed value shown to the user must always be rendered via `formatDate()` as a label alongside it.

---

## Drag & Drop

- All drag-and-drop uses `@dnd-kit/core`.
- All sensor configs must use the 1000ms hold threshold with 5px tolerance:
  ```ts
  useSensor(TouchSensor, {
    activationConstraint: { delay: 1000, tolerance: 5 },
  });
  useSensor(PointerSensor, {
    activationConstraint: { delay: 1000, tolerance: 5 },
  });
  ```
- Apply this config to every drag instance in the app. Never use a different sensor config.
- Drag handles always use the shared `DragHandle` component from `src/components/DragHandle.tsx` — never an inline icon element.
- `DragHandle` always carries `select-none touch-none cursor-grab active:cursor-grabbing`. Never override or remove these classes.
- All `DndContext` instances must include `measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}` to prevent stale position measurements after scroll.
- Do NOT use `DragOverlay`. It has a two-render timing bug where `usesDragOverlay` flips from false to true after the overlay measures itself, causing the scroll-delta correction to change mid-drag and producing a visible position jump. Without `DragOverlay`, `useSortable` applies CSS `transform` directly to the item — single render path, no flip, no jump.

---

## Navigation & Wizard State

- Back navigation never loses form state. Every wizard step reads its initial values from wizard session context, not from props or URL params.
- ResultScreen has no read-only mode. The Back button is always visible. Always.
- Re-saving an edited schedule overwrites the existing localStorage entry by `id`. Never creates a duplicate.
- Clicking the global Header (logo + app name) navigates to HomeScreen and clears wizard session state.
- `window.scrollTo({ top: 0, behavior: 'instant' })` is called on every screen and wizard step mount.

---

## Data & Persistence

- Participant **name** is the unique key for statistics. Exact string match — case sensitive.
- Headcount station type has been removed. All stations are time-based. Do not reintroduce `stationType`, `headcountRequired`, or `headcountParticipants` anywhere.
- Statistics are never updated from כיתת כוננות selections or from UniteScreen.
- The unified list produced by "איחוד רשימות" is never saved to localStorage.

---

## Scheduling Logic

- Duration calculation, rounding, and schedule generation live in `src/logic/scheduling.ts`.
- Continue Round logic lives in `src/logic/continueRound.ts`.
- Rounding algorithm is always one of three options (10 min up / 5 min up / nearest minute). Default is 10 min up. The user's selection is stored in wizard session state and must be used consistently throughout that session.
- Midnight crossover: if `endTime < startTime`, the end date is `startDate + 1 day`. This check is in `src/logic/formatting.ts` and must not be duplicated inline in components.

---

## Testing

- `localStorageMock` (in-memory Map) is the shared utility for all tests. Never use real `localStorage` in tests.
- `window.scrollTo` is mocked globally in the test setup file. Never mock it per-file.
- Coverage threshold is ≥90% for `src/logic/` and `src/storage/`. Configured in `vitest.config.ts` under `coverage.thresholds` so the command fails automatically if not met.
- Run `tsc --noEmit` then `vitest run --coverage` at the end of every migration before declaring it done.
