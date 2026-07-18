import { create } from 'zustand';
import type { Checkin, Habit, NewHabitDraft } from '../db/db';
import * as repo from '../db/repo';
import { todayKey } from '../lib/dates';

// Offline-first guardrail: every action awaits its repo (Dexie) write
// before touching in-memory state.
interface AppState {
  status: 'loading' | 'ready';
  habits: Habit[];
  selectedDate: string;
  checkins: Record<number, number>;
  notificationsEnabled: boolean;

  hydrate: () => Promise<void>;
  setSelectedDate: (date: string) => Promise<void>;
  addHabit: (draft: NewHabitDraft) => Promise<number>;
  updateHabit: (id: number, patch: Partial<Habit>) => Promise<void>;
  archiveHabit: (id: number) => Promise<void>;
  unarchiveHabit: (id: number) => Promise<void>;
  deleteHabit: (id: number) => Promise<void>;
  reorderHabits: (idsInOrder: number[]) => Promise<void>;
  toggleCheckin: (habitId: number) => Promise<void>;
  setCheckinValue: (habitId: number, value: number) => Promise<void>;
  setNotificationsEnabled: (enabled: boolean) => Promise<void>;
}

function toValueMap(rows: Checkin[]): Record<number, number> {
  const map: Record<number, number> = {};
  for (const row of rows) map[row.habitId] = row.value;
  return map;
}

export const useAppStore = create<AppState>((set, get) => ({
  status: 'loading',
  habits: [],
  selectedDate: todayKey(),
  checkins: {},
  notificationsEnabled: false,

  hydrate: async () => {
    const [habits, rows, notificationsEnabled] = await Promise.all([
      repo.getActiveHabits(),
      repo.getCheckinsForDate(get().selectedDate),
      repo.getSetting<boolean>('notificationsEnabled'),
    ]);
    set({
      habits,
      checkins: toValueMap(rows),
      notificationsEnabled: notificationsEnabled === true,
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
    const { selectedDate, checkins } = get();
    const value = (checkins[habitId] ?? 0) >= 1 ? 0 : 1;
    await repo.putCheckin({ habitId, date: selectedDate, value });
    set({ checkins: { ...get().checkins, [habitId]: value } });
  },

  setCheckinValue: async (habitId, value) => {
    const clamped = Math.max(0, value);
    await repo.putCheckin({ habitId, date: get().selectedDate, value: clamped });
    set({ checkins: { ...get().checkins, [habitId]: clamped } });
  },

  setNotificationsEnabled: async (enabled) => {
    await repo.putSetting('notificationsEnabled', enabled);
    set({ notificationsEnabled: enabled });
  },
}));
