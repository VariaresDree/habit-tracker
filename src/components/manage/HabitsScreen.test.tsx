import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { db, type NewHabitDraft } from '../../db/db';
import * as repo from '../../db/repo';
import { todayKey } from '../../lib/dates';
import { useAppStore } from '../../store/useAppStore';
import HabitsScreen from './HabitsScreen';

const draft = (name: string): NewHabitDraft => ({
  name,
  emoji: '💧',
  color: '#10b981',
  type: 'binary',
  target: 1,
  reminderTime: null,
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <HabitsScreen />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  useAppStore.setState({
    status: 'ready',
    habits: [],
    selectedDate: todayKey(),
    checkins: {},
    user: null,
    authStatus: 'signed-out',
  });
  await useAppStore.getState().hydrate();
});

describe('active habits', () => {
  test('lists habits with a way into each one', async () => {
    const id = await useAppStore.getState().addHabit(draft('Meditate'));
    renderScreen();

    expect(screen.getByText('Meditate')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view meditate/i })).toHaveAttribute(
      'href',
      `/habit/${id}`,
    );
  });

  test('moves a habit up and persists the new order', async () => {
    const user = userEvent.setup();
    const idA = await useAppStore.getState().addHabit(draft('First'));
    const idB = await useAppStore.getState().addHabit(draft('Second'));
    renderScreen();

    await user.click(screen.getByRole('button', { name: /move second up/i }));

    await waitFor(() => expect(useAppStore.getState().habits.map((h) => h.id)).toEqual([idB, idA]));
    expect((await repo.getActiveHabits()).map((h) => h.id)).toEqual([idB, idA]);
  });

  test('the ends of the list cannot move past themselves', async () => {
    await useAppStore.getState().addHabit(draft('First'));
    await useAppStore.getState().addHabit(draft('Second'));
    renderScreen();

    expect(screen.getByRole('button', { name: /move first up/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /move second down/i })).toBeDisabled();
  });

  test('offers a way to add the first habit when empty', () => {
    renderScreen();
    expect(screen.getByText(/no habits yet/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /add habit|add your first habit/i }).length).toBeGreaterThan(0);
  });
});

describe('archived habits', () => {
  test('says plainly when nothing is archived', async () => {
    renderScreen();
    expect(await screen.findByText(/no archived habits/i)).toBeInTheDocument();
  });

  test('restores an archived habit to the active list', async () => {
    const user = userEvent.setup();
    const id = await useAppStore.getState().addHabit(draft('Meditate'));
    await useAppStore.getState().archiveHabit(id);
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /unarchive meditate/i }));

    await waitFor(() => expect(useAppStore.getState().habits.map((h) => h.id)).toEqual([id]));
    expect((await repo.getHabit(id))?.archivedAt).toBeNull();
  });

  test('deletes an archived habit and its history after confirmation', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const id = await useAppStore.getState().addHabit(draft('Meditate'));
    await useAppStore.getState().toggleCheckin(id);
    await useAppStore.getState().archiveHabit(id);
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /delete meditate/i }));

    expect(confirmSpy).toHaveBeenCalledOnce();
    await waitFor(async () => expect(await repo.getHabit(id)).toBeUndefined());
    expect(await repo.getCheckinsForHabit(id, '2000-01-01')).toEqual([]);
    confirmSpy.mockRestore();
  });
});
