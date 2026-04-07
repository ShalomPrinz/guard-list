# Conventions

Decisions already made in this codebase. Do not re-decide these. Apply them consistently in every session and every new file.

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
- `GuestCitationSubmission` has: `id`, `text`, `author`, `submittedAt` (ms timestamp). Stored in KV at `{username}:guestCitations:{id}`. Never in localStorage — fetched on demand via `kvListGuestCitations()`.
- `citationAuthorLinks` in localStorage maps `authorString → memberId` for statistics attribution.
- `Schedule` has `parentScheduleId?: string` when it is a continued round, `createdFromShortList?: boolean` when generated via short-list wizard, and `customWhatsAppText?: string` when the user has manually edited the WhatsApp preview text in ResultScreen. The `createdFromShortList` flag enables ResultScreen back button to reconstruct the short-list session from a schedule opened from history — allowing users to edit and regenerate short-list schedules seamlessly.
- `ScheduledParticipant` has `note?: string` (optional per-warrior note, never shown in WhatsApp output).
- `ShortListWizardSession` holds ephemeral state for quick schedule generation: `groupId`, `stations` (array of `StationConfig`), `startHour`, `minutesPerWarrior`, `numberOfWarriors` (interpreted as "warriors per station", not total), `name?: string` (default "רשימת שמירה"). Never persisted to KV or localStorage — session-only, cleared when returning home.
- All persisted types live in `src/types/index.ts`. Never define a persisted interface elsewhere.

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

## Scheduling Logic

- Duration calculation, rounding, and schedule generation: `src/logic/scheduling.ts`.
- Continue round ordering and unite logic: `src/logic/continueRound.ts`.
- Author formatting (initials + family name): `src/logic/formatting.ts`.
- Short-list schedule generation: `src/logic/shortListGeneration.ts`. Function `generateShortListSchedule(groupId, stations, startHour, minutesPerWarrior, numberOfWarriors, name?, storage?)` interprets `numberOfWarriors` as "warriors per station" (not total). Total warriors = `numberOfWarriors * stations.length`. Shuffles base-available members and distributes round-robin across stations. Optional `name` parameter defaults to "רשימת שמירה".
- Rounding options: round up to 10 min (default, recommended), round up to 5 min, round to nearest minute. User's selection stored in wizard session state and used consistently throughout that session.
- Schedule generation is deterministic. Same inputs always produce identical output. No randomization in generation — only in the shuffle action explicitly triggered by the user.
- Continue round ordering algorithm is deterministic. No randomization as tiebreaker — use alphabetical by name instead.
- Time sorting always uses full datetime (date + startTime combined). Never sort by HH:MM string alone — this breaks midnight-crossing schedules.
- Station end time is editable directly in Step4_Review as an editable field on each station header. Changing it recalculates all participant times for that station immediately using `recalculateStation` from `src/logic/scheduling.ts`.

---

## Continue Round Rules

- Always enters wizard at Step1_Stations with pre-filled values from previous round.
- Mirrors exact participant roster and station assignments from the original round.
- Start time per station = actual end time of previous round (last participant start + duration). User may override — see user input convention above.
- New stations (not in previous round) must prompt user to select a start time: custom input or inherit from an existing station's end time.
- Station rotation: best-effort assignment to a different station than the previous round. Never guaranteed if count makes it impossible.
- Continued round has its own editable name.
- Each continued round stores `parentScheduleId` pointing to the parent schedule.

---

## Screens & Features

