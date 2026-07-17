import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { db } from '../../db/db';
import * as repo from '../../db/repo';
import { todayKey } from '../../lib/dates';
import { useAppStore } from '../../store/useAppStore';
import HabitFormScreen from './HabitFormScreen';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>TODAY_SCREEN</div>} />
        <Route path="/new" element={<HabitFormScreen />} />
        <Route path="/habit/:id/edit" element={<HabitFormScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  useAppStore.setState({ status: 'loading', habits: [], selectedDate: todayKey(), checkins: {} });
  await useAppStore.getState().hydrate();
});

describe('creating', () => {
  test('creates a countable habit and navigates back to the check-in screen', async () => {
    const user = userEvent.setup();
    renderAt('/new');

    await user.type(screen.getByLabelText(/name/i), 'Water');
    await user.click(screen.getByRole('radio', { name: /countable/i }));

    const target = screen.getByLabelText(/daily target/i);
    await user.clear(target);
    await user.type(target, '8');
    await user.type(screen.getByLabelText(/unit/i), 'glasses');

    await user.click(screen.getByRole('button', { name: /create habit/i }));
    expect(await screen.findByText('TODAY_SCREEN')).toBeInTheDocument();

    const habits = await repo.getActiveHabits();
    expect(habits).toHaveLength(1);
    expect(habits[0]).toMatchObject({ name: 'Water', type: 'count', target: 8, unit: 'glasses' });
    expect(useAppStore.getState().habits.map((h) => h.name)).toEqual(['Water']);
  });

  test('binary habits hide target and unit fields and save with target 1', async () => {
    const user = userEvent.setup();
    renderAt('/new');

    expect(screen.queryByLabelText(/daily target/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/unit/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/name/i), 'Meditate');
    await user.click(screen.getByRole('button', { name: /create habit/i }));
    await screen.findByText('TODAY_SCREEN');

    expect((await repo.getActiveHabits())[0]).toMatchObject({
      name: 'Meditate',
      type: 'binary',
      target: 1,
    });
  });

  test('submit is disabled while the name is empty', () => {
    renderAt('/new');
    expect(screen.getByRole('button', { name: /create habit/i })).toBeDisabled();
  });
});

describe('editing', () => {
  test('loads existing values, locks the type, and saves changes', async () => {
    const user = userEvent.setup();
    const id = await useAppStore.getState().addHabit({
      name: 'Meditate',
      emoji: '🧘',
      color: '#3b82f6',
      type: 'binary',
      target: 1,
      reminderTime: null,
    });
    renderAt(`/habit/${id}/edit`);

    const name = screen.getByLabelText(/name/i);
    expect(name).toHaveValue('Meditate');
    expect(screen.getByRole('radio', { name: /yes \/ no/i })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /countable/i })).toBeDisabled();

    await user.clear(name);
    await user.type(name, 'Meditate AM');
    await user.click(screen.getByRole('button', { name: /save/i }));
    await screen.findByText('TODAY_SCREEN');

    expect((await repo.getHabit(id))?.name).toBe('Meditate AM');
  });

  test('unknown habit id shows a not-found message', () => {
    renderAt('/habit/999/edit');
    expect(screen.getByText(/not found/i)).toBeInTheDocument();
  });
});
