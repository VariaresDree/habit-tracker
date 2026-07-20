# Habit Tracker PWA — Build Plan

> **For agentic workers:** Do not implement until the user approves this plan. When execution starts, work phase-by-phase; each phase ends with the verification steps listed for it. Checkboxes (`- [ ]`) track progress.

**Goal:** A single-user, offline-first habit tracker PWA with binary and countable habits, a one-tap daily check-in screen, per-habit heatmap/streak views, 30/90-day stats, and optional local notification reminders.

**Architecture:** Dexie (IndexedDB) is the single source of truth; a Zustand store is an in-memory mirror for the UI. Every store action awaits the Dexie write first, then updates memory — the app never holds state that isn't already persisted. Historical data (heatmaps, stats) is queried from Dexie on demand via hooks rather than kept in the store. All streak/stats math lives in pure functions so it can be unit-tested without a browser.

**Tech Stack:** React 19, Vite, TypeScript, Zustand, Dexie.js, vite-plugin-pwa, react-router-dom, Vitest + React Testing Library. Styling: plain CSS with custom properties (no CSS framework dependency — swap in later if desired).

## Global Constraints (from CLAUDE.md)

- Never change a function signature or Zustand store shape without updating every call site in the same change — search the whole repo first, list call sites, then edit.
- Offline-first: every write goes to IndexedDB first. No feature may assume network availability.
- Client-only, no backend, single user.

## Key Design Decisions

| Decision | Choice | Why |
|---|---|---|
| Date keys | Local-time `'YYYY-MM-DD'` strings, computed in `lib/dates.ts` only | A habit checked at 11 pm must count for *that* day in the user's timezone; UTC/ISO timestamps cause off-by-one-day bugs in heatmaps and streaks. One module owns the conversion. |
| Check-in identity | Compound primary key `[habitId+date]` on the `checkins` table | One row per habit per day; upsert becomes a single `put()`, no duplicate-row cleanup ever needed. |
| Completion | Derived at read time as `value >= habit.target`, never stored | If the user later edits a countable habit's target, history stays correct. Binary habits are just `target: 1`. |
| Habit deletion | Archive (`archivedAt` timestamp), plus true delete with confirmation | Archiving preserves history; hard delete also removes the habit's check-ins to avoid orphan rows. |
| Reminders | Best-effort local notifications (see Phase 5) | A no-backend PWA cannot do true push. Timers fire while the app is open/installed-and-running; the plan is explicit about this limitation rather than pretending otherwise. |

---

## 1. Folder / File Structure

```
Personal App/
├── CLAUDE.md
├── plan.md
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts               # Vite + react + vite-plugin-pwa config
├── public/
│   └── icons/                   # PWA icons: 192, 512, maskable variants
└── src/
    ├── main.tsx                 # React root, router, SW registration
    ├── App.tsx                  # AppShell: routes + bottom tab bar
    ├── db/
    │   ├── db.ts                # Dexie instance, schema, TS interfaces
    │   └── repo.ts              # ALL Dexie reads/writes live here (typed helpers)
    ├── store/
    │   └── useAppStore.ts       # The single Zustand store (shape in §3)
    ├── lib/
    │   ├── dates.ts             # todayKey(), addDays(), rangeKeys() — local-time only
    │   ├── streaks.ts           # pure: currentStreak(), bestStreak(), completionRate()
    │   └── notifications.ts     # permission flow + reminder scheduling
    ├── hooks/
    │   └── useHabitHistory.ts   # queries Dexie for one habit's check-ins over N days
    ├── components/
    │   ├── layout/
    │   │   ├── AppShell.tsx
    │   │   └── TabBar.tsx
    │   ├── checkin/
    │   │   ├── CheckinScreen.tsx
    │   │   ├── HabitRow.tsx
    │   │   └── CountStepper.tsx
    │   ├── detail/
    │   │   ├── HabitDetailScreen.tsx
    │   │   ├── Heatmap.tsx
    │   │   ├── StreakBadge.tsx
    │   │   └── StatsPanel.tsx
    │   ├── manage/
    │   │   ├── HabitFormScreen.tsx
    │   │   └── SettingsScreen.tsx
    │   └── common/
    │       └── EmptyState.tsx
    └── styles/
        └── app.css              # CSS custom properties, base styles
```

Colocated tests: `src/lib/streaks.test.ts`, `src/lib/dates.test.ts`, `src/db/repo.test.ts`, `src/store/useAppStore.test.ts`, `src/components/**/*.test.tsx`.