- **HomeScreen:** welcome state when no groups exist. Entire group card is clickable (except "מחיקה" which uses `e.stopPropagation()`). Same for history cards. Uses `CreateGroupModal` (from `src/components/CreateGroupModal.tsx`) in both welcome state and normal state. Modal requests only a group name, creates an empty `Group` with `members: []`, and navigates to `/group/:groupId/edit` for bulk member addition. No CSV import. Schedules ("לוחות שמירה קודמים") display in reverse chronological order (newest first) with pagination: shows 5 initially, reveals "טען רשימות ישנות" button if more than 5 exist. Clicking the button loads 10 more, then activates infinite scroll via `IntersectionObserver` on a sentinel `<div>` (same pattern as CitationsScreen: `visibleCount` state tracks visible items, increments by 10 when sentinel intersects, capped at total count). Primary action buttons include: "+ צור לוח שמירה", "⚡ רשימה קצרה" (quick short-list generator), "🛡️ כיתת כוננות" (standby), and utility buttons for statistics and citations.
- **CreateGroupModal:** Modal component for group creation. Collects only a group name (required, non-empty). On submit, creates an empty group via `upsertGroup()` and calls `onCreated(group)`. HomeScreen handles the navigation to GroupEditScreen. CSV import removed — all member addition now happens via `GroupEditScreen`'s single-member and bulk-add inputs.
- **GroupEditScreen:** divided into "מפקדים" section (first) and "לוחמים" section (after). "בחר מפקדים" button navigates to `CommandersSelectScreen` (`/group/:groupId/commanders`) — no modal. Availability toggle uses shared `AvailabilityToggle` component. Below the single-member "הוסף חבר" input, there is a "הוסף מספר חברים בבת אחת" toggle button (min-height 44px) that reveals a textarea for bulk-adding multiple comma or newline-separated names. The `handleBulkAdd` function calls `parseNames()` from `src/logic/parseNames.ts`, filters out duplicates and existing members (case-insensitive), creates new `Member` objects with `availability: 'base'` and `role: 'warrior'`, and appends them to the group. Autosave via the existing `useEffect` on `group` state change handles persistence.
- **CommandersSelectScreen:** dedicated full screen for toggling member roles. Route `/group/:groupId/commanders`. Loads group via `getGroupById`, calls `upsertGroup` immediately on every checkbox toggle (autosave pattern). Sections: commanders first, warriors after. Back button returns to `/group/:groupId/edit`.
- **Step3_Order:** availability toggle replaces "דלג". Base→Home moves warrior to "לא משובצים". Home→Base in "לא משובצים" keeps them there. Uses shared `AvailabilityToggle`.
- **StandbyScreen (כיתת כוננות):** divided into commander section (single-select, role="commander") and warriors section (multi-select). Availability toggle uses `AvailabilityToggle`. Session-only — no persistence. WhatsApp output includes "מפקד: Name" line when a commander is selected.
- **CitationsScreen:** CRUD for citations DB. Author auto-formatted to initials + family name on blur ("יוסי ישראלי" → "י. ישראלי"). Live preview shown during typing. Single word (family name only) left unformatted. **When `search` is empty**, renders citations in sections grouped by creator: current user's section first (header "הציטוטים שלי"), then one section per other group member (header = username). Each section starts with `SECTION_INITIAL = 3` visible items; "טען עוד ציטוטים" button loads `SECTION_LOAD_MORE = 10` more; after clicking, an `IntersectionObserver` on a per-section sentinel `<div>` drives further increments. Per-section state: `sectionVisible: Record<string, number>` (keyed by username or `ME_KEY`) and `sectionLoadMoreClicked: Record<string, boolean>`. `ME_KEY` is computed as `currentUsername ?? '__me__'` — never the literal string `'__me__'` — to avoid collision if a user's actual username is `__me__`. Sentinel refs stored in `sentinelRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())`. Sections with 0 items are not rendered. **When `search` is non-empty**, falls back to a flat filtered list with `PAGE_SIZE = 20` items and a single sentinel `sentinelRef`. `visibleCount` resets to `PAGE_SIZE` whenever `search` changes. In non-selection mode, shows a single `🤝 מרכז השיתוף` button (border style, between search bar and citations list) that navigates to `/sharing-center`. Edit/delete per citation is gated by `canEditDelete = !citation.createdByUsername || citation.createdByUsername === currentUsername` — non-owners see the citation but cannot edit it. New citations are saved with `createdByUsername: getUsername() ?? undefined`. No guest link or inbox UI here — all sharing features live in SharingCenterScreen. On mount, if the user is in a sharing group, `syncGroupCitations()` calls `kvCrossReadGroupMember` for each other group member and merges their citations + delete log into localStorage via `upsertCitation`/`deleteCitationSilent`. A `loading` state (initialized `false`) shows a subtle `"מסנכרן ציטוטים..."` indicator until the sync completes (or is skipped when not in a group). `setCitations(getCitations())` is always called in the `finally` block to refresh the rendered list. The "אין ציטוטים עדיין." empty state is only shown when `citations.length === 0 && !loading` — never while a group sync is in progress, since group citations may be about to arrive.
- **SharingCenterScreen:** Route `/sharing-center`. Accessible only from CitationsScreen (non-selection mode). On mount, `useEffect` calls only `loadSharingCenterUpdates()`. Guest citations are fetched on demand only when the user opens the inbox. Sections (top to bottom): notification banner, guest link section ("שיתוף קישור למבקרים" card with "📋 העתק קישור" + "📤 שתף בוואטסאפ"), guest inbox button ("ציטוטים ממבקרים" with badge count, opens modal), then group management (pending invitation, current members + invite, or "not in a group"). "עזוב קבוצה" triggers `leaveGroup()` via `ConfirmDialog` then navigates to `/citations`. All sharing and guest citation management lives here — nothing in App.tsx or CitationsScreen.
- **GuestCitationsScreen:** Public, no auth required. Route `/guest/:username`. Self-contained — no `Layout`, no `Header`. RTL Hebrew form: text textarea + author input + submit button. Calls `fetch('/api/kv', { action: 'guestSubmit', targetUsername, text, author })` directly (no cloudStorage helper — guest has no scoped username). Shows `"הציטוט נשלח בהצלחה!"` on success (form resets), `"יותר מדי שליחות — נסה שוב בעוד דקה"` on HTTP 429, `"שגיאה בשליחה — נסה שוב"` on other failures, `"נדרש טקסט וכותב"` on blank fields. `window.scrollTo` on mount.
- **Step4_Review:** default round name is "רשימת שמירה". Quote and author are part of wizard session state — always restored on Back navigation. Per-warrior optional note field (collapsed by default, never in WhatsApp output). Editable end time per station header triggers immediate recalculation. `autoFormatAuthor` toggle (default on) auto-formats author name on blur in manual mode; `saveToCollection` defaults to `true`. Both are wizard session fields and survive Back navigation.
- **ResultScreen:** "איחוד רשימות" button always visible. For continued rounds: offers shortcut to direct parent or list picker. For others: goes directly to list picker sorted newest-first with search. Back button behavior depends on active wizard: if `ShortListWizardContext` is active, clears session and navigates to `/short-list/step2`; otherwise returns to Step4_Review for regular wizard editing. When `schedule.customWhatsAppText` exists, clicking "← חזרה לעריכה" shows a guard modal ("עריכת רשימה שנערכה ידנית") instead of navigating immediately — user must choose to keep the edit or delete it and go back. The WhatsApp preview box has a pencil button (✏️, `aria-label="ערוך טקסט"`) in the top-left corner; clicking it opens an inline `<textarea>` edit mode with "אשר" (saves `customWhatsAppText` via `updateScheduleCustomText`) and "בטל" (discards) buttons below. When `customWhatsAppText` is set, a "↩ חזור לטקסט המקורי" button appears to clear it. `schedule` is held in `useState` (not read inline) so `refresh()` can re-fetch after storage mutations. `updateScheduleCustomText` is in `src/storage/schedules.ts`.
- **ShortListStep2:** Collects three parameters for quick schedule generation: `startHour` (0–23), `minutesPerWarrior` (duration, min 1, default 60), `numberOfWarriors` (warriors **per station**, min 1, max = available base members ÷ number of stations). UI displays total warrior count as "סך הכל: X חיילים" (numberOfWarriors × stationCount). On creation, calls `generateShortListSchedule()` with selected stations from `ShortListWizardContext`, calculates total as `numberOfWarriors * stations.length`, validates against available base members, shuffles and distributes warriors round-robin across stations, and navigates to ResultScreen. Back button navigates home and clears session. Route: `/short-list/step2`. Never guarded — session is initialized by Step1_Stations.
- **UniteScreen:** merges two schedules per station sorted by full datetime. Uses earlier schedule's name and citation. Never saved to localStorage. Has the same pencil-edit UX as ResultScreen (pencil button, `<textarea>` edit mode, "אשר"/"בטל", "↩ חזור לטקסט המקורי") but session-only — custom text lives in local `customText` state, never persisted to `Schedule` or KV.
- **StatisticsScreen:** two tabs — "זמני שמירה" (guard time table) and "ציטוטים" (citation counts). Citation tab headers: "?באוסף" and "?שומש". Citation attribution uses `citationAuthorLinks` map, not name string matching.
- **FallbackScreen:** route `/fallback`. Self-contained — no `Layout` or `Header` wrapper. Uses `fixed inset-0` full-screen, tap-anywhere-to-home. Shown when a wizard step guard fires (no active session). Never use as a general 404 — the `*` catch-all route still redirects to `/`.
- **App routing structure:** `BrowserRouter` wraps everything. Top-level `Routes` has `/guest/:username → GuestCitationsScreen` (public, no auth) and `* → AuthenticatedApp`. `AuthenticatedApp` is a component inside `App.tsx` that owns the `UsernameGate` check, `syncFromCloud`, `WizardProvider`, and all authenticated routes. Never move `BrowserRouter` back inside the authenticated branch — the guest route must be reachable without a username.
- **ErrorScreen:** self-contained full-screen (`fixed inset-0`), no `Layout` or `Header`. Shows "שגיאה!" in `text-red-500 dark:text-red-400` and a Hebrew apology message. Click-anywhere navigates via `window.location.href = '/'` — never `useNavigate`, because it may render outside Router context. Rendered exclusively by `ErrorBoundary`.
- **ErrorBoundary:** class component at `src/components/ErrorBoundary.tsx`. Wraps the entire app in `src/main.tsx`, outside `App` (which contains `BrowserRouter`) so it catches router-level errors too. Uses `getDerivedStateFromError` + `componentDidCatch` (logs to console and fires `kvSet(`errors:${Date.now()}`, AppErrorReport)` as a fire-and-forget KV write). Currently there are no per-screen error boundaries — one global boundary only.

