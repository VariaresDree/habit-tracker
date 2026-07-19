import Dexie from 'dexie';
import { beforeEach, describe, expect, test } from 'vitest';
import { toDateKey } from '../lib/dates';
import { db } from './db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Timestamps are built from local-time Dates so the completedAt same-day
// rule behaves identically in any test timezone.
const sameDay = new Date(2026, 6, 10, 21, 0); // 21:00 local on 2026-07-10
const backfillDate = new Date(2026, 6, 11, 12); // the day being backfilled
const backfillWrite = new Date(2026, 6, 12, 9, 0); // written the day after

async function seedV1Database() {
  await db.delete();
  const v1 = new Dexie('habit-tracker');
  v1.version(1).stores({
    habits: '++id, archivedAt, sortOrder',
    checkins: '[habitId+date], habitId, date',
    settings: '&key',
  });
  await v1.open();

  const meditateId = (await v1.table('habits').add({
    name: 'Meditate',
    emoji: '🧘',
    color: '#3b82f6',
    type: 'binary',
    target: 1,
    reminderTime: '09:00',
    sortOrder: 1,
    createdAt: '2026-06-01T10:00:00.000Z',
    archivedAt: null,
  })) as number;
  const waterId = (await v1.table('habits').add({
    name: 'Water',
    emoji: '💧',
    color: '#10b981',
    type: 'count',
    target: 8,
    unit: 'glasses',
    reminderTime: null,
    sortOrder: 2,
    createdAt: '2026-06-02T10:00:00.000Z',
    archivedAt: '2026-07-01T00:00:00.000Z',
  })) as number;

  await v1.table('checkins').bulkAdd([
    // checked in on the day itself -> completedAt should be the write time
    {
      habitId: meditateId,
      date: toDateKey(sameDay),
      value: 1,
      updatedAt: sameDay.toISOString(),
    },
    // backfilled a day later -> completedAt unknown, must be null
    {
      habitId: meditateId,
      date: toDateKey(backfillDate),
      value: 1,
      updatedAt: backfillWrite.toISOString(),
    },
    // partial countable, same-day, but incomplete -> completedAt null
    {
      habitId: waterId,
      date: toDateKey(sameDay),
      value: 5,
      updatedAt: sameDay.toISOString(),
    },
  ]);

  await v1.table('settings').put({ key: 'theme', value: 'dark' });
  v1.close();
  return { meditateId, waterId };
}

beforeEach(async () => {
  await seedV1Database();
  await db.open();
});

describe('v1 -> v2 migration', () => {
  test('habits get uuid identities with sync metadata, preserving fields', async () => {
    const habits = await db.habits.toArray();
    expect(habits).toHaveLength(2);

    for (const h of habits) {
      expect(h.id).toMatch(UUID_RE);
      expect(h.updatedAt).toBe(h.createdAt); // backfilled
      expect(h.syncStatus).toBe('pending');
      expect(h.userId).toBeNull();
      expect(h.deletedAt).toBeNull();
    }

    const meditate = habits.find((h) => h.name === 'Meditate')!;
    const water = habits.find((h) => h.name === 'Water')!;
    expect(meditate.reminderTime).toBe('09:00');
    expect(meditate.archivedAt).toBeNull();
    expect(water.archivedAt).toBe('2026-07-01T00:00:00.000Z');
    expect(water.unit).toBe('glasses');
    expect(meditate.id).not.toBe(water.id);
  });

  test('checkins are rewritten onto the habit uuids, count preserved', async () => {
    const habits = await db.habits.toArray();
    const meditate = habits.find((h) => h.name === 'Meditate')!;
    const water = habits.find((h) => h.name === 'Water')!;
    const checkins = await db.checkins.toArray();

    expect(checkins).toHaveLength(3);
    expect(checkins.filter((c) => c.habitId === meditate.id)).toHaveLength(2);
    expect(checkins.filter((c) => c.habitId === water.id)).toHaveLength(1);
    for (const c of checkins) {
      expect(c.syncStatus).toBe('pending');
      expect(c.userId).toBeNull();
    }
  });

  test('completedAt backfill: same-day completions only', async () => {
    const habits = await db.habits.toArray();
    const meditate = habits.find((h) => h.name === 'Meditate')!;
    const water = habits.find((h) => h.name === 'Water')!;
    const checkins = await db.checkins.toArray();

    const sameDayRow = checkins.find(
      (c) => c.habitId === meditate.id && c.date === toDateKey(sameDay),
    )!;
    const backfilledRow = checkins.find(
      (c) => c.habitId === meditate.id && c.date === toDateKey(backfillDate),
    )!;
    const partialRow = checkins.find((c) => c.habitId === water.id)!;

    expect(sameDayRow.completedAt).toBe(sameDay.toISOString());
    expect(backfilledRow.completedAt).toBeNull(); // written on a later day
    expect(partialRow.completedAt).toBeNull(); // 5 of 8: never completed
  });

  test('raw v1 rows are preserved in backupV1 and the outbox starts empty', async () => {
    const backup = await db.backupV1.toArray();
    expect(backup.filter((b) => b.table === 'habits')).toHaveLength(2);
    expect(backup.filter((b) => b.table === 'checkins')).toHaveLength(3);
    // untouched originals, numeric ids intact
    const rawHabits = backup
      .filter((b) => b.table === 'habits')
      .map((b) => (b.row as { id: number }).id);
    expect(rawHabits.every((id) => typeof id === 'number')).toBe(true);

    expect(await db.outbox.count()).toBe(0);
  });

  test('settings survive untouched and tmp tables are gone', async () => {
    expect((await db.settings.get('theme'))?.value).toBe('dark');
    const tableNames = db.tables.map((t) => t.name);
    expect(tableNames).not.toContain('habitsTmp');
    expect(tableNames).not.toContain('checkinsTmp');
  });
});

describe('fresh install', () => {
  test('an empty database opens directly at the final schema', async () => {
    await db.delete();
    await db.open();
    expect(await db.habits.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    expect(db.tables.map((t) => t.name)).toEqual(
      expect.arrayContaining(['habits', 'checkins', 'settings', 'outbox', 'backupV1']),
    );
  });
});
