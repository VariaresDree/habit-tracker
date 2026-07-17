import { beforeEach, describe, expect, test, vi } from 'vitest';
import { db, type NewHabitDraft } from '../db/db';
import * as repo from '../db/repo';
import { addDays, todayKey } from '../lib/dates';
import { useAppStore } from './useAppStore';

// Spy mode keeps the real repo implementations while letting single tests
// override one call to control write timing.
vi.mock('../db/repo', { spy: true });

const draft = (name: string, overrides: Partial<NewHabitDraft> = {}): NewHabitDraft => ({
  name,
  emoji: '💧',
  color: '#10b981',
  type: 'binary',
  target: 1,
  reminderTime: null,
  ...overrides,
});

const today = todayKey();
const yesterday = addDays(today, -1);

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete();
  await db.open();
  useAppStore.setState({
    status: 'loading',
    habits: [],
    selectedDate: today,
    checkins: {},
  });
});

describe('hydrate', () => {
  test('loads active habits and the selected date check-ins, then flips to ready', async () => {
    const id = await repo.createHabit(draft('Drink water'));
    await repo.putCheckin({ habitId: id, date: today, value: 1 });

    await useAppStore.getState().hydrate();

    const state = useAppStore.getState();
    expect(state.status).toBe('ready');
    expect(state.habits.map((h) => h.name)).toEqual(['Drink water']);
    expect(state.checkins).toEqual({ [id]: 1 });
  });
});

describe('addHabit', () => {
  test('persists to Dexie and appears in state with an assigned sortOrder', async () => {
    await useAppStore.getState().hydrate();
    const id = await useAppStore.getState().addHabit(draft('Read'));

    expect(useAppStore.getState().habits.map((h) => h.id)).toEqual([id]);
    expect((await repo.getActiveHabits()).map((h) => h.id)).toEqual([id]);
  });
});

describe('toggleCheckin', () => {
  test('toggles a binary habit on and off, in memory and in Dexie', async () => {
    await useAppStore.getState().hydrate();
    const id = await useAppStore.getState().addHabit(draft('Drink water'));

    await useAppStore.getState().toggleCheckin(id);
    expect(useAppStore.getState().checkins[id]).toBe(1);
    expect((await repo.getCheckinsForDate(today))[0].value).toBe(1);

    await useAppStore.getState().toggleCheckin(id);
    expect(useAppStore.getState().checkins[id]).toBe(0);
    expect((await repo.getCheckinsForDate(today))[0].value).toBe(0);
  });

  test('does not update memory before the Dexie write resolves (offline-first order)', async () => {
    await useAppStore.getState().hydrate();
    const id = await useAppStore.getState().addHabit(draft('Drink water'));

    let resolveWrite!: () => void;
    vi.mocked(repo.putCheckin).mockImplementationOnce(
      () => new Promise<void>((resolve) => (resolveWrite = resolve)),
    );

    const pending = useAppStore.getState().toggleCheckin(id);
    await Promise.resolve(); // give the action a chance to (incorrectly) update early
    expect(useAppStore.getState().checkins[id]).toBeUndefined();

    resolveWrite();
    await pending;
    expect(useAppStore.getState().checkins[id]).toBe(1);
  });
});

describe('setCheckinValue', () => {
  test('sets a countable value and clamps negatives to zero', async () => {
    await useAppStore.getState().hydrate();
    const id = await useAppStore
      .getState()
      .addHabit(draft('Water', { type: 'count', target: 8, unit: 'glasses' }));

    await useAppStore.getState().setCheckinValue(id, 5);
    expect(useAppStore.getState().checkins[id]).toBe(5);

    await useAppStore.getState().setCheckinValue(id, -3);
    expect(useAppStore.getState().checkins[id]).toBe(0);
  });
});

describe('setSelectedDate', () => {
  test('switches the date and loads that date check-ins (backfill)', async () => {
    await useAppStore.getState().hydrate();
    const id = await useAppStore.getState().addHabit(draft('Drink water'));
    await repo.putCheckin({ habitId: id, date: yesterday, value: 1 });

    await useAppStore.getState().setSelectedDate(yesterday);

    const state = useAppStore.getState();
    expect(state.selectedDate).toBe(yesterday);
    expect(state.checkins).toEqual({ [id]: 1 });
  });
});

describe('archive and delete', () => {
  test('archiveHabit removes from state but keeps the Dexie row', async () => {
    await useAppStore.getState().hydrate();
    const id = await useAppStore.getState().addHabit(draft('Drink water'));

    await useAppStore.getState().archiveHabit(id);

    expect(useAppStore.getState().habits).toEqual([]);
    expect((await repo.getHabit(id))?.archivedAt).toBeTruthy();
  });

  test('deleteHabit removes habit and its check-ins everywhere', async () => {
    await useAppStore.getState().hydrate();
    const id = await useAppStore.getState().addHabit(draft('Drink water'));
    await useAppStore.getState().toggleCheckin(id);

    await useAppStore.getState().deleteHabit(id);

    expect(useAppStore.getState().habits).toEqual([]);
    expect(useAppStore.getState().checkins[id]).toBeUndefined();
    expect(await repo.getHabit(id)).toBeUndefined();
    expect(await repo.getCheckinsForHabit(id, '2000-01-01')).toEqual([]);
  });
});

describe('reorderHabits', () => {
  test('persists the new order so re-hydration returns it', async () => {
    await useAppStore.getState().hydrate();
    const idA = await useAppStore.getState().addHabit(draft('A'));
    const idB = await useAppStore.getState().addHabit(draft('B'));

    await useAppStore.getState().reorderHabits([idB, idA]);
    expect(useAppStore.getState().habits.map((h) => h.id)).toEqual([idB, idA]);

    // persistence proof: wipe memory, hydrate fresh
    useAppStore.setState({ status: 'loading', habits: [], checkins: {}, selectedDate: today });
    await useAppStore.getState().hydrate();
    expect(useAppStore.getState().habits.map((h) => h.id)).toEqual([idB, idA]);
  });
});