Routes: `/` (check-in), `/habit/:id` (detail), `/habit/:id/edit`, `/new`, `/settings`.

## 2. Dexie Schema

```ts
// src/db/db.ts
export interface Habit {
  id?: number;                   // auto-increment
  name: string;
  emoji: string;                 // display glyph, e.g. '💧'
  color: string;                 // CSS color for heatmap/accents
  type: 'binary' | 'count';
  target: number;                // binary: always 1; count: daily goal, e.g. 8
  unit?: string;                 // count only, e.g. 'glasses', 'pages'
  reminderTime: string | null;   // 'HH:mm' local, null = reminder off
  sortOrder: number;             // manual ordering on check-in screen
  createdAt: string;             // ISO timestamp
  archivedAt: string | null;     // null = active
}

export interface Checkin {
  habitId: number;
  date: string;                  // 'YYYY-MM-DD' LOCAL date — the day it counts for
  value: number;                 // binary: 0 or 1; count: units completed
  updatedAt: string;             // ISO timestamp
}

export interface Setting {
  key: string;                   // e.g. 'notificationsEnabled', 'theme'
  value: unknown;
}

db.version(1).stores({
  habits:   '++id, archivedAt, sortOrder',
  checkins: '[habitId+date], habitId, date',
  settings: '&key',
});
```

Index rationale:

- `habits.archivedAt` — filter active vs archived without a table scan.
- `habits.sortOrder` — ordered fetch for the check-in screen.
- `checkins` primary key `[habitId+date]` — upsert one row per habit per day via `put()`; direct lookup for "did I do X on date D".
- `checkins.habitId` — per-habit history for heatmap/streaks (`where('habitId').equals(id)`).
- `checkins.date` — all of today's check-ins in one query to hydrate the check-in screen (`where('date').equals(todayKey())`).

`src/db/repo.ts` exposes the only functions allowed to touch `db`: `getActiveHabits()`, `getHabit(id)`, `createHabit(draft)`, `updateHabit(id, patch)`, `archiveHabit(id)`, `deleteHabitAndCheckins(id)` (transaction), `getCheckinsForDate(date)`, `getCheckinsForHabit(habitId, fromDate)`, `putCheckin(checkin)`, `getSetting(key)` / `putSetting(key, value)`.

## 3. Zustand Store Shape

One store. Per the offline-first guardrail, **every action awaits its `repo.*` write before touching in-memory state.**

```ts
// src/store/useAppStore.ts
interface AppState {
  // --- state ---
  status: 'loading' | 'ready';        // gate UI until hydrate() finishes
  habits: Habit[];                    // active habits, sorted by sortOrder
  selectedDate: string;               // 'YYYY-MM-DD'; defaults to today, allows backfilling recent days
  checkins: Record<number, number>;   // habitId -> value, for selectedDate only

  // --- actions (each: await repo write ➜ then update memory) ---
  hydrate: () => Promise<void>;                       // load habits + selectedDate's checkins on app start
  setSelectedDate: (date: string) => Promise<void>;   // re-queries checkins for that date
  addHabit: (draft: NewHabitDraft) => Promise<number>;      // returns new id
  updateHabit: (id: number, patch: Partial<Habit>) => Promise<void>;
  archiveHabit: (id: number) => Promise<void>;
  deleteHabit: (id: number) => Promise<void>;               // habit + its checkins, in a transaction
  reorderHabits: (idsInOrder: number[]) => Promise<void>;
  toggleCheckin: (habitId: number) => Promise<void>;        // binary: 0 <-> 1 for selectedDate
  setCheckinValue: (habitId: number, value: number) => Promise<void>;  // count: stepper / direct entry
}

type NewHabitDraft = Pick<Habit, 'name' | 'emoji' | 'color' | 'type' | 'target' | 'unit' | 'reminderTime'>;
```

Deliberately **not** in the store:

- **Per-habit history** (heatmap/stats data) — loaded on demand by `useHabitHistory(habitId, days)`, which queries `repo.getCheckinsForHabit()` and re-runs when the store's `checkins` slice changes. Keeps the store small and avoids caching 90 days × N habits in memory.
- **Derived values** (streaks, completion %) — computed by pure functions in `lib/streaks.ts` at render time.
- **Settings** — read/written directly via `repo` from the two screens that need them.

## 4. Components & Responsibilities

