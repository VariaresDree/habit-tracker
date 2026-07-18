# Habit Tracker — v2 Readiness Audit

Audited: 2026-07-18, against commit `76a6f15` (last pushed; working tree has drifted — see §0).
Scope: the four planned additions — (1) analytics/insights, (2) Supabase cross-device sync,
(3) lightweight gamification, (4) adaptive time-based reminders. Every file:line reference
was verified against the current working tree, not memory. Paths are relative to the
project root (now `Habit Tracker/`).

The v2 constraints already written into CLAUDE.md are treated as binding throughout:
Dexie stays the local source of truth; outbox with idempotent UUIDs; conflict resolution
is last-write-wins by `updated_at` but **unsynced local writes are never dropped**; every
Supabase table gets RLS scoped to `auth.uid()` before client code touches it; reminders
are time-adaptive, never location-based.

---

## 0. Workspace state — read this first (urgent, unrelated to the four additions)

The entire project was moved into a `Habit Tracker/` subfolder, and a sibling
`Budget Tracker/` folder (which is **its own separate git repository**) now lives beside
it. The move is **uncommitted**: the repo rooted at `C:\Users\g16\Personal App\.git`
currently reports every tracked file as deleted, plus two untracked directories.

Consequences while this stands:

- **`git add -A` at the root is dangerous.** It would commit a mass deletion + re-add of
  every file under the `Habit Tracker/` prefix, embed `Budget Tracker/` as a bare gitlink
  (its `.git` makes it an accidental submodule), and **break CI/deploy** — the Pages
  workflow runs `npm ci` at the repo root, where `package.json` would no longer exist.
- The live site and CI are currently *safe* because they build from the last pushed
  commit, which still has the old layout.
- Local `npm test` / `npm run dev` must now run inside `Habit Tracker/`; the Browser-pane
  launch config (`.claude/launch.json`) also moved and its working directory assumptions
  should be re-checked before the next dev session.

Resolution options (decision is yours; none taken in this audit):

| Option | What it means | Notes |
|---|---|---|
| **A. Move `.git` into `Habit Tracker/`** | The habit-tracker repo becomes self-contained in its own folder; `Personal App/` is a plain parent folder of two repos | Cleanest end state. Git sees paths unchanged (repo root moves with the files), so history stays linear and CI keeps working untouched. |
| B. Revert the move | Put files back at the root; keep Budget Tracker elsewhere | Simplest git-wise, loses the two-project folder layout you apparently want. |
| C. Commit the move as a rename | One big rename commit; then update `deploy.yml` to `working-directory: Habit Tracker` and exclude `Budget Tracker/` via `.gitignore` | Works, but permanently couples the two projects' folder into one repo's history. |

Option A is recommended. Whatever you choose, do it **before** any v2 commit.

---

## 1. Current schema & store, and what sync-readiness changes

### As-is

Dexie schema v1 ([src/db/db.ts:40-44](src/db/db.ts)):

```ts
db.version(1).stores({
  habits:   '++id, archivedAt, sortOrder',   // PK: auto-increment number
  checkins: '[habitId+date], habitId, date', // PK: compound [number, 'YYYY-MM-DD']
  settings: '&key',
});
```

Row shapes: `Habit { id, name, emoji, color, type, target, unit?, reminderTime, sortOrder,
createdAt, archivedAt }` — note **no `updatedAt`**. `Checkin { habitId, date, value,
updatedAt }` — already has `updatedAt`. `Setting { key, value }`.

Zustand store ([src/store/useAppStore.ts:10-30](src/store/useAppStore.ts)): 6 state fields
(`status`, `habits`, `selectedDate`, `checkins: Record<number, number>`,
`notificationsEnabled`, `theme`) and 12 actions, every one following the write-through
rule: await the `repo.*` Dexie write, then update memory.

### Required changes for userId scope + sync metadata

