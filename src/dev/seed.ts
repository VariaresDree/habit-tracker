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

declare global {
  interface Window {
    seedDemoData?: () => Promise<void>;
  }
}

if (import.meta.env.DEV) {
  window.seedDemoData = seedDemoData;
}
