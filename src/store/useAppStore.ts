import { create } from 'zustand';
import type { Checkin, Habit, NewHabitDraft } from '../db/db';
import * as repo from '../db/repo';
import { todayKey } from '../lib/dates';
import * as auth from '../sync/auth';
import type { SyncUser } from '../sync/auth';
import { pushOutbox } from '../sync/push';

// Offline-first guardrail: every action awaits its repo (Dexie) write
// before touching in-memory state.
export type Theme = 'system' | 'light' | 'dark';

interface AppState {
  status: 'loading' | 'ready';
  habits: Habit[];
  selectedDate: string;
  checkins: Record<string, number>;
  notificationsEnabled: boolean;
  theme: Theme;
  user: SyncUser | null;
  authStatus: 'signed-out' | 'code-sent' | 'signed-in';
  syncState: 'idle' | 'syncing' | 'error' | 'offline';
  syncError: string | null;
  pendingOps: number;

  hydrate: () => Promise<void>;
  setSelectedDate: (date: string) => Promise<void>;
  addHabit: (draft: NewHabitDraft) => Promise<string>;
  updateHabit: (id: string, patch: Partial<Habit>) => Promise<void>;
  archiveHabit: (id: string) => Promise<void>;
  unarchiveHabit: (id: string) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  reorderHabits: (idsInOrder: string[]) => Promise<void>;
  toggleCheckin: (habitId: string) => Promise<void>;
  setCheckinValue: (habitId: string, value: number) => Promise<void>;
  setNotificationsEnabled: (enabled: boolean) => Promise<void>;
  setTheme: (theme: Theme) => Promise<void>;
  signIn: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
}

function toValueMap(rows: Checkin[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows) map[row.habitId] = row.value;
  return map;
}

export const useAppStore = create<AppState>((set, get) => ({
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

  hydrate: async () => {
    const [habits, rows, notificationsEnabled, theme, user, pendingOps] = await Promise.all([
      repo.getActiveHabits(),
      repo.getCheckinsForDate(get().selectedDate),
      repo.getSetting<boolean>('notificationsEnabled'),
      repo.getSetting<Theme>('theme'),
      auth.getCurrentUser(),
      repo.countPendingOps(),
    ]);
    set({
      habits,
      checkins: toValueMap(rows),
      notificationsEnabled: notificationsEnabled === true,
      theme: theme ?? 'system',
      user,
      authStatus: user ? 'signed-in' : 'signed-out',
      pendingOps,
      status: 'ready',
    });
  },

  setSelectedDate: async (date) => {
    const rows = await repo.getCheckinsForDate(date);
    set({ selectedDate: date, checkins: toValueMap(rows) });
  },

  addHabit: async (draft) => {
    const id = await repo.createHabit(draft);
    const habits = await repo.getActiveHabits();
    set({ habits });
    return id;
  },

  updateHabit: async (id, patch) => {
    await repo.updateHabit(id, patch);
    set({ habits: get().habits.map((h) => (h.id === id ? { ...h, ...patch } : h)) });
  },

  archiveHabit: async (id) => {
    await repo.archiveHabit(id);
    set({ habits: get().habits.filter((h) => h.id !== id) });
  },

  unarchiveHabit: async (id) => {
    await repo.updateHabit(id, { archivedAt: null });
    const habits = await repo.getActiveHabits();
    set({ habits });
  },

  deleteHabit: async (id) => {
    await repo.deleteHabitAndCheckins(id);
    const checkins = { ...get().checkins };
    delete checkins[id];
    set({ habits: get().habits.filter((h) => h.id !== id), checkins });
  },

  reorderHabits: async (idsInOrder) => {
    await Promise.all(
      idsInOrder.map((id, index) => repo.updateHabit(id, { sortOrder: index + 1 })),
    );
    const habits = await repo.getActiveHabits();
    set({ habits });
  },

  toggleCheckin: async (habitId) => {
    const { selectedDate, checkins, habits } = get();
    const target = habits.find((h) => h.id === habitId)?.target ?? 1;
    const value = (checkins[habitId] ?? 0) >= 1 ? 0 : 1;
    await repo.putCheckin({ habitId, date: selectedDate, value }, target);
    set({ checkins: { ...get().checkins, [habitId]: value } });
  },

  setCheckinValue: async (habitId, value) => {
    const { selectedDate, habits } = get();
    const target = habits.find((h) => h.id === habitId)?.target ?? 1;
    const clamped = Math.max(0, value);
    await repo.putCheckin({ habitId, date: selectedDate, value: clamped }, target);
    set({ checkins: { ...get().checkins, [habitId]: clamped } });
  },

  setNotificationsEnabled: async (enabled) => {
    await repo.putSetting('notificationsEnabled', enabled);
    set({ notificationsEnabled: enabled });
  },

  setTheme: async (theme) => {
    await repo.putSetting('theme', theme);
    set({ theme });
  },

  signIn: async (email) => {
    await auth.sendCode(email);
    set({ authStatus: 'code-sent', syncError: null });
  },

  verifyCode: async (email, code) => {
    const user = await auth.verifyCode(email, code);
    const owner = await repo.getLocalOwnerId();
    if (owner && owner !== user.id) {
      // Single active account per device: merging two accounts' rows would be
      // unrecoverable, so refuse rather than guess.
      await auth.signOut();
      throw new Error(
        'This device already holds data for a different account. Export that data first, then reset the app before signing in here.',
      );
    }
    await repo.claimLocalDataForUser(user.id);
    set({ user, authStatus: 'signed-in', syncError: null });
    await get().syncNow();
  },

  signOut: async () => {
    // Local data stays: the app keeps working signed-out exactly as before.
    await auth.signOut();
    set({ user: null, authStatus: 'signed-out', syncState: 'idle', syncError: null });
  },

  syncNow: async () => {
    const { user, syncState } = get();
    if (!user || syncState === 'syncing') return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      set({ syncState: 'offline' });
      return;
    }

    set({ syncState: 'syncing', syncError: null });
    // Idempotent: also picks up rows an import left pending with nothing queued.
    await repo.claimLocalDataForUser(user.id);
    const result = await pushOutbox(user.id);
    const pendingOps = await repo.countPendingOps();
    set({
      syncState: result.status === 'error' ? 'error' : 'idle',
      syncError: result.status === 'error' ? (result.error ?? 'Sync failed.') : null,
      pendingOps,
    });
  },
}));