**Identity is the deep problem, and it comes first.** `Habit.id` is a per-device
auto-increment integer. Two devices independently create habit `1`; they are different
habits. (This is not hypothetical: your own export/import between devices already
produced divergent id spaces.) Sync requires a globally unique, device-independent
identity.

| Approach | Cost | Verdict |
|---|---|---|
| **UUID becomes the PK** (`Habit.id: string`, `Checkin.habitId: string`) | One-time type ripple through ~16 production call sites + ~30 test sites (§2), plus a Dexie v2 upgrade that rewrites every checkin row | **Recommended.** One migration, then identity is simply correct forever. |
| Dual identity (keep numeric `id`, add indexed `uuid`, map at the sync boundary) | No immediate ripple | Permanent translation layer in every sync path, and every future bug where the two ids are confused. Rejected. |

**Dexie `version(2)` migration** (one upgrade, all at once):

- `habits`: PK → `&id` (UUID string, minted per existing row in the upgrade), add
  `updatedAt` (backfill from `createdAt`), add `syncStatus: 'synced' | 'pending'`
  (backfill `'pending'` — everything local is unsynced by definition), add `userId`
  (backfill `null` = anonymous), add `deletedAt: null` (tombstone support, see §5.5).
- `checkins`: PK stays `[habitId+date]` but `habitId` becomes the habit UUID — compound
  PKs are immutable, so the upgrade must **read + delete + re-add** every row (atomic
  inside the upgrade transaction). Add `syncStatus`, `userId`. `updatedAt` already exists.
- `settings`: **stays device-local, unsynced.** `theme` and `notificationsEnabled` are
  genuinely per-device preferences (a granted notification permission on the phone says
  nothing about the laptop). This avoids sync semantics for the whole table.
- **New `outbox` table**: `'++seq'` with rows
  `{ seq, op: 'upsert' | 'delete', table: 'habits' | 'checkins', key, payload,
  idempotencyKey: uuid, queuedAt, attempts }`. Every repo write dual-writes entity +
  outbox row **in the same Dexie transaction** — that is what makes the CLAUDE.md
  "unsynced local writes are never dropped" guardrail structurally true rather than
  aspirational.
- Naming: server columns are `snake_case` (`updated_at`), client fields `camelCase` —
  put the mapping in one sync-layer module, never scattered.

**`userId` scoping recommendation: single active account per device.** Stamp `userId` on
rows, but do **not** put it in primary keys or indexes. Multi-account-per-device would
force compound keys everywhere (`[userId+habitId+date]`, `[userId+sortOrder]`, …) and
per-account store partitioning — heavy machinery a personal tracker doesn't need.
Account switch = prompt to export, then wipe-and-repull. (Flagged as an open question
in case you do want multi-account.)

**Store changes are additive** (per the CLAUDE.md guardrail, no existing signature
changes): new fields `user: { id, email } | null` and
`syncState: 'idle' | 'syncing' | 'error' | 'offline'`, new actions `signIn`, `signOut`,
and `hydrate()` grows an auth-session read. The outbox is invisible to the store — it
lives entirely inside `repo.ts`, which is exactly why the repo-owns-all-writes pattern
from Phase 1 pays off now.

---

## 2. What breaks, and every call site

### 2a. The UUID type ripple (`number → string` for habit identity)

Signatures that change, with all call sites (from full-repo grep, verified):

