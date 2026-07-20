import type { SupabaseClient } from '@supabase/supabase-js';
import { db, type OutboxRow } from '../db/db';
import * as repo from '../db/repo';
import { getSupabase, isSyncConfigured } from './client';
import { toRemoteCheckin, toRemoteHabit, type RemoteCheckin, type RemoteHabit } from './mapping';

export interface PushResult {
  status: 'idle' | 'pushed' | 'error';
  ops?: number;
  error?: string;
  retryable?: boolean;
}

const BATCH_SIZE = 200;

interface SupabaseError {
  message?: string;
  code?: string;
}

// Auth failures will not fix themselves by retrying — stop the drain and let
// the UI ask for a fresh sign-in instead of hammering the server.
function isAuthError(error: SupabaseError): boolean {
  const text = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  return (
    text.includes('jwt') ||
    text.includes('unauthor') ||
    text.includes('401') ||
    text.includes('pgrst301')
  );
}

async function run(query: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await query;
  if (error) throw error;
}

async function sendBatch(
  supabase: SupabaseClient,
  batch: OutboxRow[],
  userId: string,
): Promise<void> {
  const habitUpserts: RemoteHabit[] = [];
  const checkinUpserts: RemoteCheckin[] = [];
  const habitDeletes: string[] = [];
  const checkinDeletes: [string, string][] = [];

  for (const op of batch) {
    if (op.table === 'habits') {
      // Deliberately re-read instead of trusting op.payload: the queued
      // snapshot can be stale, and ops queued before sign-in carry a null
      // user_id the server would reject. Current state is the truth to send.
      const row = op.op === 'delete' ? undefined : await db.habits.get(op.key);
      if (op.op === 'delete' || row?.deletedAt) {
        habitDeletes.push(op.key);
      } else if (row) {
        habitUpserts.push(toRemoteHabit(row, userId));
      }
    } else {
      const [habitId, date] = op.key.split('|');
      if (op.op === 'delete') {
        checkinDeletes.push([habitId, date]);
      } else {
        const row = await db.checkins.get([habitId, date]);
        if (row) checkinUpserts.push(toRemoteCheckin(row, userId));
      }
    }
  }

  // Habits first: check-ins carry a foreign key to them.
  if (habitUpserts.length) await run(supabase.from('habits').upsert(habitUpserts));
  if (checkinUpserts.length) await run(supabase.from('checkins').upsert(checkinUpserts));

  for (const id of habitDeletes) {
    // Soft-delete server-side so other devices learn about the deletion when
    // they pull; a hard delete would look identical to "never seen".
    const local = await db.habits.get(id);
    const deletedAt = local?.deletedAt ?? new Date().toISOString();
    await run(
      supabase
        .from('habits')
        .update({ deleted_at: deletedAt, updated_at: local?.updatedAt ?? deletedAt })
        .eq('id', id),
    );
    await run(supabase.from('checkins').delete().eq('habit_id', id));
  }

  for (const [habitId, date] of checkinDeletes) {
    await run(supabase.from('checkins').delete().eq('habit_id', habitId).eq('date', date));
  }
}

// Drains the outbox oldest-first. An op is only removed once the server has
// confirmed it, so an unsynced local write is never lost (CLAUDE.md).
export async function pushOutbox(userId: string): Promise<PushResult> {
  if (!isSyncConfigured()) return { status: 'idle' };

  const supabase = getSupabase();
  let pushed = 0;

  for (;;) {
    const batch = await repo.getOutboxBatch(BATCH_SIZE);
    if (batch.length === 0) break;

    try {
      await sendBatch(supabase, batch, userId);
    } catch (e) {
      const error = (e ?? {}) as SupabaseError;
      await repo.bumpAttempts(batch.map((o) => o.seq!));
      return {
        status: 'error',
        error: error.message ?? 'Sync failed.',
        retryable: !isAuthError(error),
      };
    }

    await db.transaction('rw', db.habits, db.checkins, db.outbox, async () => {
      await repo.markSynced(batch);
      await repo.deleteOutboxRows(batch.map((o) => o.seq!));
    });
    pushed += batch.length;
  }

  return pushed ? { status: 'pushed', ops: pushed } : { status: 'idle' };
}
