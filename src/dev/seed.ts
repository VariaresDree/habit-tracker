import Dexie from 'dexie';
import { db } from '../db/db';
import * as repo from '../db/repo';
import { addDays, todayKey } from '../lib/dates';

// Deterministic demo data for visual QA (90 days).
// Meditate: done except every day where i % 7 === 3 -> current streak 2, best 6.
// Water: (i * 3) % 10 glasses of target 8 -> completed on i % 10 in {3, 6}, 6/30 days = 20%.
export async function seedDemoData(): Promise<void> {
  await db.delete();
  await db.open();

  const meditateId = await repo.createHabit({
    name: 'Meditate',
    emoji: '🧘',
    color: '#3b82f6',
    type: 'binary',
    target: 1,
    reminderTime: null,
  });
  const waterId = await repo.createHabit({
    name: 'Water',
    emoji: '💧',
    color: '#10b981',
    type: 'count',
    target: 8,
    unit: 'glasses',
    reminderTime: null,
  });

  const today = todayKey();
  for (let i = 1; i <= 90; i++) {
    const date = addDays(today, -i);
    if (i % 7 !== 3) {
      await repo.putCheckin({ habitId: meditateId, date, value: 1 }, 1);
    }
    await repo.putCheckin({ habitId: waterId, date, value: (i * 3) % 10 }, 8);
  }

  location.reload();
}

// Builds a genuine PRE-MIGRATION (v1) database with the same deterministic
// dataset, then reloads so the app's boot runs the v1 -> v2 upgrade live.
// Dress-rehearsal tool for the migration; dev only.
function noonIso(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toISOString(); // same local day as dateKey
}

export async function seedV1DemoData(): Promise<void> {
  db.close();
  await Dexie.delete('habit-tracker');

  const v1 = new Dexie('habit-tracker');
  v1.version(1).stores({
    habits: '++id, archivedAt, sortOrder',
    checkins: '[habitId+date], habitId, date',
    settings: '&key',
  });
  await v1.open();

  const base = {
    reminderTime: null,
    createdAt: new Date().toISOString(),
    archivedAt: null,
  };
  const meditateId = (await v1.table('habits').add({
    name: 'Meditate', emoji: '🧘', color: '#3b82f6', type: 'binary', target: 1, sortOrder: 1, ...base,
  })) as number;
  const waterId = (await v1.table('habits').add({
    name: 'Water', emoji: '💧', color: '#10b981', type: 'count', target: 8, unit: 'glasses', sortOrder: 2, ...base,
  })) as number;

  const today = todayKey();
  const rows = [];
  for (let i = 1; i <= 90; i++) {
    const date = addDays(today, -i);
    if (i % 7 !== 3) {
      rows.push({ habitId: meditateId, date, value: 1, updatedAt: noonIso(date) });
    }
    rows.push({ habitId: waterId, date, value: (i * 3) % 10, updatedAt: noonIso(date) });
  }
  await v1.table('checkins').bulkAdd(rows);
  await v1.table('settings').put({ key: 'theme', value: 'dark' });
  v1.close();

  location.reload();
}

declare global {
  interface Window {
    seedDemoData?: () => Promise<void>;
    seedV1DemoData?: () => Promise<void>;
  }
}

if (import.meta.env.DEV) {
  window.seedDemoData = seedDemoData;
  window.seedV1DemoData = seedV1DemoData;
}