| Component | Responsibility |
|---|---|
| `AppShell` | Layout frame, renders routes, waits for `status === 'ready'`, shows load splash otherwise |
| `TabBar` | Bottom navigation: Today (`/`) / New (`/new`) / Settings (`/settings`) — habit browsing happens from the Today list itself |
| `CheckinScreen` | The `/` screen. Lists active habits for `selectedDate` with one-tap interaction; date header with prev/next day arrows (backfill); link to `/new`; `EmptyState` when no habits |
| `HabitRow` | One habit on the check-in screen. Binary: whole row is a tap target calling `toggleCheckin`. Count: shows `value / target unit` and embeds `CountStepper`. Links to detail screen. Shows completion state visually |
| `CountStepper` | +/− buttons calling `setCheckinValue`; long-press/tap on number for direct entry |
| `HabitDetailScreen` | `/habit/:id`. Composes `StreakBadge`, `Heatmap`, `StatsPanel` from `useHabitHistory` data; edit/archive/delete actions |
| `Heatmap` | Pure presentational. Renders last ~17 weeks as a GitHub-style grid; cell intensity = `value / target`, colored with the habit's `color`. Props: `checkins`, `target`, `color` |
| `StreakBadge` | Shows current streak / best streak from `lib/streaks.ts` output. Pure presentational |
| `StatsPanel` | 30-day and 90-day completion rate + totals (for countable: units done). Pure presentational; math from `lib/streaks.ts` |
| `HabitFormScreen` | `/new` and `/habit/:id/edit`. Name, emoji, color, type (binary/count), target + unit (count only), reminder time. Calls `addHabit` / `updateHabit`. Type is locked after creation (changing binary↔count would corrupt history semantics) |
| `SettingsScreen` | Notification permission request + global enable toggle, archived-habits list with unarchive/delete, app version |
| `EmptyState` | Reusable friendly placeholder (no habits yet, no history yet) |

## 5. Phased Milestones

### Phase 1 — Scaffold + data core (no UI beyond "it boots")

- [x] Vite + React 19 + TS project scaffold; Vitest + RTL configured; `fake-indexeddb` dev dependency for Dexie tests
- [x] `db/db.ts` schema exactly as §2; `db/repo.ts` helpers
- [x] `lib/dates.ts` and `lib/streaks.ts` as pure functions, built TDD (tests first): local-date keys, streak across today/yesterday boundary, streak with gaps, completion rate with partial countable days, empty history
- [x] `repo` tests against `fake-indexeddb`: upsert check-in twice for same day → one row; delete habit removes its check-ins

**Verify:** `npm test` green; `npm run dev` serves a blank app without errors. This phase has zero UI logic to review — it's approved on test coverage of the math, which is where the subtle bugs live.

### Phase 2 — Core loop: habits + one-tap check-in

- [x] `useAppStore` exactly as §3, with store tests (mocked repo asserting write-before-state-update order)
- [x] Routing + `AppShell`/`TabBar`
- [x] `HabitFormScreen` (create/edit), `CheckinScreen`, `HabitRow`, `CountStepper`, `EmptyState`
- [x] Date navigation (backfill previous days)

**Verify:** Create a binary and a countable habit; tap to complete; increment the counter past target; reload the page → state persists (IndexedDB); DevTools → Application → IndexedDB shows the rows. App usable as a bare tracker from this point on.

### Phase 3 — History: heatmap, streaks, stats

- [x] `useHabitHistory` hook
- [x] `Heatmap`, `StreakBadge`, `StatsPanel`, composed in `HabitDetailScreen`
- [x] Component tests with seeded histories (streak broken yesterday, partial countable completion, brand-new habit)
- [x] Dev-only seed script to generate 90 days of fake check-ins for visual QA

**Verify:** Against seeded data, heatmap cells match the seed, current/best streak numbers match hand-computed values, 30/90-day rates match. Checking in on the Today screen immediately updates an open detail screen.

### Phase 4 — PWA: installable + offline

