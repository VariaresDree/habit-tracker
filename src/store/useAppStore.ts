import { create } from 'zustand';
import type { Checkin, Habit, NewHabitDraft } from '../db/db';
import * as repo from '../db/repo';
import { todayKey } from '../lib/dates';

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

  hydrate: async () => {
    const [habits, rows, notificationsEnabled, theme] = await Promise.all([
      repo.getActiveHabits(),
      repo.getCheckinsForDate(get().selectedDate),
      repo.getSetting<boolean>('notificationsEnabled'),
      repo.getSetting<Theme>('theme'),
    ]);
    set({
      habits,
      checkins: toValueMap(rows),
      notificationsEnabled: notificationsEnabled === true,
      theme: theme ?? 'system',
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
}));
