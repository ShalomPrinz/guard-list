# App Logic & Feature Specifications

Describes what the app does — algorithms, screen behavior, feature rules, and system architecture. For how to write the code, see CONVENTIONS.md.

---

## Scheduling Algorithms

### Duration Calculation

```
rawDuration = (endTime - startTime) / participantsInStation
```

If `endTime < startTime`, add 24 hours (midnight crossover).

Apply rounding based on user-selected algorithm:

| Algorithm | Formula |
|-----------|---------|
| Round up to 10 min *(default, recommended)* | `ceil(rawDuration / 10) * 10` |
| Round up to 5 min | `ceil(rawDuration / 5) * 5` |
| Round to nearest minute | `round(rawDuration)` |

**Example:** 7 hours / 5 participants = 84 min → rounded up to 90 min (next 10-min mark).

The rounded duration is applied uniformly per participant in that station. Rounding may cause the actual end time to exceed the stated end time — this is expected and acceptable.

### Schedule Generation

For each time-based station:

```
participant[0].startTime = roundStartTime
participant[i].startTime = participant[i-1].startTime + roundedDuration
participant[i].endTime   = participant[i].startTime + roundedDuration
```

Date increments when `startTime` crosses 00:00. Schedule generation is **deterministic**: given the same inputs, always produces the same output.

### Uneven Distribution Between Stations

When `totalParticipants % numberOfStations !== 0`:

**Option A — Equal shift duration:**
- All participants across all stations guard the same duration
- Station with fewer participants finishes earlier
- Duration based on the station with more participants (or user-set)

**Option B — Equal end time:**
- All stations finish at the same time
- Station with fewer participants has a longer per-participant duration
- Each station's duration calculated independently: `duration_i = totalTime / participants_i`
- Rounding applied per station separately

### File Map

- Duration calculation, rounding, schedule generation: `src/logic/scheduling.ts`
- Continue round ordering and unite logic: `src/logic/continueRound.ts`
- Author formatting (initials + family name): `src/logic/formatting.ts`
- Short-list schedule generation: `src/logic/shortListGeneration.ts`
- Name parsing (bulk add): `src/logic/parseNames.ts`

---

## Continue Round

### Time Formula

```
newRound.startTime[station_i] = previousRound.actualEndTime[station_i]
```

Where `actualEndTime` = startTime of last participant in station + their duration.

If user selects "Use planned end time":

```
newRound.startTime[station_i] = previousRound.plannedEndTime
```

### Rules

- Always enters wizard at Step1_Stations with pre-filled values from the previous round.
- Mirrors exact participant roster and station assignments from the original round.
- Start time per station = actual end time of previous round. User may override — see `userOverrodeX` flag convention in CONVENTIONS.md.
- New stations (not in previous round) must prompt user to select a start time: custom input or inherit from an existing station's end time.
- Station rotation: best-effort assignment to a different station than the previous round. Never guaranteed if count makes it impossible.
- Ordering algorithm is fully deterministic. Alphabetical by name as tiebreaker — never `Math.random()`.
- Continued round has its own editable name.
- Each continued round stores `parentScheduleId` pointing to the parent schedule.

---

## Short-List Wizard

Quick schedule generation flow without the full wizard. Route: `/short-list/step2`.

- Session type: `ShortListWizardSession` — ephemeral, never written to KV or localStorage. Cleared when navigating home.
- Fields: `groupId`, `stations` (array of `StationConfig`), `startHour`, `minutesPerWarrior`, `numberOfWarriors` (warriors **per station**, not total), `name?` (default "רשימת שמירה").
- `generateShortListSchedule(groupId, stations, startHour, minutesPerWarrior, numberOfWarriors, name?, storage?)` in `src/logic/shortListGeneration.ts`:
  - Total warriors = `numberOfWarriors * stations.length`
  - Shuffles base-available members and distributes round-robin across stations
- Step1_Stations and ResultScreen detect the active context from `useLocation().pathname.startsWith('/short-list')`.
- Back button in ShortListStep2 navigates home and clears session.
- Never guarded — session is initialized by Step1_Stations.

---

## WhatsApp Output