| Function (repo.ts) | Production call sites | Test call sites |
|---|---|---|
| `createHabit` → returns `Promise<string>` | [useAppStore.ts:68](src/store/useAppStore.ts) | useAppStore.test.ts:40; seed.ts:12,20 |
| `getHabit(id)` | — (store uses find) | useAppStore.test.ts:132,144,159; HabitFormScreen.test.tsx:99; SettingsScreen.test.tsx:192,207; HabitDetailScreen.test.tsx:89,103 |
| `updateHabit(id, patch)` | useAppStore.ts:75,85,99 | — |
| `archiveHabit(id)` | useAppStore.ts:80 | — |
| `deleteHabitAndCheckins(id)` | useAppStore.ts:91 | — |
| `putCheckin({habitId,…})` | useAppStore.ts:108,114 | useAppStore.test.ts:41,114; HabitDetailScreen.test.tsx:45,46,72; seed.ts:34,36 |
| `getCheckinsForHabit(habitId, from)` | [useHabitHistory.ts:17](src/hooks/useHabitHistory.ts) | useAppStore.test.ts:145; SettingsScreen.test.tsx:208; HabitDetailScreen.test.tsx:104 |
| `getCheckinsForDate` / `getActiveHabits` / `getArchivedHabits` / `getSetting` / `putSetting` | useAppStore.ts:48,49,63,69,86,101,119,124; notifications.ts:81,92; SettingsScreen.tsx:25 | ~15 sites across 5 test files |
| `exportData` / `importData` | SettingsScreen.tsx:53,86 | SettingsScreen.test.tsx:126; repo.test.ts (3 tests) |

Type ripple beyond repo signatures:

- `checkins: Record<number, number>` in the store → `Record<string, number>`
  ([useAppStore.ts:14](src/store/useAppStore.ts)), plus `toValueMap` (line 32) and
  `deleteHabit`'s key delete (line 93).
- Route-param parsing: `Number(id)` at [HabitDetailScreen.tsx:12](src/components/detail/HabitDetailScreen.tsx)
  and the equivalent `Number(id)` lookup in
  [HabitFormScreen.tsx](src/components/manage/HabitFormScreen.tsx) — UUIDs go straight
  into URLs; the conversions are deleted, not adapted.
- `useHabitHistory`'s `Number.isFinite(habitId)` guard
  ([useHabitHistory.ts:15](src/hooks/useHabitHistory.ts)) becomes a truthiness check.
- `Habit` type importers (non-test): useAppStore.ts, notifications.ts,
  SettingsScreen.tsx, StatsPanel.tsx, CountStepper.tsx, HabitRow.tsx, seed.ts — no code
  change for most, but they recompile against the new type and any local `number`
  annotations surface immediately (the strict TS config will catch all of them).
- Notification tag `` `habit-${habit.id}` `` (notifications.ts) — works unchanged.
- **`BackupV1`** ([repo.ts:3-9](src/db/repo.ts)): schema change forces `BackupV2`;
  `importData` currently hard-rejects anything but `version === 1`
  ([repo.ts:25](src/db/repo.ts)) — it must instead accept V1 and migrate it on import,
  or every pre-v2 backup file (including the ones on your phone right now) becomes
  unreadable.

### 2b. What does *not* break

Adding the outbox changes **zero** public repo signatures — writes get an internal
transaction wrapper. All 12 store actions keep their signatures; all component bindings
(HabitRow, CountStepper, CheckinScreen, HabitFormScreen, SettingsScreen,
HabitDetailScreen, AppShell — verified by selector grep) survive untouched except where
the id *type* flows through props.

---

## 3. Gaps per addition

### 3a. Deeper analytics / insights

**Have:** full per-habit history (`getCheckinsForHabit`), pure and well-tested math in
[src/lib/streaks.ts](src/lib/streaks.ts) (`currentStreak`, `bestStreak`,
`completionRate`, `totalUnits`), date helpers, and a hand-rolled zero-dependency Heatmap
to use as the pattern for more visuals.

**Missing:**
- Week/month bucketing helpers in dates.ts (only `dayOfWeek` exists) — needed for
  weekly/monthly summaries; pure functions, TDD like the rest of the lib.
- An all-habits bulk fetch. `exportData`'s three-table dump is the reusable pattern; an
  Insights screen should load all check-ins once, not N× `useHabitHistory`.
- Correlation math: phi coefficient over paired daily completion booleans (countables
  normalized by `value >= target`), restricted to days where both habits existed. Pure
  function; the statistical caveat (tiny N for young habits) should surface in the UI.
- Trend series builder (e.g., rolling 7-day completion rate per habit).
- Any charting. Recommendation: **hand-rolled SVG** line/bar components, consistent with
  the dependency-free Heatmap; a chart library is a lot of bundle for two chart types in
  a PWA that prizes its 110 KB gzip footprint.
