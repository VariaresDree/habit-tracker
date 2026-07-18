import { beforeEach, describe, expect, test } from 'vitest';
import { db, type NewHabitDraft } from './db';
import {
  archiveHabit,
  createHabit,
  deleteHabitAndCheckins,
  exportData,
  getActiveHabits,
  getArchivedHabits,
  importData,
  getCheckinsForDate,
  getCheckinsForHabit,
  getHabit,
  getSetting,
  putCheckin,
  putSetting,
} from './repo';

const draft = (name: string): NewHabitDraft => ({
  name,
  emoji: '💧',
  color: '#10b981',
  type: 'binary',
  target: 1,
  reminderTime: null,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('habits', () => {
  test('createHabit returns an id and getActiveHabits returns habits in sortOrder', async () => {
    const idA = await createHabit(draft('Drink water'));
    const idB = await createHabit(draft('Read'));

    const active = await getActiveHabits();
    expect(active.map((h) => h.id)).toEqual([idA, idB]);
    expect(active[0].sortOrder).toBeLessThan(active[1].sortOrder);
    expect(active[0].archivedAt).toBeNull();
    expect(active[0].createdAt).toBeTruthy();
  });

  test('archiveHabit hides the habit from getActiveHabits but keeps the row', async () => {
    const id = await createHabit(draft('Drink water'));
    await archiveHabit(id);

    expect(await getActiveHabits()).toEqual([]);
    const habit = await getHabit(id);
    expect(habit?.archivedAt).toBeTruthy();
  });

  test('getArchivedHabits returns only archived habits', async () => {
    const idA = await createHabit(draft('Drink water'));
    await createHabit(draft('Read'));
    await archiveHabit(idA);

    const archived = await getArchivedHabits();
    expect(archived.map((h) => h.id)).toEqual([idA]);
  });

  test('deleteHabitAndCheckins removes the habit and only its check-ins', async () => {
    const idA = await createHabit(draft('Drink water'));
    const idB = await createHabit(draft('Read'));
    await putCheckin({ habitId: idA, date: '2026-07-18', value: 1 });
    await putCheckin({ habitId: idB, date: '2026-07-18', value: 1 });

    await deleteHabitAndCheckins(idA);

    expect(await getHabit(idA)).toBeUndefined();
    expect(await getCheckinsForHabit(idA, '2000-01-01')).toEqual([]);
    expect(await getCheckinsForHabit(idB, '2000-01-01')).toHaveLength(1);
  });
});

describe('checkins', () => {
  test('putCheckin twice for the same habit and day keeps one row with the latest value', async () => {
    const id = await createHabit(draft('Drink water'));
    await putCheckin({ habitId: id, date: '2026-07-18', value: 1 });
    await putCheckin({ habitId: id, date: '2026-07-18', value: 0 });

    const rows = await getCheckinsForHabit(id, '2000-01-01');
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(0);
    expect(rows[0].updatedAt).toBeTruthy();
  });

  test('getCheckinsForDate returns all habits for one date only', async () => {
    const idA = await createHabit(draft('Drink water'));
    const idB = await createHabit(draft('Read'));
    await putCheckin({ habitId: idA, date: '2026-07-18', value: 1 });
    await putCheckin({ habitId: idB, date: '2026-07-18', value: 3 });
    await putCheckin({ habitId: idA, date: '2026-07-17', value: 1 });

    const rows = await getCheckinsForDate('2026-07-18');
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.habitId))).toEqual(new Set([idA, idB]));
  });

  test('getCheckinsForHabit respects fromDate and returns rows date-ascending', async () => {
    const id = await createHabit(draft('Drink water'));
    await putCheckin({ habitId: id, date: '2026-07-15', value: 1 });
    await putCheckin({ habitId: id, date: '2026-07-17', value: 1 });
    await putCheckin({ habitId: id, date: '2026-07-18', value: 1 });

    const rows = await getCheckinsForHabit(id, '2026-07-16');
    expect(rows.map((r) => r.date)).toEqual(['2026-07-17', '2026-07-18']);
  });
});

describe('export and import', () => {
  test('export -> wipe -> import restores identical rows including ids and compound keys', async () => {
    const idA = await createHabit(draft('Drink water'));
    const idB = await createHabit(draft('Read'));
    await putCheckin({ habitId: idA, date: '2026-07-17', value: 1 });
    await putCheckin({ habitId: idB, date: '2026-07-18', value: 3 });
    await putSetting('notificationsEnabled', true);

    const backup = await exportData();
    expect(backup.version).toBe(1);
    expect(backup.exportedAt).toBeTruthy();

    await db.delete();
    await db.open();
    expect(await getActiveHabits()).toEqual([]);

    await importData(backup);

    expect((await getActiveHabits()).map((h) => h.id)).toEqual([idA, idB]);
    expect(await getCheckinsForHabit(idA, '2000-01-01')).toHaveLength(1);
    expect(await getCheckinsForHabit(idB, '2000-01-01')).toHaveLength(1);
    expect(await getSetting('notificationsEnabled')).toBe(true);
  });

  test('import replaces all existing data', async () => {
    const oldId = await createHabit(draft('Old habit'));
    const backup = await exportData();

    await db.delete();
    await db.open();
    const newId = await createHabit(draft('New habit'));
    await putCheckin({ habitId: newId, date: '2026-07-18', value: 1 });

    await importData(backup);

    const habits = await getActiveHabits();
    expect(habits.map((h) => h.name)).toEqual(['Old habit']);
    expect(await getCheckinsForHabit(newId, '2000-01-01')).toEqual([]);
    expect(await getHabit(oldId)).toBeDefined();
  });

  test('invalid payload rejects without touching existing data', async () => {
    const id = await createHabit(draft('Keep me'));

    await expect(importData({ version: 2, habits: [] })).rejects.toThrow(/valid/i);
    await expect(importData('garbage')).rejects.toThrow(/valid/i);
    await expect(importData(null)).rejects.toThrow(/valid/i);

    expect((await getActiveHabits()).map((h) => h.id)).toEqual([id]);
  });
});

describe('settings', () => {
  test('putSetting and getSetting round-trip', async () => {
    await putSetting('notificationsEnabled', true);
    expect(await getSetting('notificationsEnabled')).toBe(true);
  });

  test('getSetting returns undefined for a missing key', async () => {
    expect(await getSetting('missing')).toBeUndefined();
  });
});
