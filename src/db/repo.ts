import { db, type Checkin, type Habit, type NewHabitDraft, type Setting } from './db';

export interface BackupV1 {
  version: 1;
  exportedAt: string;
  habits: Habit[];
  checkins: Checkin[];
  settings: Setting[];
}

export async function exportData(): Promise<BackupV1> {
  const [habits, checkins, settings] = await Promise.all([
    db.habits.toArray(),
    db.checkins.toArray(),
    db.settings.toArray(),
  ]);
  return { version: 1, exportedAt: new Date().toISOString(), habits, checkins, settings };
}

export function importData(payload: unknown): Promise<void> {
  const p = payload as Partial<BackupV1> | null;
  if (
    !p ||
    typeof p !== 'object' ||
    p.version !== 1 ||
    !Array.isArray(p.habits) ||
    !Array.isArray(p.checkins) ||
    !Array.isArray(p.settings)
  ) {
    return Promise.reject(new Error('Not a valid habit-tracker backup file.'));
  }
  // Replace-all semantics in one transaction: either the whole backup lands
  // or nothing changes.
  return db.transaction('rw', db.habits, db.checkins, db.settings, async () => {
    await Promise.all([db.habits.clear(), db.checkins.clear(), db.settings.clear()]);
    await Promise.all([
      db.habits.bulkAdd(p.habits as Habit[]),
      db.checkins.bulkAdd(p.checkins as Checkin[]),
      db.settings.bulkAdd(p.settings as Setting[]),
    ]);
  });
}

export function getActiveHabits(): Promise<Habit[]> {
  // IndexedDB can't index null values, so the active filter runs in JS.
  return db.habits
    .orderBy('sortOrder')
    .filter((h) => h.archivedAt === null)
    .toArray();
}

export function getArchivedHabits(): Promise<Habit[]> {
  return db.habits
    .orderBy('sortOrder')
    .filter((h) => h.archivedAt !== null)
    .toArray();
}

export function getHabit(id: number): Promise<Habit | undefined> {
  return db.habits.get(id);
}

export async function createHabit(draft: NewHabitDraft): Promise<number> {
  const last = await db.habits.orderBy('sortOrder').last();
  return db.habits.add({
    ...draft,
    sortOrder: (last?.sortOrder ?? 0) + 1,
    createdAt: new Date().toISOString(),
    archivedAt: null,
  });
}

export async function updateHabit(id: number, patch: Partial<Habit>): Promise<void> {
  await db.habits.update(id, patch);
}

export async function archiveHabit(id: number): Promise<void> {
  await db.habits.update(id, { archivedAt: new Date().toISOString() });
}

export function deleteHabitAndCheckins(id: number): Promise<void> {
  return db.transaction('rw', db.habits, db.checkins, async () => {
    await db.checkins.where('habitId').equals(id).delete();
    await db.habits.delete(id);
  });
}

export function getCheckinsForDate(date: string): Promise<Checkin[]> {
  return db.checkins.where('date').equals(date).toArray();
}

export function getCheckinsForHabit(habitId: number, fromDate: string): Promise<Checkin[]> {
  // Compound-index range scan; results come back in index order (date ascending).
  // Upper bound: U+FFFF sorts after every possible date key.
  return db.checkins
    .where('[habitId+date]')
    .between([habitId, fromDate], [habitId, '￿'])
    .toArray();
}

export async function putCheckin(entry: Omit<Checkin, 'updatedAt'>): Promise<void> {
  await db.checkins.put({ ...entry, updatedAt: new Date().toISOString() });
}

export async function getSetting<T = unknown>(key: string): Promise<T | undefined> {
  const row = await db.settings.get(key);
  return row?.value as T | undefined;
}

export async function putSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}