- [x] `vite-plugin-pwa`: manifest (name, theme color, icons in `public/icons/`), `registerType: 'prompt'` (autoUpdate can't fire the update toast; prompt delivers the promised UX), precache the app shell
- [x] SW registration with an unobtrusive "update available — reload" toast (`ReloadPrompt`)
- [x] Install experience checked on desktop + Android Chrome — *confirmed by the user on their phone (2026-07-18), along with a real export→import between devices*

**Verify:** `npm run build && npm run preview`; Lighthouse PWA checks pass (installable, has manifest+SW); load once, go offline in DevTools, reload → app fully works and check-ins still write. Install to desktop/home screen and repeat.

### Phase 5 — Reminders + management polish

- [x] `lib/notifications.ts`: permission request flow (triggered from Settings, never on load), per-habit `reminderTime`, scheduler that on app start/focus computes next due reminder and sets a timer; fires via `registration.showNotification()`; skips habits already completed today — *fire path verified by fake-timer tests; a real 2-minute notification needs granted permission on a real machine*
- [x] Honest degradation: Settings copy states reminders fire only while the app is open (background push needs a server); if permission is denied, reminder UI is disabled with an explanatory note — *denied path verified live in the browser*
- [x] `SettingsScreen` complete: archived list, unarchive, hard delete with confirm
- [x] Habit reordering on check-in screen (`reorderHabits`)

**Verify:** Set a reminder 2 minutes out, keep app open → notification fires; complete the habit first → it doesn't. Deny permission → UI degrades as described. Archive/unarchive/delete round-trip preserves or removes history correctly.

---

### Phase 6 — Multi-device access + improvements (added after Phase 5 review)

- [x] JSON export/import: `repo.exportData()/importData()` (replace-all in one transaction) + Settings "Data" section — this is the cross-device data bridge
- [x] Theme toggle: light / dark / system persisted in settings; explicit choice beats OS preference
- [x] GitHub Pages deploy: base path `/habit-tracker/`, router basename, PWA scope, 404.html for SPA deep links
- [x] CI: `.github/workflows/deploy.yml` runs tests + build on every push/PR; deploys `main` to Pages

**Live URL:** https://variaresdree.github.io/habit-tracker/

### Phase 7 — v2 data migration (audit sequencing step 3)

- [x] Gating bug fixes: scheduler double-fire race, import row validation, stats-window clamp to habit existence
- [x] UUID identity via the 5-version Dexie chain (PKs can't change in place — tmp-table recipe, one upgrade transaction), with `backupV1` insurance copy of raw v1 rows
- [x] Sync metadata on every row: `updatedAt`, `syncStatus`, `userId` (null until sign-in), `deletedAt` tombstones; deletes tombstone + purge instead of erase
- [x] Outbox table with atomic entity+outbox dual-writes in every repo mutation (idempotency UUIDs)
- [x] `completedAt` on check-ins (transition-into-completion; same-day backfill rule for migrated rows) — feeds adaptive reminders later
- [x] `BackupV2`; V1 backup files import forever via the shared migration transforms; import clears the outbox (new wholesale truth)
- [x] Live in-place migration rehearsal: genuine v1 DB (2 habits / 167 check-ins) migrated in the browser — all stats identical after (20% · 6/30 · 135 glasses; streaks 2/6), completedAt on exactly the 95 completed same-day rows, settings untouched
- Decisions (2026-07-18): single active account per device; sign-out keeps local data; audit's outbox pattern; badges derived not stored

### Phase 8 — Cross-device sync, part A: upload (audit sequencing step 4a)

- [x] Supabase schema for `habits` + `checkins` with RLS scoped to `auth.uid()`, applied **before** any client code (CLAUDE.md guardrail); `(user_id, updated_at)` indexes ready for the 4b pull cursor
- [x] RLS proven by impersonation SQL: owner sees their row, a different user sees zero rows across both tables, and a forged insert is rejected (`42501`)
- [x] Email one-time-code sign-in (`src/sync/auth.ts`) — no password, no browser-tab detour for the installed PWA
- [x] Outbox push drain (`src/sync/push.ts`): ops removed only after the server confirms; failures keep the queue and count attempts; auth errors halt instead of looping
- [x] `claimLocalDataForUser` — sign-in stamps anonymous rows and uploads them; local data is never overwritten by a pull it didn't ask for
- [x] Different-account guard: signing in a second account on a device that already holds data is refused, not merged
- [x] Sign-out keeps all local data; the app stays fully usable signed-out and offline
- [ ] **Live end-to-end upload — needs the user**: the sign-in code goes to their inbox, so a human must sign in once. Until then push is verified by tests + a live REST probe only.

**Shared database note:** the account limit allowed no third free project, so these tables live in the `budget-tracker-sync` project alongside its `vaults` table (isolated by RLS; one login serves both personal apps).

## Out of Scope (revisited with Phase 6)

- ~~Data export/import~~ — shipped in Phase 6
- ~~Theming beyond light/dark~~ — light/dark/system toggle shipped in Phase 6
- ~~Multi-device~~ — app access via GitHub Pages + data via export/import; live *sync* stays out (see below)
- Cloud sync — declined: any live sync (Dexie Cloud, Supabase) requires a hosted backend, breaking the client-only constraint
- Weekly/custom schedules — declined for now: touches schema, streak semantics, check-in screen, and stats
- Charts beyond the heatmap — declined: low value over the existing heatmap + stats for a single user