```
🔒 [Round Name]
[Citation line — optional, only when a quote is set]

📍 [Station 1 Name]
14:00 Participant A
15:30 Participant B

📍 [Station 2 Name]
14:00 Participant C
```

- Standby output adds "מפקד: Name" when a commander is selected.
- Per-warrior `note` fields are never included in WhatsApp output.
- `customWhatsAppText` on a Schedule: user-edited override. When set, the preview box shows this text instead of the generated one, and a "↩ חזור לטקסט המקורי" button appears to clear it.
- UniteScreen custom text is session-only — lives in local `customText` state, never persisted to Schedule or KV.

---

## Screens & Features

- **HomeScreen:** welcome state when no groups exist. Entire group card is clickable (except "מחיקה" which uses `e.stopPropagation()`). Same for history cards. Uses `CreateGroupModal` (from `src/components/CreateGroupModal.tsx`) in both welcome state and normal state. Modal requests only a group name, creates an empty `Group` with `members: []`, and navigates to `/group/:groupId/edit` for bulk member addition. No CSV import. Schedules ("לוחות שמירה קודמים") display in reverse chronological order (newest first) with pagination: shows 5 initially, reveals "טען רשימות ישנות" button if more than 5 exist. Clicking the button loads 10 more, then activates infinite scroll via `IntersectionObserver` on a sentinel `<div>` (`visibleCount` state tracks visible items, increments by 10 when sentinel intersects, capped at total count). Primary action buttons: "+ צור לוח שמירה", "⚡ רשימה קצרה", "🛡️ כיתת כוננות", and utility buttons for statistics and citations.
- **CreateGroupModal:** collects only a group name (required, non-empty). On submit, creates an empty group via `upsertGroup()` and calls `onCreated(group)`. HomeScreen handles navigation to GroupEditScreen. CSV import removed.
- **GroupEditScreen:** divided into "מפקדים" section (first) and "לוחמים" section. "בחר מפקדים" navigates to `CommandersSelectScreen` (`/group/:groupId/commanders`) — no modal. Availability toggle uses shared `AvailabilityToggle`. Below the single-member "הוסף חבר" input, a "הוסף מספר חברים בבת אחת" toggle (min-height 44px) reveals a textarea for bulk-adding comma/newline-separated names. `handleBulkAdd` calls `parseNames()`, filters duplicates and existing members (case-insensitive), creates `Member` objects with `availability: 'base'` and `role: 'warrior'`. Autosave via `useEffect` on group state change.
- **CommandersSelectScreen:** route `/group/:groupId/commanders`. Loads group via `getGroupById`, calls `upsertGroup` immediately on every checkbox toggle (autosave pattern). Sections: commanders first, warriors after. Back button returns to `/group/:groupId/edit`.
- **Step3_Order:** availability toggle replaces "דלג". Base→Home moves warrior to "לא משובצים". Home→Base in "לא משובצים" keeps them there. Uses shared `AvailabilityToggle`.
- **StandbyScreen (כיתת כוננות):** commander section (single-select, role="commander") and warriors section (multi-select). Session-only — no persistence. WhatsApp output includes "מפקד: Name" line when a commander is selected.
- **CitationsScreen:** CRUD for citations DB. Author auto-formatted to initials + family name on blur ("יוסי ישראלי" → "י. ישראלי"). Live preview shown during typing. Single word (family name only) left unformatted. Renders citations in sections grouped by creator in **both search and non-search modes** — there is no flat-list mode. Current user's section is first (header "הציטוטים שלי"), then one section per other group member (header = username). Each section starts with `SECTION_INITIAL = 3` visible items; "טען עוד ציטוטים" loads `SECTION_LOAD_MORE = 10` more; after clicking, an `IntersectionObserver` on a per-section sentinel `<div>` drives further increments. Per-section state: `sectionVisible: Record<string, number>` (keyed by username or `ME_KEY`) and `sectionLoadMoreClicked: Record<string, boolean>`. `ME_KEY` is computed as `currentUsername ?? '__me__'` — never the literal string `'__me__'`. Sentinel refs stored in `sentinelRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())`. **When `search` is non-empty**, each section's `getSectionItems(key)` filters by `c.text.includes(search) || c.author.includes(search)`. Sections with 0 matches are hidden. When all sections have 0 matches, shows `"אין תוצאות לחיפוש זה."`. Changing `search` resets `sectionVisible` and `sectionLoadMoreClicked` to `{}` so each section starts at 3 items. There is no `visibleCount` state, no `PAGE_SIZE`, and no flat-list sentinel — do not reintroduce them. In non-selection mode, shows a single `🤝 מרכז השיתוף` button navigating to `/sharing-center`. Edit/delete gated by `canEditDelete = !citation.createdByUsername || citation.createdByUsername === currentUsername`. New citations saved with `createdByUsername: getUsername() ?? undefined`. On mount, if in a sharing group, `syncGroupCitations()` calls `kvCrossReadGroupMember` for each other member and merges via `upsertCitation`/`deleteCitationSilent`. A `loading` state shows `"מסנכרן ציטוטים..."` until sync completes. `setCitations(getCitations())` always called in `finally`. The "אין ציטוטים עדיין." empty state only shown when `citations.length === 0 && !loading`.
- **SharingCenterScreen:** route `/sharing-center`. On mount, `useEffect` calls only `loadSharingCenterUpdates()`. Guest citations fetched on demand only when user opens inbox. Sections: notification banner, guest link card ("📋 העתק קישור" + "📤 שתף בוואטסאפ"), guest inbox button (badge count, opens modal), group management. "עזוב קבוצה" triggers `leaveGroup()` via `ConfirmDialog` then navigates to `/citations`. All sharing and guest citation management lives here — nothing in App.tsx or CitationsScreen. Loading state uses `loadingAction: 'accept' | 'decline' | 'sendInvite' | 'cancelInvite' | 'leave' | null` (not a boolean) so each button shows its own `<Spinner />` independently. Post-action toasts: `handleAccept` on success fires `toast.success('הצטרפת לקבוצת השיתוף בהצלחה')`; `handleDecline` fires `toast.success('ההזמנה נדחתה')`; `handleCancelInvite` fires `toast.success('ההזמנה בוטלה')`; `handleLeave` fires no toast (navigation to `/citations` is the feedback); `handleSendInvite` already has full toast coverage. The cancel outgoing invitation is a named `handleCancelInvite` function — not an inline async onClick.
- **GuestCitationsScreen:** public, no auth. Route `/guest/:username`. Self-contained — no `Layout`, no `Header`. RTL Hebrew form: text textarea + author input + submit. Calls `fetch('/api/kv', { action: 'guestSubmit', targetUsername, text, author })` directly (no cloudStorage helper). Shows `"הציטוט נשלח בהצלחה!"` on success, `"יותר מדי שליחות — נסה שוב בעוד דקה"` on 429, `"שגיאה בשליחה — נסה שוב"` on other failures, `"נדרש טקסט וכותב"` on blank fields.
- **Step4_Review:** default round name is "רשימת שמירה". Quote and author are wizard session state — restored on Back navigation. Per-warrior optional note field (collapsed by default, never in WhatsApp output). Editable end time per station header triggers immediate recalculation via `recalculateStation`. `autoFormatAuthor` toggle (default on) auto-formats author on blur; `saveToCollection` defaults to `true`. Both are wizard session fields.
- **ResultScreen:** "איחוד רשימות" always visible. For continued rounds: shortcut to direct parent or list picker. For others: list picker sorted newest-first with search. Back button: if `ShortListWizardContext` is active, clears session and navigates to `/short-list/step2`; otherwise returns to Step4_Review. When `schedule.customWhatsAppText` exists, clicking "← חזרה לעריכה" shows a guard modal — user must choose to keep or delete the edit. WhatsApp preview box has a pencil button (✏️, `aria-label="ערוך טקסט"`) opening an inline `<textarea>` with "אשר"/"בטל". `schedule` held in `useState` (not read inline) so `refresh()` can re-fetch after storage mutations. `updateScheduleCustomText` is in `src/storage/schedules.ts`.
- **ShortListStep2:** collects `startHour` (0–23), `minutesPerWarrior` (min 1, default 60), `numberOfWarriors` (per station, min 1, max = available base members ÷ stations). UI shows "סך הכל: X חיילים" (numberOfWarriors × stationCount). Navigates to ResultScreen on creation.
- **UniteScreen:** merges two schedules per station sorted by full datetime. Uses earlier schedule's name and citation. Never saved to localStorage. Same pencil-edit UX as ResultScreen but session-only.
- **StatisticsScreen:** two tabs — "זמני שמירה" and "ציטוטים". Citation attribution uses `citationAuthorLinks` map, not name string matching.
- **FallbackScreen:** route `/fallback`. Self-contained — `fixed inset-0`, tap-anywhere-to-home. Shown when wizard step guard fires. Never use as general 404.
- **App routing:** `BrowserRouter` wraps everything. Top-level `Routes`: `/guest/:username → GuestCitationsScreen` (public) and `* → AuthenticatedApp`. `AuthenticatedApp` owns `UsernameGate`, `syncFromCloud`, `WizardProvider`, and all authenticated routes. Never move `BrowserRouter` inside the authenticated branch.
- **ErrorScreen:** self-contained `fixed inset-0`, no `Layout` or `Header`. Click-anywhere navigates via `window.location.href = '/'` — never `useNavigate` (may render outside Router context). Rendered exclusively by `ErrorBoundary`.
- **ErrorBoundary:** class component at `src/components/ErrorBoundary.tsx`. Wraps entire app in `src/main.tsx`, outside `App`. Uses `getDerivedStateFromError` + `componentDidCatch` (logs to console and fires `kvSet` as fire-and-forget). One global boundary only.