---

## Citations

- First time a citation is used in a confirmed schedule, prompt user to link its author to a group member (one-time modal after "Create Schedule"). "דלג" stores a skip marker — never prompt again for that author.
- `citationAuthorLinks` in localStorage: `{ [authorString]: memberId }`. Used for all statistics attribution.
- Random citation selection skips citations where `usedInListIds` contains any existing schedule id. If all used, picks least recently used.
- Citation used in a confirmed schedule: add schedule id to `usedInListIds` and save.

### Citation Sharing — Group Model

- Citation sharing uses a multi-member group model. Types: `SharingGroup { groupId, members, joinedAt }`, `GroupInvitation { groupId, fromUsername, sentAt }`. Both defined in `src/types/index.ts`.
- All sharing localStorage state is managed exclusively through `src/storage/citationShare.ts`. Never read/write `share:*` keys directly from components or other storage modules.
- localStorage keys: `share:group` (`SharingGroup | null`), `share:groupInvitation` (`GroupInvitation | null`), `share:outgoingInvitation`, `share:deleteLog`.
- `{username}:share:groupId` is managed server-side by the KV group actions — never written directly by the client via `kvSet`.
- Delete log (`share:deleteLog`) records citation ids deleted while in a group. `deleteCitation` in `citations.ts` appends to this log automatically when `getLocalGroup() !== null`. `deleteCitationSilent` bypasses the log — use it only when applying a remote delete log to avoid re-logging.
- Group lifecycle functions in `citationShare.ts`: `sendGroupInvitation`, `acceptGroupInvitation`, `declineGroupInvitation`, `leaveGroup`. These use dynamic imports for cloudStorage group helpers (`kvGroupCreate`, `kvGroupJoin`, etc.) to avoid import cycle issues.
- `acceptGroupInvitation` returns `Promise<'ok' | 'cancelled' | 'error'>`. Before calling `kvGroupJoin`, it checks that the KV invitation still exists (`kvGet('share:groupInvitation')`). If the key is gone, it clears the local invitation and returns `'cancelled'` — the caller must handle this case and show a Hebrew error message.
- `acceptGroupInvitation` and functions that call `upsertCitation`/`deleteCitationSilent` use dynamic imports (`await import('./citations')`) for the cycle-closing direction. Static imports of `getCitations` and `deleteCitationSilent` at the top level are allowed because `citations.ts` → `citationShare.ts` is the base direction.
- `leaveGroup` removes all citations where `createdByUsername !== undefined && createdByUsername !== currentUser`, then clears local group state. It does NOT call `clearLocalGroup` for the KV side — `kvGroupLeave` handles that server-side.
- `syncFromCloud` has one share sync block: iterates `group.members` (excluding self) and calls `kvCrossReadGroupMember` for each. Returns null silently — member may have left; Sharing Center handles refresh.
- `IncomingShareRequestModal` is deleted. Incoming invitations are handled exclusively inside `SharingCenterScreen` — never in `App.tsx` or as a floating overlay.
- `loadSharingCenterUpdates()` in `citationShare.ts` checks accept/rejection notifications, fetches `share:groupInvitation` from KV (delivery + cancellation detection), refreshes the member list, and auto-leaves lone-member groups. It is called on mount of `SharingCenterScreen` only — never on app startup or via visibility/focus events. Returns `{ acceptedBy?, rejectedBy?, freshMembers?, invitationCancelledBy?: string, autoLeftLoneGroup?: true }`. When `invitationCancelledBy` is set, the local invitation has already been cleared and the value is the inviter's username. When `autoLeftLoneGroup` is true, `leaveGroup()` has already been called and the return is early — callers must call `refreshState()` and show the auto-left message.

