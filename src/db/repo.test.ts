import { beforeEach, describe, expect, test, vi } from 'vitest';
import { toDateKey } from '../lib/dates';
import { db, type NewHabitDraft } from './db';
import {
  archiveHabit,
  createHabit,
  deleteHabitAndCheckins,
  exportData,
  getActiveHabits,
  getArchivedHabits,
  getCheckinsForDate,
  getCheckinsForHabit,
  getHabit,
  getSetting,
  importData,
  putCheckin,
  putSetting,
} from './repo';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const draft = (name: string, overrides: Partial<NewHabitDraft> = {}): NewHabitDraft => ({
  name,
  emoji: '💧',
  color: '#10b981',
  type: 'binary',
  target: 1,
  reminderTime: null,
  ...overrides,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('habits', () => {
  test('createHabit mints a uuid and stamps sync metadata', async () => {
    const idA = await createHabit(draft('Drink water'));
    const idB = await createHabit(draft('Read'));

    expect(idA).toMatch(UUID_RE);
    const active = await getActiveHabits();
    expect(active.map((h) => h.id)).toEqual([idA, idB]);
    expect(active[0].sortOrder).toBeLessThan(active[1].sortOrder);
    expect(active[0].updatedAt).toBe(active[0].createdAt);
    expect(active[0].syncStatus).toBe('pending');
    expect(active[0].userId).toBeNull();
    expect(active[0].deletedAt).toBeNull();
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

  test('deleteHabitAndCheckins tombstones the habit and purges its check-ins', async () => {
    const idA = await createHabit(draft('Drink water'));
    const idB = await createHabit(draft('Read'));
    await putCheckin({ habitId: idA, date: '2026-07-18', value: 1 }, 1);
    await putCheckin({ habitId: idB, date: '2026-07-18', value: 1 }, 1);

    await deleteHabitAndCheckins(idA);

    // invisible through the repo…
    expect(await getHabit(idA)).toBeUndefined();
    expect((await getActiveHabits()).map((h) => h.id)).toEqual([idB]);
    expect(await getCheckinsForHabit(idA, '2000-01-01')).toEqual([]);
    expect(await getCheckinsForHabit(idB, '2000-01-01')).toHaveLength(1);
    // …but tombstoned, not erased: sync (step 4) must see the deletion.
    const raw = await db.habits.get(idA);
    expect(raw?.deletedAt).toBeTruthy();
  });
});

describe('checkins', () => {
  test('putCheckin twice for the same habit and day keeps one row with the latest value', async () => {
    const id = await createHabit(draft('Drink water'));
    await putCheckin({ habitId: id, date: '2026-07-18', value: 1 }, 1);
    await putCheckin({ habitId: id, date: '2026-07-18', value: 0 }, 1);

    const rows = await getCheckinsForHabit(id, '2000-01-01');
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(0);
    expect(rows[0].updatedAt).toBeTruthy();
  });

  test('getCheckinsForDate returns all habits for one date only', async () => {
    const idA = await createHabit(draft('Drink water'));
    const idB = await createHabit(draft('Read'));
    await putCheckin({ habitId: idA, date: '2026-07-18', value: 1 }, 1);
    await putCheckin({ habitId: idB, date: '2026-07-18', value: 3 }, 1);
    await putCheckin({ habitId: idA, date: '2026-07-17', value: 1 }, 1);

    const rows = await getCheckinsForDate('2026-07-18');
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.habitId))).toEqual(new Set([idA, idB]));
  });

  test('getCheckinsForHabit respects fromDate and returns rows date-ascending', async () => {
    const id = await createHabit(draft('Drink water'));
    await putCheckin({ habitId: id, date: '2026-07-15', value: 1 }, 1);
    await putCheckin({ habitId: id, date: '2026-07-17', value: 1 }, 1);
    await putCheckin({ habitId: id, date: '2026-07-18', value: 1 }, 1);

    const rows = await getCheckinsForHabit(id, '2026-07-16');
    expect(rows.map((r) => r.date)).toEqual(['2026-07-17', '2026-07-18']);
  });

  test('completedAt tracks the transition into completion', async () => {
    const id = await createHabit(draft('Water', { type: 'count', target: 8 }));
    const today = toDateKey(new Date());

    await putCheckin({ habitId: id, date: today, value: 5 }, 8);
    expect((await getCheckinsForDate(today))[0].completedAt).toBeNull();

    await putCheckin({ habitId: id, date: today, value: 8 }, 8);
    const completed = (await getCheckinsForDate(today))[0].completedAt;
    expect(completed).toBeTruthy();

    // staying complete keeps the original completion moment
    await putCheckin({ habitId: id, date: today, value: 9 }, 8);
    expect((await getCheckinsForDate(today))[0].completedAt).toBe(completed);

    // dropping below target clears it
    await putCheckin({ habitId: id, date: today, value: 3 }, 8);
    expect((await getCheckinsForDate(today))[0].completedAt).toBeNull();
  });
});

describe('outbox', () => {
  test('every mutation dual-writes an outbox op with a fresh idempotency key', async () => {
    const id = await createHabit(draft('Drink water'));
    await putCheckin({ habitId: id, date: '2026-07-18', value: 1 }, 1);
    await archiveHabit(id);
    await deleteHabitAndCheckins(id);

    const ops = await db.outbox.orderBy('seq').toArray();
    expect(ops.map((o) => [o.op, o.table])).toEqual([
      ['upsert', 'habits'],   // create
      ['upsert', 'checkins'], // check-in
      ['upsert', 'habits'],   // archive
      ['delete', 'habits'],   // tombstone
    ]);
    expect(new Set(ops.map((o) => o.idempotencyKey)).size).toBe(4);
    expect(ops.every((o) => o.attempts === 0 && o.queuedAt)).toBe(true);
    expect((ops[0].payload as { id: string }).id).toBe(id);
  });

  test('entity write and outbox write are atomic: if one fails, neither lands', async () => {
    const addSpy = vi.spyOn(db.outbox, 'add').mockRejectedValueOnce(new Error('disk full'));

    await expect(createHabit(draft('Doomed'))).rejects.toThrow();

    expect(await db.habits.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    addSpy.mockRestore();
  });
});

describe('export and import', () => {
  test('export is version 2 and excludes tombstoned habits', async () => {
    const keepId = await createHabit(draft('Keep'));
    const dropId = await createHabit(draft('Drop'));
    await deleteHabitAndCheckins(dropId);

    const backup = await exportData();
    expect(backup.version).toBe(2);
    expect(backup.habits.map((h) => h.id)).toEqual([keepId]);
  });

  test('V2 export -> wipe -> import restores identical rows and clears the outbox', async () => {
    const idA = await createHabit(draft('Drink water'));
    await putCheckin({ habitId: idA, date: '2026-07-17', value: 1 }, 1);
    await putSetting('notificationsEnabled', true);
    const backup = await exportData();

    await db.delete();
    await db.open();
    await createHabit(draft('Stale local'));
    expect(await db.outbox.count()).toBe(1);

    await importData(backup);

    expect((await getActiveHabits()).map((h) => h.id)).toEqual([idA]);
    expect(await getCheckinsForHabit(idA, '2000-01-01')).toHaveLength(1);
    expect(await getSetting('notificationsEnabled')).toBe(true);
    // import is a new wholesale truth: nothing to replay op-by-op
    expect(await db.outbox.count()).toBe(0);
    expect((await db.habits.toArray()).every((h) => h.syncStatus === 'pending')).toBe(true);
  });

  test('a V1 backup file imports with uuid identities and completedAt backfill', async () => {
    const sameDay = new Date(2026, 6, 10, 21);
    const v1File = {
      version: 1,
      exportedAt: '2026-07-01T00:00:00.000Z',
      habits: [
        {
          id: 7,
          name: 'Meditate',
          emoji: '🧘',
          color: '#3b82f6',
          type: 'binary',
          target: 1,
          reminderTime: null,
          sortOrder: 1,
          createdAt: '2026-06-01T10:00:00.000Z',
          archivedAt: null,
        },
      ],
      checkins: [
        { habitId: 7, date: toDateKey(sameDay), value: 1, updatedAt: sameDay.toISOString() },
      ],
      settings: [{ key: 'theme', value: 'dark' }],
    };

    await importData(v1File);

    const habits = await getActiveHabits();
    expect(habits).toHaveLength(1);
    expect(habits[0].id).toMatch(UUID_RE);
    expect(habits[0].name).toBe('Meditate');
    const rows = await getCheckinsForHabit(habits[0].id, '2000-01-01');
    expect(rows).toHaveLength(1);
    expect(rows[0].completedAt).toBe(sameDay.toISOString());
    expect(await getSetting('theme')).toBe('dark');
  });

  test('invalid payload rejects without touching existing data', async () => {
    const id = await createHabit(draft('Keep me'));

    await expect(importData({ version: 3, habits: [] })).rejects.toThrow(/valid/i);
    await expect(importData('garbage')).rejects.toThrow(/valid/i);
    await expect(importData(null)).rejects.toThrow(/valid/i);

    expect((await getActiveHabits()).map((h) => h.id)).toEqual([id]);
  });

  test('malformed rows reject the whole file, existing data untouched', async () => {
    const id = await createHabit(draft('Keep me'));
    const valid = await exportData();

    const badHabit = {
      ...valid,
      habits: [{ ...valid.habits[0], sortOrder: undefined }],
    };
    await expect(importData(badHabit)).rejects.toThrow(/valid/i);

    const badCheckin = {
      ...valid,
      checkins: [{ habitId: id, date: 20260718, value: 1, updatedAt: 'x', completedAt: null }],
    };
    await expect(importData(badCheckin)).rejects.toThrow(/valid/i);

    const badSetting = { ...valid, settings: [{ value: true }] };
    await expect(importData(badSetting)).rejects.toThrow(/valid/i);

    expect((await getActiveHabits()).map((h) => h.id)).toEqual([id]);
  });

  test('rows with extra unknown fields still import (forward-friendly)', async () => {
    const id = await createHabit(draft('Keep me'));
    await putCheckin({ habitId: id, date: '2026-07-18', value: 1 }, 1);
    const backup = await exportData();
    const withExtras = {
      ...backup,
      habits: backup.habits.map((h) => ({ ...h, futureField: 'ok' })),
      checkins: backup.checkins.map((c) => ({ ...c, futureField: 1 })),
    };

    await importData(withExtras);

    expect((await getActiveHabits()).map((h) => h.name)).toEqual(['Keep me']);
    expect(await getCheckinsForHabit(id, '2000-01-01')).toHaveLength(1);
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
