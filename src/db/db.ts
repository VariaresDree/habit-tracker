import Dexie, { type EntityTable, type Table } from 'dexie';

export interface Habit {
  id: number; // auto-increment; EntityTable makes it optional on insert
  name: string;
  emoji: string;
  color: string;
  type: 'binary' | 'count';
  target: number; // binary: always 1; count: daily goal
  unit?: string; // count only, e.g. 'glasses'
  reminderTime: string | null; // 'HH:mm' local, null = off
  sortOrder: number;
  createdAt: string; // ISO timestamp
  archivedAt: string | null; // null = active
}

export interface Checkin {
  habitId: number;
  date: string; // 'YYYY-MM-DD' local — the day it counts for
  value: number; // binary: 0 or 1; count: units completed
  updatedAt: string; // ISO timestamp
}

export interface Setting {
  key: string;
  value: unknown;
}

export type NewHabitDraft = Pick<
  Habit,
  'name' | 'emoji' | 'color' | 'type' | 'target' | 'unit' | 'reminderTime'
>;

export const db = new Dexie('habit-tracker') as Dexie & {
  habits: EntityTable<Habit, 'id'>;
  checkins: Table<Checkin, [number, string]>;
  settings: Table<Setting, string>;
};

db.version(1).stores({
  habits: '++id, archivedAt, sortOrder',
  checkins: '[habitId+date], habitId, date',
  settings: '&key',
});
