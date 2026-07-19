import {
  db,
  migrateV1Checkin,
  migrateV1Habit,
  type Checkin,
  type CheckinV1,
  type Habit,
  type HabitV1,
  type NewHabitDraft,
  type Setting,
} from './db';

// ---------------------------------------------------------------------------
// Outbox: every mutation dual-writes its op in the same transaction, so an
// unsynced local write can never exist without a queued upload (CLAUDE.md:
// unsynced local writes are never dropped). Draining happens in the sync
// engine (step 4); until then ops simply accumulate.
// ---------------------------------------------------------------------------

function enqueue(op: 'upsert' | 'delete', table: 'habits' | 'checkins', key: string, payload: unknown) {
  return db.outbox.add({
    op,
    table,
    key,
    payload,
    idempotencyKey: crypto.randomUUID(),
    queuedAt: new Date().toISOString(),
    attempts: 0,
  });
}

const checkinKey = (habitId: string, date: string) => `${habitId}|${date}`;

// ---------------------------------------------------------------------------
// Habits
// ---------------------------------------------------------------------------

export function getActiveHabits(): Promise<Habit[]> {
  // IndexedDB can't index null values, so these filters run in JS.
  return db.habits
    .orderBy('sortOrder')
    .filter((h) => h.archivedAt === null && h.deletedAt === null)
    .toArray();
}

export function getArchivedHabits(): Promise<Habit[]> {
  return db.habits
    .orderBy('sortOrder')
    .filter((h) => h.archivedAt !== null && h.deletedAt === null)
    .toArray();
}

export async function getHabit(id: string): Promise<Habit | undefined> {
  const habit = await db.habits.get(id);
  return habit && habit.deletedAt === null ? habit : undefined;
}

export function createHabit(draft: NewHabitDraft): Promise<string> {
  return db.transaction('rw', db.habits, db.outbox, async () => {
    const now = new Date().toISOString();
    const last = await db.habits.orderBy('sortOrder').last();
    const habit: Habit = {
      ...draft,
      id: crypto.randomUUID(),
      sortOrder: (last?.sortOrder ?? 0) + 1,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      deletedAt: null,
      userId: null,
      syncStatus: 'pending',
    };
    await db.habits.add(habit);
    await enqueue('upsert', 'habits', habit.id, habit);
    return habit.id;
  });
}

export function updateHabit(id: string, patch: Partial<Habit>): Promise<void> {
  return db.transaction('rw', db.habits, db.outbox, async () => {
    await db.habits.update(id, {
      ...patch,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    });
    const row = await db.habits.get(id);
    if (row) await enqueue('upsert', 'habits', id, row);
  });
}

export function archiveHabit(id: string): Promise<void> {
  return updateHabit(id, { archivedAt: new Date().toISOString() });
}

export function deleteHabitAndCheckins(id: string): Promise<void> {
  // Tombstone, don't erase: a hard delete would silently resurrect on the
  // first pull from another device. Local check-ins are purged; the server
  // cascades them from the habit delete op (step 4 contract).
  return db.transaction('rw', db.habits, db.checkins, db.outbox, async () => {
    const now = new Date().toISOString();
    await db.checkins.where('habitId').equals(id).delete();
    await db.habits.update(id, { deletedAt: now, updatedAt: now, syncStatus: 'pending' });
    await enqueue('delete', 'habits', id, { id, deletedAt: now });
  });
}

// ---------------------------------------------------------------------------
// Checkins
// ---------------------------------------------------------------------------

export function getCheckinsForDate(date: string): Promise<Checkin[]> {
  return db.checkins.where('date').equals(date).toArray();
}

export function getCheckinsForHabit(habitId: string, fromDate: string): Promise<Checkin[]> {
  // Compound-index range scan; results come back in index order (date ascending).
  // Upper bound: U+FFFF sorts after every possible date key.
  return db.checkins
    .where('[habitId+date]')
    .between([habitId, fromDate], [habitId, '￿'])
    .toArray();
}

export function putCheckin(
  entry: Pick<Checkin, 'habitId' | 'date' | 'value'>,
  target: number,
): Promise<void> {
  return db.transaction('rw', db.checkins, db.outbox, async () => {
    const now = new Date().toISOString();
    const prev = await db.checkins.get([entry.habitId, entry.date]);
    const wasComplete = (prev?.value ?? 0) >= target;
    const isComplete = entry.value >= target;
    // completedAt marks the transition into completion and survives further
    // increments; dropping below target clears it.
    const completedAt = isComplete ? (wasComplete ? (prev?.completedAt ?? now) : now) : null;
    const row: Checkin = {
      ...entry,
      updatedAt: now,
      completedAt,
      userId: prev?.userId ?? null,
      syncStatus: 'pending',
    };
    await db.checkins.put(row);
    await enqueue('upsert', 'checkins', checkinKey(entry.habitId, entry.date), row);
  });
}

// ---------------------------------------------------------------------------
// Settings (device-local, never synced)
// ---------------------------------------------------------------------------

export async function getSetting<T = unknown>(key: string): Promise<T | undefined> {
  const row = await db.settings.get(key);
  return row?.value as T | undefined;
}

export async function putSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