- An Insights screen + navigation. TabBar has three tabs; Insights becomes a fourth.
- A purpose-built hook: `useHabitHistory` re-fetches one habit's **entire history on any
  change to the store's checkins slice** ([useHabitHistory.ts:23](src/hooks/useHabitHistory.ts)) —
  acceptable per-habit, wrong shape for a screen aggregating every habit (N full-table
  re-reads per stepper tap).

### 3b. Cross-device sync (Supabase)

**Have:** the two architectural decisions that make sync *feasible* — every write
already funnels through repo.ts, and the store already treats Dexie as the sole source
of truth. Plus `Checkin.updatedAt` already exists.

**Missing — effectively the entire vertical:**
- `@supabase/supabase-js` dependency, client init, env handling (the anon key is public
  by design; **RLS is the security boundary**, per the CLAUDE.md guardrail).
- Auth: sign-in UI (magic link is the low-friction fit for a personal app), session
  persistence/refresh, and the store's auth state (§1).
- The outbox table + dual-write transactions in repo.ts (§1).
- The sync engine: push (drain outbox with idempotency keys, retry with backoff),
  pull (server rows where `updated_at > last_pulled_at`), LWW merge honoring the
  never-drop-unsynced rule, `online`/`offline`/`visibilitychange` triggers. This is the
  "REE Tracker pattern" per CLAUDE.md — an external project I can't inspect, so its
  specifics (cursoring, batch sizes, error taxonomy) are an **open question**.
- Server side: `habits` + `checkins` tables (snake_case, `user_id uuid references auth.users`),
  RLS policies (`auth.uid() = user_id`) on **both** before any client code, unique
  constraint mirroring `[user_id, habit_id, date]`.
- Prerequisites from elsewhere in this audit: UUID identity (§1), `Habit.updatedAt` (§1),
  tombstones for deletes (§5.5), sync-aware import (§5.4).
- Hosting: no gap — GitHub Pages serves a static client; Supabase is called
  client-side. CLAUDE.md's original "client-only, no backend" line is now formally
  contradicted by its own v2 section; the header sentence should be updated to
  "local-first; Supabase for sync only" so the two halves of the file agree.

### 3c. Gamification (lightweight, no social)

**Have:** `currentStreak`/`bestStreak` pure functions and the StreakBadge surface.

**Missing:** milestone definitions (e.g., 7/30/100-day streaks, total-completion tiers),
level function, award-unlock detection, UI (badges on the detail screen, a level chip,
an unlock toast).

**The design decision that matters:** derive vs store.

- **Derive everything (recommended):** milestones/levels are pure functions over
  existing history — zero new tables, zero sync surface, retroactively consistent
  (backfilled check-ins correctly grant or revoke), testable exactly like streaks.ts.
  "Newly unlocked" toasts compare before/after badge sets in `toggleCheckin` — ephemeral
  UI state, not persistence.
- Store awards only if unlocks must survive later history edits (badge kept even though
  the streak was corrected away). That is a real product choice, but it buys a synced
  table, migration surface, and cross-device award reconciliation. Not worth it for
  "lightweight."

### 3d. Adaptive time-based reminders

**Have:** the scheduler skeleton is genuinely close — `nextReminder` is pure and tested,
the scheduler already re-arms on store changes/visibility and re-checks completion at
fire time, and per-habit `reminderTime` exists end to end.

**Missing:**
- **The signal.** Check-ins store the day, not the time of day.
  `Checkin.updatedAt` is a usable proxy **only when** `toDateKey(updatedAt)` equals
  `date` (a same-day check-in ≈ completion moment); backfills and toggle-off/on rewrites
  pollute it. Recommend adding `completedAt: string | null` in the same v2 migration
  (set on the transition into completion, null when value drops below target) rather
  than a second schema bump later.
