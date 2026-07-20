import { beforeEach, describe, expect, test, vi } from 'vitest';
import { db, type NewHabitDraft } from '../db/db';
import * as repo from '../db/repo';
import { todayKey } from '../lib/dates';
import { useAppStore } from './useAppStore';

const USER = { id: '9c72b791-db17-4908-af81-05264f0fa076', email: 'me@example.com' };
const OTHER_USER_ID = '11111111-2222-4333-8444-555555555555';

const m = vi.hoisted(() => ({
  sendCode: vi.fn(async () => {}),
  verifyCode: vi.fn(async () => ({ id: '9c72b791-db17-4908-af81-05264f0fa076', email: 'me@example.com' })),
  signOut: vi.fn(async () => {}),
  getCurrentUser: vi.fn(async () => null as { id: string; email: string } | null),
  pushOutbox: vi.fn(
    async (): Promise<{
      status: 'idle' | 'pushed' | 'error';
      ops?: number;
      error?: string;
      retryable?: boolean;
    }> => ({ status: 'pushed', ops: 1 }),
  ),
}));

vi.mock('../sync/auth', () => ({
  sendCode: m.sendCode,
  verifyCode: m.verifyCode,
  signOut: m.signOut,
  getCurrentUser: m.getCurrentUser,
}));
vi.mock('../sync/push', () => ({ pushOutbox: m.pushOutbox }));

const draft = (name: string): NewHabitDraft => ({
  name,
  emoji: '💧',
  color: '#10b981',
  type: 'binary',
  target: 1,
  reminderTime: null,
});

beforeEach(async () => {
  vi.clearAllMocks();
  m.getCurrentUser.mockResolvedValue(null);
  m.pushOutbox.mockResolvedValue({ status: 'pushed', ops: 1 });
  await db.delete();
  await db.open();
  useAppStore.setState({
    status: 'loading',
    habits: [],
    selectedDate: todayKey(),
    checkins: {},
    notificationsEnabled: false,
    theme: 'system',
    user: null,
    authStatus: 'signed-out',
    syncState: 'idle',
    syncError: null,
    pendingOps: 0,
  });
});

describe('sign-in', () => {
  test('signIn requests a code and waits for it', async () => {
    await useAppStore.getState().signIn('me@example.com');

    expect(m.sendCode).toHaveBeenCalledWith('me@example.com');
    expect(useAppStore.getState().authStatus).toBe('code-sent');
    expect(useAppStore.getState().user).toBeNull();
  });

  test('verifyCode signs in, claims local data, and uploads it', async () => {
    await useAppStore.getState().hydrate();
    const id = await useAppStore.getState().addHabit(draft('Meditate'));

    await useAppStore.getState().verifyCode('me@example.com', '123456');

    const state = useAppStore.getState();
    expect(state.user).toEqual(USER);
    expect(state.authStatus).toBe('signed-in');
    // the anonymous habit is now owned and was queued for upload
    expect((await db.habits.get(id))?.userId).toBe(USER.id);
    expect(m.pushOutbox).toHaveBeenCalledWith(USER.id);
  });

  test('refuses a different account when this device already holds data', async () => {
    await useAppStore.getState().hydrate();
    await useAppStore.getState().addHabit(draft('Meditate'));
    await repo.claimLocalDataForUser(OTHER_USER_ID);

    await expect(
      useAppStore.getState().verifyCode('me@example.com', '123456'),
    ).rejects.toThrow(/different account/i);

    expect(useAppStore.getState().user).toBeNull();
    expect(m.signOut).toHaveBeenCalled();
    // the other account's data is left exactly as it was
    expect((await repo.getActiveHabits())[0].userId).toBe(OTHER_USER_ID);
  });

  test('hydrate restores a persisted session', async () => {
    m.getCurrentUser.mockResolvedValue(USER);

    await useAppStore.getState().hydrate();

    expect(useAppStore.getState().user).toEqual(USER);
    expect(useAppStore.getState().authStatus).toBe('signed-in');
  });
});

describe('sign-out', () => {
  test('clears the session but keeps every local row', async () => {
    await useAppStore.getState().hydrate();
    const id = await useAppStore.getState().addHabit(draft('Meditate'));
    await useAppStore.getState().verifyCode('me@example.com', '123456');

    await useAppStore.getState().signOut();

    const state = useAppStore.getState();
    expect(state.user).toBeNull();
    expect(state.authStatus).toBe('signed-out');
    expect(state.habits.map((h) => h.id)).toEqual([id]);
    expect(await db.habits.count()).toBe(1);
  });
});

describe('syncNow', () => {
  test('does nothing while signed out', async () => {
    await useAppStore.getState().syncNow();
    expect(m.pushOutbox).not.toHaveBeenCalled();
    expect(useAppStore.getState().syncState).toBe('idle');
  });

  test('reports the pending op count after a successful push', async () => {
    await useAppStore.getState().hydrate();
    await useAppStore.getState().addHabit(draft('Meditate'));
    await useAppStore.getState().verifyCode('me@example.com', '123456');
    m.pushOutbox.mockClear();

    await useAppStore.getState().syncNow();

    expect(m.pushOutbox).toHaveBeenCalledOnce();
    expect(useAppStore.getState().syncState).toBe('idle');
    expect(useAppStore.getState().syncError).toBeNull();
  });

  test('surfaces a push failure without losing the queued work', async () => {
    await useAppStore.getState().hydrate();
    await useAppStore.getState().addHabit(draft('Meditate'));
    await useAppStore.getState().verifyCode('me@example.com', '123456');
    m.pushOutbox.mockResolvedValue({ status: 'error', error: 'network down', retryable: true });

    await useAppStore.getState().syncNow();

    expect(useAppStore.getState().syncState).toBe('error');
    expect(useAppStore.getState().syncError).toMatch(/network down/i);
    expect(await repo.countPendingOps()).toBeGreaterThan(0);
  });
});