// ---------------------------------------------------------------------------
// Backup: V2 is current; V1 files stay importable forever via the same
// transforms the migration uses.
// ---------------------------------------------------------------------------

export interface BackupV2 {
  version: 2;
  exportedAt: string;
  habits: Habit[];
  checkins: Checkin[];
  settings: Setting[];
}

export async function exportData(): Promise<BackupV2> {
  const [habits, checkins, settings] = await Promise.all([
    db.habits.filter((h) => h.deletedAt === null).toArray(),
    db.checkins.toArray(),
    db.settings.toArray(),
  ]);
  return { version: 2, exportedAt: new Date().toISOString(), habits, checkins, settings };
}

function isRecord(row: unknown): row is Record<string, unknown> {
  return !!row && typeof row === 'object';
}

function hasHabitCore(h: Record<string, unknown>): boolean {
  return (
    typeof h.name === 'string' &&
    typeof h.emoji === 'string' &&
    typeof h.color === 'string' &&
    (h.type === 'binary' || h.type === 'count') &&
    typeof h.target === 'number' &&
    (h.unit === undefined || typeof h.unit === 'string') &&
    (h.reminderTime === null || typeof h.reminderTime === 'string') &&
    typeof h.sortOrder === 'number' &&
    typeof h.createdAt === 'string' &&
    (h.archivedAt === null || typeof h.archivedAt === 'string')
  );
}

function isHabitRowV1(row: unknown): boolean {
  return isRecord(row) && typeof row.id === 'number' && hasHabitCore(row);
}

function isHabitRowV2(row: unknown): boolean {
  return (
    isRecord(row) &&
    typeof row.id === 'string' &&
    hasHabitCore(row) &&
    typeof row.updatedAt === 'string' &&
    (row.deletedAt === null || typeof row.deletedAt === 'string')
  );
}

function hasCheckinCore(c: Record<string, unknown>): boolean {
  return (
    typeof c.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(c.date) &&
    typeof c.value === 'number' &&
    typeof c.updatedAt === 'string'
  );
}

function isCheckinRowV1(row: unknown): boolean {
  return isRecord(row) && typeof row.habitId === 'number' && hasCheckinCore(row);
}

function isCheckinRowV2(row: unknown): boolean {
  return (
    isRecord(row) &&
    typeof row.habitId === 'string' &&
    hasCheckinCore(row) &&
    (row.completedAt === null || typeof row.completedAt === 'string')
  );
}

function isSettingRow(row: unknown): boolean {
  return isRecord(row) && typeof row.key === 'string';
}

interface ParsedBackup {
  habits: Habit[];
  checkins: Checkin[];
  settings: Setting[];
}

function parseBackup(payload: unknown): ParsedBackup | null {
  const p = payload as Record<string, unknown> | null;
  if (
    !p ||
    typeof p !== 'object' ||
    !Array.isArray(p.habits) ||
    !Array.isArray(p.checkins) ||
    !Array.isArray(p.settings) ||
    !p.settings.every(isSettingRow)
  ) {
    return null;
  }

  if (p.version === 2) {
    if (!p.habits.every(isHabitRowV2) || !p.checkins.every(isCheckinRowV2)) return null;
    return {
      habits: (p.habits as Habit[]).map((h) => ({ ...h, syncStatus: 'pending' as const })),
      checkins: (p.checkins as Checkin[]).map((c) => ({ ...c, syncStatus: 'pending' as const })),
      settings: p.settings as Setting[],
    };
  }

  if (p.version === 1) {
    if (!p.habits.every(isHabitRowV1) || !p.checkins.every(isCheckinRowV1)) return null;
    const v1Habits = p.habits as HabitV1[];
    const v1Checkins = p.checkins as CheckinV1[];
    const idMap = new Map<number, string>();
    const targetMap = new Map<number, number>();
    for (const h of v1Habits) {
      idMap.set(h.id, crypto.randomUUID());
      targetMap.set(h.id, h.target);
    }
    return {
      habits: v1Habits.map((h) => migrateV1Habit(h, idMap.get(h.id)!)),
      checkins: v1Checkins
        .filter((c) => idMap.has(c.habitId))
        .map((c) => migrateV1Checkin(c, idMap.get(c.habitId)!, targetMap.get(c.habitId)!)),
      settings: p.settings as Setting[],
    };
  }

  return null;
}

export function importData(payload: unknown): Promise<void> {
  const parsed = parseBackup(payload);
  if (!parsed) {
    return Promise.reject(new Error('Not a valid habit-tracker backup file.'));
  }
  // Replace-all in one transaction — and the outbox is cleared too: an
  // import is a new wholesale local truth to be uploaded in full by the
  // sync engine, never replayed op-by-op (audit §5.4).
  return db.transaction('rw', db.habits, db.checkins, db.settings, db.outbox, async () => {
    await Promise.all([
      db.habits.clear(),
      db.checkins.clear(),
      db.settings.clear(),
      db.outbox.clear(),
    ]);
    await Promise.all([
      db.habits.bulkAdd(parsed.habits),
      db.checkins.bulkAdd(parsed.checkins),
      db.settings.bulkAdd(parsed.settings),
    ]);
  });
}