- The learning function: rolling median clock-time of the last N same-day completions
  (median over mean — one 3 a.m. outlier shouldn't drag the reminder). Pure function in
  lib, TDD'd like streaks.ts. Cold start: fall back to the manual time.
- Plumbing: `reminderTime` widens to `'HH:mm' | 'auto' | null` — touches the Habit type,
  HabitFormScreen (an "adaptive" option), `nextReminder` (resolve `'auto'` via the
  learned time), and Settings copy.
- **Fix §4.1 first** — adaptive scheduling multiplies re-arm frequency, and the
  scheduler has a latent double-fire race.

---

## 4. Bugs and pain points in the existing implementation

Called out unprompted, as requested. Ordered by how much they matter.

1. **Reminder scheduler double-fire race** —
   [notifications.ts:78-88](src/lib/notifications.ts). `arm()` does `clearTimeout(timer)`
   *then* awaits an IndexedDB read (line 81) before `setTimeout` (line 87). The store
   subscription (line 100) fires `arm()` on **every** store change; two overlapping
   `arm()`s can both clear, both await, then both set → two live timers → duplicate
   notifications. Partially masked because both notifications share a `tag`, but the
   `show` callback runs twice. Fix: a generation counter (each `arm()` invalidates prior
   generations after the await). Must land before adaptive reminders.
2. **Stats windows ignore habit age** —
   [StatsPanel.tsx:12-14](src/components/detail/StatsPanel.tsx) computes "Last 30/90
   days" from fixed windows; a habit created yesterday with one completion shows
   "3% · 1/30 days". `completionRate` already takes an arbitrary `from` — clamp it to
   `max(from, toDateKey(habit.createdAt))` and label "X / min(n, age) days".
3. **Archived habits are unreachable** — detail and edit both resolve from active-only
   `store.habits` ([HabitDetailScreen.tsx:13,18](src/components/detail/HabitDetailScreen.tsx));
   an archived habit's URL renders "Habit not found" (observed live during Phase 6 QA)
   and its history can't be viewed without unarchiving. Fix: fall back to
   `repo.getHabit(id)` and render a read-only archived state.
4. **`store.updateHabit` inconsistencies** ([useAppStore.ts:74-77](src/store/useAppStore.ts)):
   patching an archived id persists to Dexie but silently skips memory (row not in the
   active array); patching `sortOrder` doesn't re-sort the in-memory array. Both are
   latent footguns rather than live bugs (current callers avoid both paths).
5. **`reorderHabits` is not transactional** ([useAppStore.ts:97-103](src/store/useAppStore.ts)):
   N parallel `updateHabit` writes; an interruption leaves a mixed order. Self-healing
   on next reorder, but under sync each partial write becomes an outbox entry —
   worth wrapping in one transaction during the v2 work.
6. **Toggle-off leaves `value: 0` rows forever** ([useAppStore.ts:105-110](src/store/useAppStore.ts)).
   Harmless for stats (completion requires `value >= target`) but permanent noise in
   exports and, post-v2, sync traffic. Consider deleting the row on toggle-off instead.
7. **`importData` validates shape, not rows** ([repo.ts:20-31](src/db/repo.ts)): arrays
   of garbage import successfully; a habit missing `sortOrder` then silently vanishes
   from `getActiveHabits` (unindexed rows are skipped by `orderBy`). A row-shape
   validator is cheap and becomes mandatory once imports can feed a sync pipeline.
8. **Base path duplicated as literals** — `'/habit-tracker/'` appears independently in
   `base`, `manifest.start_url`, `scope`, and `navigateFallback` in
   [vite.config.ts](vite.config.ts); derive the latter three from one constant.
9. Minor: stepper count has no `aria-live` (screen readers don't hear increments);
   leftover QA state on test origins (10:09 reminder times, `notificationsEnabled`
   true); dev seed (`src/dev/seed.ts`) wipes the DB without confirmation — fine today,
   but see §5.8.

---

## 5. Migration risk areas — where local data could be lost

1. **A failed Dexie upgrade bricks the app.** If `version(2).upgrade()` throws, the DB
   never opens and the app is stuck on the splash for that device. Insurance: as the
   *first step inside* the upgrade, copy all v1 rows into a `backup_v1` table; the
   upgrade is atomic either way, but this preserves an escape hatch for a logic bug
   discovered after shipping.
2. **The checkins PK rewrite is the riskiest single step.** Compound PKs can't be
   updated in place, so `habitId: number → uuid` means read-all + delete + re-add for
   every check-in inside the upgrade transaction. Dexie makes it all-or-nothing, but it
   must be tested against a device-realistic dataset (years of rows), not the 169-row
   seed.
3. **Numeric-id collision across devices.** Device A's habit `1` and device B's habit
   `1` are different habits. UUIDs must be minted **on-device, during the v2 upgrade,
   before any first push** — and no sync code may ever key on the legacy numeric id, or
   two devices' habits silently merge. (Your devices are already in this divergent-id
   state from the export/import you performed.)
4. **Replace-all import is the biggest silent-loss trap post-sync.** Today
   `importData` clears all three tables ([repo.ts:34-41](src/db/repo.ts)). Once sync
   exists: if the clear bypasses the outbox, the cloud "resurrects" everything the
   import removed; if the clear *goes through* the outbox, the import **propagates a
   full wipe to every other device**. Import must become sync-aware in the same change
   that introduces the outbox — pause sync + non-outboxed replace + full re-upload as
   the account's new truth, or merge semantics. Do not defer this.
5. **Hard deletes resurrect.** `deleteHabitAndCheckins` physically removes rows; with a
   pull channel, a habit deleted on the phone comes back from the server on the next
   laptop pull. Tombstones (`deletedAt`) or outbox delete-ops must ship in the same
   release as pull — there is no safe intermediate state.
6. **First sign-in must claim, never clobber.** The adoption flow for a device full of
   anonymous local data is upload-as-mine, then reconcile — never pull-then-overwrite.
   This is the concrete meaning of the CLAUDE.md never-drop guardrail at the auth
   boundary. Sign-*out* semantics (keep a local copy vs wipe) is a product decision —
   open question.
7. **Service-worker version lag.** After v2 ships, devices offline for weeks still run
   v1 code writing v1 rows; the upgrade runs whenever they finally update. Safe today
   because the row shape never changed within v1 — keep it true by never patching v1
   retroactively. Concurrent tabs on different versions are handled by the existing
   ReloadPrompt update flow.
8. **The dev seed wipes without asking** and, once a dev profile can be signed in,
   would enqueue that wipe/replace into a real account's outbox. Guard it (`confirm` +
   refuse when signed in) as part of the sync work.

