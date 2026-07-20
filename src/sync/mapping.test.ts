import { describe, expect, test } from 'vitest';
import type { Checkin, Habit } from '../db/db';
import {
  fromRemoteCheckin,
  fromRemoteHabit,
  toRemoteCheckin,
  toRemoteHabit,
} from './mapping';

const USER = '9c72b791-db17-4908-af81-05264f0fa076';

const habit: Habit = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  name: 'Water',
  emoji: '💧',
  color: '#10b981',
  type: 'count',
  target: 8,
  unit: 'glasses',
  reminderTime: '09:00',
  sortOrder: 2,
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-07-18T02:00:00.000Z',
  archivedAt: null,
  deletedAt: null,
  userId: USER,
  syncStatus: 'pending',
};

const checkin: Checkin = {
  habitId: habit.id,
  date: '2026-07-18',
  value: 8,
  updatedAt: '2026-07-18T02:00:00.000Z',
  completedAt: '2026-07-18T02:00:00.000Z',
  userId: USER,
  syncStatus: 'pending',
};

describe('habit mapping', () => {
  test('to remote uses snake_case and stamps the pushing user', () => {
    const remote = toRemoteHabit(habit, USER);
    expect(remote).toEqual({
      id: habit.id,
      user_id: USER,
      name: 'Water',
      emoji: '💧',
      color: '#10b981',
      type: 'count',
      target: 8,
      unit: 'glasses',
      reminder_time: '09:00',
      sort_order: 2,
      created_at: habit.createdAt,
      updated_at: habit.updatedAt,
      archived_at: null,
      deleted_at: null,
    });
  });

  test('round-trips back to the local shape as synced', () => {
    const back = fromRemoteHabit(toRemoteHabit(habit, USER));
    expect(back).toEqual({ ...habit, syncStatus: 'synced' });
  });

  test('normalises Postgres timestamps to ISO on the way back', () => {
    const remote = { ...toRemoteHabit(habit, USER), updated_at: '2026-07-18 02:00:00+00' };
    expect(fromRemoteHabit(remote).updatedAt).toBe('2026-07-18T02:00:00.000Z');
  });

  test('missing optional fields survive the round trip', () => {
    const bare: Habit = { ...habit, unit: undefined, reminderTime: null, archivedAt: null };
    const back = fromRemoteHabit(toRemoteHabit(bare, USER));
    expect(back.unit).toBeUndefined();
    expect(back.reminderTime).toBeNull();
  });
});

describe('checkin mapping', () => {
  test('to remote uses snake_case and stamps the pushing user', () => {
    expect(toRemoteCheckin(checkin, USER)).toEqual({
      habit_id: checkin.habitId,
      user_id: USER,
      date: '2026-07-18',
      value: 8,
      updated_at: checkin.updatedAt,
      completed_at: checkin.completedAt,
    });
  });

  test('round-trips back to the local shape as synced', () => {
    const back = fromRemoteCheckin(toRemoteCheckin(checkin, USER));
    expect(back).toEqual({ ...checkin, syncStatus: 'synced' });
  });

  test('a never-completed check-in keeps a null completedAt', () => {
    const partial: Checkin = { ...checkin, value: 3, completedAt: null };
    expect(fromRemoteCheckin(toRemoteCheckin(partial, USER)).completedAt).toBeNull();
  });
});
