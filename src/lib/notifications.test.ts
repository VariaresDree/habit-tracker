import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { db, type Habit } from '../db/db';
import { useAppStore } from '../store/useAppStore';
import { todayKey } from './dates';
import { nextReminder, startReminderScheduler } from './notifications';

const habit = (id: number, reminderTime: string | null, overrides: Partial<Habit> = {}): Habit => ({
  id,
  name: `Habit ${id}`,
  emoji: '✨',
  color: '#10b981',
  type: 'binary',
  target: 1,
  reminderTime,
  sortOrder: id,
  createdAt: '2026-01-01T00:00:00.000Z',
  archivedAt: null,
  ...overrides,
});

describe('nextReminder', () => {
  const now = new Date(2026, 6, 18, 9, 0); // 09:00 local

  test('picks the earliest future reminder today', () => {
    const result = nextReminder([habit(1, '12:00'), habit(2, '10:00')], {}, now);
    expect(result?.habit.id).toBe(2);
    expect(new Date(result!.at)).toEqual(new Date(2026, 6, 18, 10, 0));
  });

  test('rolls a time that already passed to tomorrow', () => {
    const result = nextReminder([habit(1, '08:00')], {}, now);
    expect(new Date(result!.at)).toEqual(new Date(2026, 6, 19, 8, 0));
  });

  test('a habit completed today is deferred to tomorrow', () => {
    const result = nextReminder([habit(1, '10:00')], { 1: 1 }, now);
    expect(new Date(result!.at)).toEqual(new Date(2026, 6, 19, 10, 0));
  });

  test('a partially complete countable habit still reminds today', () => {
    const h = habit(1, '10:00', { type: 'count', target: 8 });
    const result = nextReminder([h], { 1: 5 }, now);
    expect(new Date(result!.at)).toEqual(new Date(2026, 6, 18, 10, 0));
  });

  test('ignores habits without reminders and archived habits', () => {
    const archived = habit(1, '10:00', { archivedAt: '2026-07-01T00:00:00.000Z' });
    expect(nextReminder([archived, habit(2, null)], {}, now)).toBeNull();
  });

  test('returns null with no habits at all', () => {
    expect(nextReminder([], {}, now)).toBeNull();
  });
});

describe('startReminderScheduler', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date(2026, 6, 18, 9, 0));
    await db.delete();
    await db.open();
    useAppStore.setState({
      status: 'loading',
      habits: [],
      selectedDate: todayKey(),
      checkins: {},
      notificationsEnabled: false,
    });
    await useAppStore.getState().hydrate();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('fires the reminder when due and the habit is incomplete', async () => {
    await useAppStore.getState().addHabit({
      name: 'Meditate',
      emoji: '🧘',
      color: '#3b82f6',
      type: 'binary',
      target: 1,
      reminderTime: '09:02',
    });
    const show = vi.fn();
    const stop = startReminderScheduler(show);

    await vi.advanceTimersByTimeAsync(3 * 60 * 1000);

    expect(show).toHaveBeenCalledTimes(1);
    expect(show.mock.calls[0][0].name).toBe('Meditate');
    stop();
  });

  test('does not fire for a habit already completed today', async () => {
    const id = await useAppStore.getState().addHabit({
      name: 'Meditate',
      emoji: '🧘',
      color: '#3b82f6',
      type: 'binary',
      target: 1,
      reminderTime: '09:02',
    });
    await useAppStore.getState().toggleCheckin(id);
    const show = vi.fn();
    const stop = startReminderScheduler(show);

    await vi.advanceTimersByTimeAsync(3 * 60 * 1000);

    expect(show).not.toHaveBeenCalled();
    stop();
  });

  test('stop() cancels the pending timer', async () => {
    await useAppStore.getState().addHabit({
      name: 'Meditate',
      emoji: '🧘',
      color: '#3b82f6',
      type: 'binary',
      target: 1,
      reminderTime: '09:02',
    });
    const show = vi.fn();
    const stop = startReminderScheduler(show);
    stop();

    await vi.advanceTimersByTimeAsync(3 * 60 * 1000);

    expect(show).not.toHaveBeenCalled();
  });
});