---

## Open questions (decisions needed before v2 implementation, none blocking this audit)

1. Multi-account per device, or single-active-account (recommended §1)?
2. Sign-out: keep local data on the device, or wipe after export prompt?
3. The "REE Tracker" outbox pattern referenced in CLAUDE.md — anything specific to
   mirror beyond outbox + idempotent UUIDs + LWW (cursor format, batch sizes, error
   handling)?
4. Charts: hand-rolled SVG (recommended §3a) or a small charting dependency?
5. Gamification: confirm derive-don't-store (§3c) — it changes whether sync ever sees
   a third table.

## Suggested sequencing (if the audit is accepted as-is)

1. Resolve §0 (workspace/git) — everything else commits on top of it.
2. Bug fixes that gate v2: §4.1 scheduler race, §4.7 import validation, §4.2 stats
   clamp (cheap, user-visible).
3. The v2 Dexie migration as **one** schema bump: UUIDs + `updatedAt` + `syncStatus` +
   `userId` + `deletedAt` + `completedAt` + outbox table + `BackupV2` (§1, §2, §3d, §5).
4. Sync vertical (auth → outbox push → pull → conflict handling), behind the CLAUDE.md
   guardrails.
5. Analytics, gamification, adaptive reminders in any order — all three are pure-logic
   + UI layers once the migration has landed.