---

## Citations

- First time a citation is used in a confirmed schedule, prompt user to link its author to a group member (one-time modal after "Create Schedule"). "דלג" stores a skip marker — never prompt again for that author.
- `citationAuthorLinks` in localStorage: `{ [authorString]: memberId }`. Used for all statistics attribution.
- Random citation selection skips citations where `usedInListIds` contains any existing schedule id. If all used, picks least recently used.
- Citation used in a confirmed schedule: add schedule id to `usedInListIds` and save.

### Citation Sharing — Group Model

- Types: `SharingGroup { groupId, members, joinedAt }`, `GroupInvitation { groupId, fromUsername, sentAt }`. Both in `src/types/index.ts`.
- All sharing localStorage state managed exclusively through `src/storage/citationShare.ts`. Never read/write `share:*` keys directly from components or other storage modules.
- localStorage keys: `share:group` (`SharingGroup | null`), `share:groupInvitation` (`GroupInvitation | null`), `share:outgoingInvitation`, `share:deleteLog`.
- `{username}:share:groupId` is managed server-side by KV group actions — never written directly by the client via `kvSet`.
- Delete log (`share:deleteLog`) records citation ids deleted while in a group. `deleteCitation` appends to it automatically when `getLocalGroup() !== null`. `deleteCitationSilent` bypasses the log — use only when applying a remote delete log.
- Group lifecycle: `sendGroupInvitation`, `acceptGroupInvitation`, `declineGroupInvitation`, `leaveGroup` in `citationShare.ts`. Use dynamic imports for cloudStorage group helpers to avoid import cycles.
- `acceptGroupInvitation` returns `Promise<'ok' | 'cancelled' | 'error'>`. Checks that the KV invitation still exists before calling `kvGroupJoin`. If gone, clears local invitation and returns `'cancelled'`.
- `leaveGroup` removes all citations where `createdByUsername !== undefined && createdByUsername !== currentUser`, then clears local group state. `kvGroupLeave` handles server-side cleanup.
- `syncFromCloud` share sync block: iterates `group.members` (excluding self) and calls `kvCrossReadGroupMember` for each. Returns null silently if member has left.
- `IncomingShareRequestModal` is deleted. Invitations handled exclusively in `SharingCenterScreen`.
- `loadSharingCenterUpdates()` in `citationShare.ts`: checks accept/rejection notifications, fetches `share:groupInvitation` from KV (delivery + cancellation detection), refreshes member list, auto-leaves lone-member groups. Called on mount of `SharingCenterScreen` only. Returns `{ acceptedBy?, rejectedBy?, freshMembers?, invitationCancelledBy?: string, autoLeftLoneGroup?: true }`. When `autoLeftLoneGroup` is true, `leaveGroup()` has already been called — callers must call `refreshState()`.

