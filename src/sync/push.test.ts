import { beforeEach, describe, expect, test, vi } from 'vitest';
import { db, type NewHabitDraft } from '../db/db';
import * as repo from '../db/repo';
import { pushOutbox } from './push';

const USER = '9c72b791-db17-4908-af81-05264f0fa076';

interface Call {
  table: string;
  op: 'upsert' | 'update' | 'delete';
  rows?: Record<string, unknown>[];
  patch?: Record<string, unknown>;
  filters: [string, unknown][];
}

// A minimal stand-in for the supabase query builder: records every call and
// returns whatever error the test has armed.
const h = vi.hoisted(() => {
  const state = {
    configured: true,
    error: null as null | { message: string; code?: string },
    calls: [] as Call[],
  };
  class Query {
    constructor(private rec: Call) {}
    eq(col: string, val: unknown) {
      this.rec.filters.push([col, val]);
      return this;
    }
    then(resolve: (v: { error: unknown }) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve({ error: state.error }).then(resolve, reject);
    }
  }
  const fake = {
    from(table: string) {
      return {
        upsert(rows: Record<string, unknown>[]) {
          const rec: Call = { table, op: 'upsert', rows, filters: [] };
          state.calls.push(rec);
          return new Query(rec);
        },
        update(patch: Record<string, unknown>) {
          const rec: Call = { table, op: 'update', patch, filters: [] };
          state.calls.push(rec);
          return new Query(rec);
        },
        delete() {
          const rec: Call = { table, op: 'delete', filters: [] };
          state.calls.push(rec);
          return new Query(rec);
        },
      };
    },
  };
  return { state, fake };
});

vi.mock('./client', () => ({
  isSyncConfigured: () => h.state.configured,
  getSupabase: () => h.fake,
}));

const draft = (name: string, overrides: Partial<NewHabitDraft> = {}): NewHabitDraft => ({
  name,
  emoji: '💧',
  color: '#10b981',
  type: 'binary',
  target: 1,
  reminderTime: null,
  ...overrides,
});

const callsTo = (table: string, op: Call['op']) =>
  h.state.calls.filter((c) => c.table === table && c.op === op);

beforeEach(async () => {
  h.state.configured = true;
  h.state.error = null;
  h.state.calls = [];
  await db.delete();
  await db.open();
});

describe('pushOutbox', () => {
  test('uploads queued habits and check-ins, then drains the outbox', async () => {
    const id = await repo.createHabit(draft('Meditate'));
    await repo.putCheckin({ habitId: id, date: '2026-07-18', value: 1 }, 1);
    await repo.claimLocalDataForUser(USER);

    const result = await pushOutbox(USER);

    expect(result).toMatchObject({ status: 'pushed', ops: 2 });
    const habitUpserts = callsTo('habits', 'upsert');
    expect(habitUpserts).toHaveLength(1);
    expect(habitUpserts[0].rows![0]).toMatchObject({ id, user_id: USER, name: 'Meditate' });
    const checkinUpserts = callsTo('checkins', 'upsert');
    expect(checkinUpserts[0].rows![0]).toMatchObject({ habit_id: id, date: '2026-07-18', user_id: USER });

    expect(await repo.countPendingOps()).toBe(0);
    expect((await db.habits.get(id))?.syncStatus).toBe('synced');
    expect((await db.checkins.get([id, '2026-07-18']))?.syncStatus).toBe('synced');
  });

  test('sends the row as it stands now, not the value captured when queued', async () => {
    const id = await repo.createHabit(draft('Old name'));
    await repo.updateHabit(id, { name: 'New name' });
    await repo.claimLocalDataForUser(USER);

    await pushOutbox(USER);

    const rows = callsTo('habits', 'upsert').flatMap((c) => c.rows!);
    expect(rows.every((r) => r.name === 'New name')).toBe(true);
  });

  test('a failed upload leaves the outbox intact and counts the attempt', async () => {
    const id = await repo.createHabit(draft('Meditate'));
    await repo.claimLocalDataForUser(USER);
    h.state.error = { message: 'network down' };

    const result = await pushOutbox(USER);

    expect(result).toMatchObject({ status: 'error', retryable: true });
    expect(await repo.countPendingOps()).toBe(1);
    expect((await repo.getOutboxBatch(10))[0].attempts).toBe(1);
    expect((await db.habits.get(id))?.syncStatus).toBe('pending');
  });

  test('an auth failure stops the drain and is not retryable', async () => {
    await repo.createHabit(draft('Meditate'));
    await repo.claimLocalDataForUser(USER);
    h.state.error = { message: 'JWT expired', code: 'PGRST301' };

    const result = await pushOutbox(USER);

    expect(result).toMatchObject({ status: 'error', retryable: false });
    expect(await repo.countPendingOps()).toBe(1);
  });

  test('a deleted habit pushes a tombstone and clears its remote check-ins', async () => {
    const id = await repo.createHabit(draft('Meditate'));
    await repo.putCheckin({ habitId: id, date: '2026-07-18', value: 1 }, 1);
    await repo.claimLocalDataForUser(USER);
    await pushOutbox(USER);
    h.state.calls = [];

    await repo.deleteHabitAndCheckins(id);
    const result = await pushOutbox(USER);

    expect(result.status).toBe('pushed');
    const tombstone = callsTo('habits', 'update')[0];
    expect(tombstone.patch!.deleted_at).toBeTruthy();
    expect(tombstone.filters).toEqual([['id', id]]);
    expect(callsTo('checkins', 'delete')[0].filters).toEqual([['habit_id', id]]);
    expect(await repo.countPendingOps()).toBe(0);
  });

  test('does nothing when sync is not configured', async () => {
    await repo.createHabit(draft('Meditate'));
    await repo.claimLocalDataForUser(USER);
    h.state.configured = false;

    const result = await pushOutbox(USER);

    expect(result).toEqual({ status: 'idle' });
    expect(h.state.calls).toHaveLength(0);
    expect(await repo.countPendingOps()).toBe(1);
  });

  test('an empty outbox is a no-op', async () => {
    expect(await pushOutbox(USER)).toEqual({ status: 'idle' });
    expect(h.state.calls).toHaveLength(0);
  });
});
