import type { Checkin, Habit } from '../db/db';

// The single camelCase <-> snake_case boundary. Nothing outside this module
// should know what the server's column names look like.

export interface RemoteHabit {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  color: string;
  type: 'binary' | 'count';
  target: number;
  unit: string | null;
  reminder_time: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
}

export interface RemoteCheckin {
  habit_id: string;
  user_id: string;
  date: string;
  value: number;
  updated_at: string;
  completed_at: string | null;
}

// Postgres hands timestamps back as '2026-07-18 02:00:00+00'; local rows and
// all last-write-wins comparisons use ISO, so normalise on the way in.
function iso(value: string): string {
  return new Date(value).toISOString();
}

// userId is passed explicitly rather than read off the row: the pushing
// session's identity is the only one the server will accept under RLS.
export function toRemoteHabit(habit: Habit, userId: string): RemoteHabit {
  return {
    id: habit.id,
    user_id: userId,
    name: habit.name,
    emoji: habit.emoji,
    color: habit.color,
    type: habit.type,
    target: habit.target,
    unit: habit.unit ?? null,
    reminder_time: habit.reminderTime,
    sort_order: habit.sortOrder,
    created_at: habit.createdAt,
    updated_at: habit.updatedAt,
    archived_at: habit.archivedAt,
    deleted_at: habit.deletedAt,
  };
}

export function fromRemoteHabit(row: RemoteHabit): Habit {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    color: row.color,
    type: row.type,
    target: row.target,
    unit: row.unit ?? undefined,
    reminderTime: row.reminder_time,
    sortOrder: row.sort_order,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    archivedAt: row.archived_at ? iso(row.archived_at) : null,
    deletedAt: row.deleted_at ? iso(row.deleted_at) : null,
    userId: row.user_id,
    syncStatus: 'synced',
  };
}

export function toRemoteCheckin(checkin: Checkin, userId: string): RemoteCheckin {
  return {
    habit_id: checkin.habitId,
    user_id: userId,
    date: checkin.date,
    value: checkin.value,
    updated_at: checkin.updatedAt,
    completed_at: checkin.completedAt,
  };
}

export function fromRemoteCheckin(row: RemoteCheckin): Checkin {
  return {
    habitId: row.habit_id,
    date: row.date,
    value: row.value,
    updatedAt: iso(row.updated_at),
    completedAt: row.completed_at ? iso(row.completed_at) : null,
    userId: row.user_id,
    syncStatus: 'synced',
  };
}
