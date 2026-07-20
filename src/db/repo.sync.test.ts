import { beforeEach, describe, expect, test } from 'vitest';
import { db, type NewHabitDraft } from './db';
import {
  bumpAttempts,
  claimLocalDataForUser,
  countPendingOps,
  createHabit,
  deleteOutboxRows,
  getOutboxBatch,
  importData,
  markSynced,
  putCheckin,
} from './repo';

const USER = '9c72b791-db17-4908-af81-05264f0fa076';

const draft = (name: string): NewHabitDraft => ({
  name,
  emoji: '💧',
  color: '#10b981',
  type: 'binary',
  target: 1,
  reminderTime: null,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('outbox helpers', () => {
  test('getOutboxBatch returns ops in seq order, limited', async () => {
    const id = await createHabit(draft('A'));
    await putCheckin({ habitId: id, date: '2026-07-18', value: 1 }, 1);
    await putCheckin({ habitId: id, date: '2026-07-17', value: 1 }, 1);

    const batch = await getOutboxBatch(2);
    expect(batch).toHaveLength(2);
    expect(batch[0].seq! < batch[1].seq!).toBe(true);
    expect(batch[0].table).toBe('habits');
    expect(await countPendingOps()).toBe(3);
  });

  test('deleteOutboxRows removes only the given ops', async () => {
    const id = await createHabit(draft('A'));
    await putCheckin({ habitId: id, date: '2026-07-18', value: 1 }, 1);
    const [first] = await getOutboxBatch(10);

    await deleteOutboxRows([first.seq!]);

    const left = await getOutboxBatch(10);
    expect(left).toHaveLength(1);
    expect(left[0].table).toBe('checkins');
  });

  test('bumpAttempts increments the retry counter', async () => {
    await createHabit(draft('A'));
    const [op] = await getOutboxBatch(10);
    expect(op.attempts).toBe(0);

    await bumpAttempts([op.seq!]);
    await bumpAttempts([op.seq!]);

    expect((await getOutboxBatch(10))[0].attempts).toBe(2);
  });

  test('markSynced flips syncStatus for habits and checkins', async () => {
    const id = await createHabit(draft('A'));
    await putCheckin({ habitId: id, date: '2026-07-18', value: 1 }, 1);
    const ops = await getOutboxBatch(10);

    await markSynced(ops);

    expect((await db.habits.get(id))?.syncStatus).toBe('synced');
    expect((await db.checkins.get([id, '2026-07-18']))?.syncStatus).toBe('synced');
  });
});

describe('claimLocalDataForUser', () => {
  test('stamps anonymous rows with the user id and marks them pending', async () => {
    const id = await createHabit(draft('A'));
    await putCheckin({ habitId: id, date: '2026-07-18', value: 1 }, 1);
    // simulate everything already uploaded anonymously (impossible in practice,
    // but proves the stamp is what claiming changes)
    await markSynced(await getOutboxBatch(10));

    await claimLocalDataForUser(USER);

    const habit = await db.habits.get(id);
    expect(habit?.userId).toBe(USER);
    expect(habit?.syncStatus).toBe('pending');
    const checkin = await db.checkins.get([id, '2026-07-18']);
    expect(checkin?.userId).toBe(USER);
    expect(checkin?.syncStatus).toBe('pending');
  });

  test('enqueues an upload for every pending row, including after an import cleared the outbox', async () => {
    const id = await createHabit(draft('A'));
    await putCheckin({ habitId: id, date: '2026-07-18', value: 1 }, 1);
    const backup = await (await import('./repo')).exportData();
    await importData(backup); // clears the outbox, marks everything pending
    expect(await countPendingOps()).toBe(0);

    await claimLocalDataForUser(USER);

    const ops = await getOutboxBatch(50);
    expect(ops.map((o) => o.table).sort()).toEqual(['checkins', 'habits']);
    expect(ops.every((o) => o.op === 'upsert')).toBe(true);
  });

  test('does not duplicate ops that are already queued, and is idempotent', async () => {
    const id = await createHabit(draft('A'));
    await putCheckin({ habitId: id, date: '2026-07-18', value: 1 }, 1);
    expect(await countPendingOps()).toBe(2);

    await claimLocalDataForUser(USER);
    const afterFirst = await countPendingOps();
    await claimLocalDataForUser(USER);

    expect(afterFirst).toBe(2); // existing ops reused, not duplicated
    expect(await countPendingOps()).toBe(2);
  });

  test('leaves rows already owned by the user untouched', async () => {
    const id = await createHabit(draft('A'));
    await claimLocalDataForUser(USER);
    // what a successful push does: confirm the rows, then drain the ops
    const ops = await getOutboxBatch(10);
    await markSynced(ops);
    await deleteOutboxRows(ops.map((o) => o.seq!));

    await claimLocalDataForUser(USER);

    // already synced and owned: no re-upload queued
    expect((await db.habits.get(id))?.syncStatus).toBe('synced');
    expect(await countPendingOps()).toBe(0);
  });
});
