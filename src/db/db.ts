import Dexie, { type Table } from 'dexie';
import { toDateKey } from '../lib/dates';

export type SyncStatus = 'pending' | 'synced';

export interface Habit {
  id: string; // uuid — stable across devices; minted locally
  name: string;
  emoji: string;
  color: string;
  type: 'binary' | 'count';
  target: number; // binary: always 1; count: daily goal
  unit?: string; // count only, e.g. 'glasses'
  reminderTime: string | null; // 'HH:mm' local, null = off
  sortOrder: number;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp — LWW conflict key for sync
  archivedAt: string | null; // null = active
  deletedAt: string | null; // tombstone; deleted rows never leave the device silently
  userId: string | null; // null until first sign-in claims the data
  syncStatus: SyncStatus;
}

export interface Checkin {
  habitId: string; // habit uuid
  date: string; // 'YYYY-MM-DD' local — the day it counts for
  value: number; // binary: 0 or 1; count: units completed
  updatedAt: string; // ISO timestamp — LWW conflict key for sync
  completedAt: string | null; // moment the habit crossed into completion, if known
  userId: string | null;
  syncStatus: SyncStatus;
}

export interface Setting {
  key: string;
  value: unknown;
}

export interface OutboxRow {
  seq?: number;
  op: 'upsert' | 'delete';
  table: 'habits' | 'checkins';
  key: string; // habit uuid, or `${habitId}|${date}` for checkins
  payload: unknown;
  idempotencyKey: string; // uuid per op — server dedupe on retry
  queuedAt: string;
  attempts: number;
}

export interface BackupRow {
  seq?: number;
  table: string;
  row: unknown;
}

export type NewHabitDraft = Pick<
  Habit,
  'name' | 'emoji' | 'color' | 'type' | 'target' | 'unit' | 'reminderTime'
>;

// --- v1 row shapes + transforms, shared by the upgrade chain and V1 imports ---

export interface HabitV1 {
  id: number;
  name: string;
  emoji: string;
  color: string;
  type: 'binary' | 'count';
  target: number;
  unit?: string;
  reminderTime: string | null;
  sortOrder: number;
  createdAt: string;
  archivedAt: string | null;
}

export interface CheckinV1 {
  habitId: number;
  date: string;
  value: number;
  updatedAt: string;
}

export function migrateV1Habit(h: HabitV1, uuid: string): Habit {
  return {
    id: uuid,
    name: h.name,
    emoji: h.emoji,
    color: h.color,
    type: h.type,
    target: h.target,
    unit: h.unit,
    reminderTime: h.reminderTime,
    sortOrder: h.sortOrder,
    createdAt: h.createdAt,
    updatedAt: h.createdAt,
    archivedAt: h.archivedAt,
    deletedAt: null,
    userId: null,
    syncStatus: 'pending',
  };
}

export function migrateV1Checkin(c: CheckinV1, habitUuid: string, target: number): Checkin {
  // A same-day write is the completion moment; anything else (backfill,
  // later edit) has an unknown completion time.
  const sameDay = toDateKey(new Date(c.updatedAt)) === c.date;
  return {
    habitId: habitUuid,
    date: c.date,
    value: c.value,
    updatedAt: c.updatedAt,
    completedAt: sameDay && c.value >= target ? c.updatedAt : null,
    userId: null,
    syncStatus: 'pending',
  };
}

export const db = new Dexie('habit-tracker') as Dexie & {
  habits: Table<Habit, string>;
  checkins: Table<Checkin, [string, string]>;
  settings: Table<Setting, string>;
  outbox: Table<OutboxRow, number>;
  backupV1: Table<BackupRow, number>;
};

db.version(1).stores({
  habits: '++id, archivedAt, sortOrder',
  checkins: '[habitId+date], habitId, date',
  settings: '&key',
});

// IndexedDB cannot change a store's primary key in place, so v2 identity
// (numeric ids -> uuids) takes the canonical Dexie route: copy into tmp
// tables, drop the originals, recreate with the new keys, drop the tmps.
// Dexie runs the whole chain in one versionchange transaction; fresh
// installs skip straight to the final schema.
db.version(2)
  .stores({
    habitsTmp: '&id, sortOrder',
    checkinsTmp: '[habitId+date]',
    outbox: '++seq',
    backupV1: '++seq',
  })
  .upgrade(async (tx) => {
    const oldHabits = (await tx.table('habits').toArray()) as HabitV1[];
    const oldCheckins = (await tx.table('checkins').toArray()) as CheckinV1[];

    // Insurance copy of the untouched originals (audit §5.1).
    await tx.table('backupV1').bulkAdd([
      ...oldHabits.map((row) => ({ table: 'habits', row })),
      ...oldCheckins.map((row) => ({ table: 'checkins', row })),
    ]);

    const idMap = new Map<number, string>();
    const targetMap = new Map<number, number>();
    for (const h of oldHabits) {
      idMap.set(h.id, crypto.randomUUID());
      targetMap.set(h.id, h.target);
    }

    await tx
      .table('habitsTmp')
      .bulkAdd(oldHabits.map((h) => migrateV1Habit(h, idMap.get(h.id)!)));
    await tx.table('checkinsTmp').bulkAdd(
      oldCheckins
        .filter((c) => idMap.has(c.habitId))
        .map((c) => migrateV1Checkin(c, idMap.get(c.habitId)!, targetMap.get(c.habitId)!)),
    );
  });

db.version(3).stores({ habits: null, checkins: null });

db.version(4)
  .stores({
    habits: '&id, archivedAt, sortOrder, updatedAt',
    checkins: '[habitId+date], habitId, date',
  })
  .upgrade(async (tx) => {
    await tx.table('habits').bulkAdd(await tx.table('habitsTmp').toArray());
    await tx.table('checkins').bulkAdd(await tx.table('checkinsTmp').toArray());
  });

db.version(5).stores({ habitsTmp: null, checkinsTmp: null });