---

## KV / Cloud Storage

- Fetch from KV only what is needed immediately. Do not preload data that is only required after a user action. Calling `kvListGuestCitations()` on mount is the canonical example of what NOT to do — it was moved to on-demand (called only when the user opens the inbox).
- Never use `kv.scan` — use `kv.keys(pattern)` for listing keys by prefix. SCAN charges one Redis command per cursor page; KEYS charges one command for the entire result set.
- All KV access goes through `src/storage/cloudStorage.ts`. Never import Upstash Redis directly from components or logic.
- Raw KV actions (`rawGet`/`rawSet` in `api/kv.ts`) are restricted to keys matching `device:[a-zA-Z0-9_\-.]{1,128}`. Device keys in `UsernameGate.tsx` are constructed as `` `device:${username}` `` — never `` `${username}:device` ``. This ensures raw-action keys structurally cannot overlap with user-namespaced keys (`{username}:*`).
- Cross-user writes use the `crossSet` action in `api/kv.ts`. Allowed sub-keys: `share:groupInvitation`, `share:acceptNotification`, `share:rejectionNotification`. Any other key returns 403. Use `kvCrossSet` from `cloudStorage.ts` — never call `crossSet` directly.
- Cross-user reads use the `crossRead` action in `api/kv.ts`. Server enforces group-based consent: checks that both `{username}:share:groupId` and `{partnerUsername}:share:groupId` are equal and non-null. Use `kvCrossReadGroupMember` from `cloudStorage.ts` (renamed from old `kvCrossReadPartner`).
- Group actions (`groupCreate`, `groupJoin`, `groupLeave`, `groupGetMembers`) in `api/kv.ts` manage `group:{groupId}:members` as a raw KV key (not user-namespaced). They also read/write `{username}:share:groupId`. Client helpers: `kvGroupCreate`, `kvGroupJoin`, `kvGroupLeave`, `kvGroupGetMembers` in `cloudStorage.ts`.
- `invitationCancel` action in `api/kv.ts` deletes `{targetUsername}:share:groupInvitation` after verifying the caller is the original sender (`inv.fromUsername === username`). Idempotent — returns `{ ok: true }` if the key is already gone. Client helper: `kvInvitationCancel(targetUsername)` in `cloudStorage.ts`. The cancel button in `SharingCenterScreen` calls this before `clearOutgoingInvitation()` — always await it so local state clears only after the server key is deleted.
- `kvCrossSet` returns `'ok' | 'already_pending' | 'error'`. The `'already_pending'` case (HTTP 409) means the target already has an open inbound request — callers must handle it. On any other non-ok HTTP status, `kvCrossSet` logs `console.error('[kv] crossSet failed: HTTP', status, body)` before returning `'error'`. This is the only place in `cloudStorage.ts` that reads the raw HTTP status rather than delegating to `callKv`.
- The internal `callKvRaw` helper in `cloudStorage.ts` exposes the raw `Response` object (not parsed JSON). It exists solely to let `kvCrossSet` inspect the 409 status and read the body on error. Do not use it for any other purpose.
- The origin check in `api/kv.ts` uses a `Set<string>` populated from `ALLOWED_ORIGIN`, `VERCEL_URL`, and `VERCEL_PROJECT_PRODUCTION_URL`. If the set is empty (local dev), no restriction applies. Never revert to a single-origin check — `VERCEL_URL` is deployment-scoped and does not match the stable production alias URL.
- The `guestSubmit` action in `api/kv.ts` intentionally bypasses the origin check (guests arrive from arbitrary share link URLs). It is handled before the origin check block, applies a dedicated rate limiter (`guestRatelimit`, prefix `"ratelimit:guest"`, 20 req/min/IP), and requires no `username` field. Any future action that must be accessible from external URLs must follow this same pattern: handle it early, apply its own rate limiter, and return before reaching the origin check.
- `kvListGuestCitations()` and `kvDeleteGuestCitation(id)` in `cloudStorage.ts` manage pending guest submissions. Guest citations are never auto-synced via `syncFromCloud` — they are fetched on demand only. `kvListGuestCitations` uses exactly 2 network requests: one `list` to scan keys + one `mget` to batch-fetch all values. Do not revert to N+1 individual `kvGet` calls.
- `kvMGet<T>(keys: string[])` in `cloudStorage.ts` batch-fetches multiple unscoped keys in a single request using the `mget` action in `api/kv.ts`. The server validates that every key starts with `{username}:` and that the array is 1–100 elements. Returns `(T | null)[]` in the same order as the input keys. Returns all-null on error (never throws). Used in `syncFromCloud.ts` for all 5 data namespaces (groups, stationConfigs, schedules, citations, statistics) and in `kvListGuestCitations`. Never revert these to per-item `kvGet` loops.
- `syncFromCloud()` skips its entire body if `localStorage.getItem('synced')` is truthy. It sets `localStorage.setItem('synced', '1')` only after all namespace sync blocks complete (outside the per-namespace `try/catch` blocks). The `synced` key is accessed directly via `localStorage` in `syncFromCloud.ts` — it is a control flag, not a data type, so it is not routed through a typed storage helper. If localStorage is ever wiped, all keys including `synced` are gone together, which correctly forces a re-sync on the next app start.
- `kvSet` and `kvDel` in `cloudStorage.ts` silently bail when `localStorage.getItem('noBackup')` is truthy. Any KV write that must happen during the backup-removal flow (e.g., `kvSetBackupSuspension` in `handleRemoveBackup`) must be called fire-and-forget **before** `localStorage.setItem('noBackup', '1')` — the synchronous guard is checked at function entry before the first `await`, so ordering the calls correctly makes it pass. If called after, the write is silently dropped.
- Tamper-sensitive suspension/rate-limit timestamps must live in KV, not localStorage. `backupSuspendedUntil` (`{username}:backupSuspendedUntil`) is the canonical example — storing it in localStorage would let the user delete it via DevTools to bypass the suspension. Always re-fetch from KV inside the guarded action (`handleReenableBackup`) rather than trusting React state, so React DevTools cannot bypass the guard either.

---

## Testing

- `localStorageMock` (in-memory Map implementing Storage interface) shared utility for all tests. Never use real `localStorage` in tests.
- `window.scrollTo` mocked globally in test setup file. Never mock it per-file.
- `IntersectionObserver` mocked globally in test setup file (`src/test-setup.ts`): returns a mock observer with `observe`, `unobserve`, and `disconnect` methods. This mock is required for any component using infinite scroll patterns (e.g., CitationsScreen). Never mock it per-file.
- Coverage threshold ≥90% for `src/logic/` and `src/storage/`. Configured in `vitest.config.ts` under `coverage.thresholds` — command fails automatically if not met.
- CI workflow in `.github/workflows/ci.yml` runs: checkout → setup Node → `npm ci` → `tsc --noEmit` → `vitest run --coverage`. Vercel deploys only after all steps pass via Required Checks in Vercel dashboard.
- After every prompt run: run `tsc --noEmit` then `vitest run --coverage` before declaring done.
