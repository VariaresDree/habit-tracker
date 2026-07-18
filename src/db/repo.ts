import { db, type Checkin, type Habit, type NewHabitDraft } from './db';

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
