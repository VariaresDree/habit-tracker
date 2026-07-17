import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { db, type NewHabitDraft } from '../../db/db';
import * as repo from '../../db/repo';
import { addDays, todayKey } from '../../lib/dates';
import { useAppStore } from '../../store/useAppStore';
import HabitDetailScreen from './HabitDetailScreen';

const today = todayKey();

const draft = (name: string, overrides: Partial<NewHabitDraft> = {}): NewHabitDraft => ({
  name,
  emoji: '🧘',
  color: '#3b82f6',
  type: 'binary',
  target: 1,
  reminderTime: null,
  ...overrides,
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>TODAY_SCREEN</div>} />
        <Route path="/habit/:id" element={<HabitDetailScreen />} />
        <Route path="/habit/:id/edit" element={<div>EDIT_SCREEN</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  useAppStore.setState({ status: 'loading', habits: [], selectedDate: today, checkins: {} });
  await useAppStore.getState().hydrate();
});

describe('HabitDetailScreen', () => {
  test('composes streaks, heatmap, and stats from seeded history', async () => {
    const id = await useAppStore.getState().addHabit(draft('Meditate'));
    await repo.putCheckin({ habitId: id, date: addDays(today, -1), value: 1 });
    await repo.putCheckin({ habitId: id, date: addDays(today, -2), value: 1 });
    renderAt(`/habit/${id}`);

    expect(screen.getByRole('heading', { name: /meditate/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/current streak/i)).toHaveTextContent('2'));
    expect(screen.getByLabelText(/best streak/i)).toHaveTextContent('2');
    expect(screen.getByLabelText('Last 30 days')).toHaveTextContent('2 / 30 days');

    const heatmap = screen.getByRole('img', { name: /weeks of check-ins/i });
    expect(heatmap.querySelector(`[data-date="${addDays(today, -1)}"]`)).toHaveAttribute(
      'data-level',
      '3',
    );
    expect(heatmap.querySelector(`[data-date="${today}"]`)).toHaveAttribute('data-level', '0');
  });

  test('brand-new habit renders zeros without errors', async () => {
    const id = await useAppStore.getState().addHabit(draft('Fresh'));
    renderAt(`/habit/${id}`);

    await waitFor(() => expect(screen.getByLabelText(/current streak/i)).toHaveTextContent('0'));
    expect(screen.getByLabelText('Last 90 days')).toHaveTextContent('0%');
  });

  test('checking in elsewhere live-updates an open detail screen', async () => {
    const id = await useAppStore.getState().addHabit(draft('Meditate'));
    await repo.putCheckin({ habitId: id, date: addDays(today, -1), value: 1 });
    renderAt(`/habit/${id}`);
    await waitFor(() => expect(screen.getByLabelText(/current streak/i)).toHaveTextContent('1'));

    await act(() => useAppStore.getState().toggleCheckin(id));

    await waitFor(() => expect(screen.getByLabelText(/current streak/i)).toHaveTextContent('2'));
  });

  test('archive button archives and navigates home', async () => {
    const user = userEvent.setup();
    const id = await useAppStore.getState().addHabit(draft('Meditate'));
    renderAt(`/habit/${id}`);

    await user.click(screen.getByRole('button', { name: /archive/i }));

    expect(await screen.findByText('TODAY_SCREEN')).toBeInTheDocument();
    expect((await repo.getHabit(id))?.archivedAt).toBeTruthy();
  });

  test('delete asks for confirmation then removes habit and history', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const id = await useAppStore.getState().addHabit(draft('Meditate'));
    await useAppStore.getState().toggleCheckin(id);
    renderAt(`/habit/${id}`);

    await user.click(screen.getByRole('button', { name: /delete/i }));

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(await screen.findByText('TODAY_SCREEN')).toBeInTheDocument();
    expect(await repo.getHabit(id)).toBeUndefined();
    expect(await repo.getCheckinsForHabit(id, '2000-01-01')).toEqual([]);
    confirmSpy.mockRestore();
  });

  test('unknown habit id shows not found', () => {
    renderAt('/habit/999');
    expect(screen.getByText(/not found/i)).toBeInTheDocument();
  });
});