---

## KV / Cloud Storage

- All KV access goes through `src/storage/cloudStorage.ts`. Never import Upstash Redis directly from components or logic.
- KV is fire-and-forget backup only. KV failure is always silent. localStorage is always the source of truth.
- All KV keys scoped by username: `{username}:{namespace}:{id}` — helpers add the prefix automatically, callers never include it.
- Fetch from KV only what is needed immediately. Do not preload data required only after a user action. Eagerly calling guest-citations KV on mount is the canonical example of what NOT to do — guest citations are fetched only when the user opens the inbox.
- Never use `kv.scan` — use `kv.keys(pattern)` (one Redis command regardless of database size). Never write a cursor loop against Redis.
- `kvMGet<T>(keys: string[])` batch-fetches multiple keys in one request. Server validates all keys start with `{username}:` and array is 1–100 elements. Returns `(T | null)[]`. Used in `syncFromCloud.ts` for all 5 namespaces. Never revert to per-item `kvGet` loops.
- `syncFromCloud()` skips if `localStorage.getItem('synced')` is truthy. Sets `'synced'` only after all namespace blocks complete. The `synced` key is a control flag — accessed directly via `localStorage`, not through a typed helper.
- `kvSet` and `kvDel` silently bail when `localStorage.getItem('noBackup')` is truthy. Any KV write in the backup-removal flow must be called **before** `localStorage.setItem('noBackup', '1')`.
- Tamper-sensitive timestamps (e.g. `backupSuspendedUntil`) must live in KV, not localStorage. Always re-fetch from KV inside guarded actions — never trust React state.
- Raw KV actions (`rawGet`/`rawSet`) restricted to keys matching `device:[^:*?[\]^]{1,128}` — allows Unicode and spaces, blocks only `:` (namespace separator) and Redis glob chars. Device keys: `` `device:${username}` `` — never `` `${username}:device` ``.
- Cross-user writes: `crossSet` action. Allowed sub-keys: `share:groupInvitation`, `share:acceptNotification`, `share:rejectionNotification`. Use `kvCrossSet` from `cloudStorage.ts`. Returns `'ok' | 'already_pending' | 'error'`. The `'already_pending'` case (HTTP 409) means target already has an open request — callers must handle it.
- Cross-user reads: `crossRead` action. Server checks both `{username}:share:groupId` and `{partnerUsername}:share:groupId` are equal and non-null. Use `kvCrossReadGroupMember`.
- Group actions (`groupCreate`, `groupJoin`, `groupLeave`, `groupGetMembers`) manage `group:{groupId}:members` as a raw KV key. Client helpers: `kvGroupCreate`, `kvGroupJoin`, `kvGroupLeave`, `kvGroupGetMembers`.
- `invitationCancel` action deletes `{targetUsername}:share:groupInvitation` after verifying the caller is the sender. Idempotent. Always await `kvInvitationCancel` before `clearOutgoingInvitation()`.
- The `guestSubmit` action bypasses the origin check (guests arrive from external URLs). Handled before the origin check block, applies `guestRatelimit` (20 req/min/IP). Future public-facing actions must follow this same pattern.
- `kvListGuestCitationsLatest(limit)` uses the `listGuestCitations` server action — a single HTTP request; server does `kv.keys()` to find matching keys, then `kv.pipeline()` to batch-fetch all values in one HTTP request, then sorts by `submittedAt` descending and slices to `limit`. Never use `kv.mget(...dynamicArray)` here — see E029. The catch block logs via `console.error` so failures surface in Vercel logs.
- Origin check uses a `Set<string>` from `ALLOWED_ORIGIN`, `VERCEL_URL`, and `VERCEL_PROJECT_PRODUCTION_URL`. If empty (local dev), no restriction. Never revert to single-origin check.
- `callKvRaw` in `cloudStorage.ts` exposes the raw `Response` object. Exists solely for `kvCrossSet` to inspect the 409 status. Do not use it for any other purpose.
