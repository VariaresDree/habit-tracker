import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { db, type NewHabitDraft } from '../../db/db';
import * as repo from '../../db/repo';
import { addDays, todayKey } from '../../lib/dates';
import { useAppStore } from '../../store/useAppStore';
import CheckinScreen from './CheckinScreen';

const today = todayKey();
const yesterday = addDays(today, -1);

const draft = (name: string, overrides: Partial<NewHabitDraft> = {}): NewHabitDraft => ({
  name,
  emoji: '💧',
  color: '#10b981',
  type: 'binary',
  target: 1,
  reminderTime: null,
  ...overrides,
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <CheckinScreen />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  useAppStore.setState({ status: 'loading', habits: [], selectedDate: today, checkins: {} });
  await useAppStore.getState().hydrate();
});

describe('empty state', () => {
  test('shows a friendly message and a link to create the first habit', () => {
    renderScreen();
    expect(screen.getByText(/no habits yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /add your first habit/i })).toBeInTheDocument();
  });
});

describe('binary habits', () => {
  test('one tap on the row toggles done, persisted to Dexie; second tap untoggles', async () => {
    const user = userEvent.setup();
    const id = await useAppStore.getState().addHabit(draft('Meditate'));
    renderScreen();

    const row = screen.getByRole('button', { name: /meditate/i });
    expect(row).toHaveAttribute('aria-pressed', 'false');

    // The tap handler persists asynchronously (write-through to Dexie before
    // memory), so attribute checks must retry rather than assert once.
    await user.click(row);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /meditate/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    expect((await repo.getCheckinsForDate(today))[0]).toMatchObject({ habitId: id, value: 1 });

    await user.click(screen.getByRole('button', { name: /meditate/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /meditate/i })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    );
    expect((await repo.getCheckinsForDate(today))[0]).toMatchObject({ habitId: id, value: 0 });
  });
});

describe('countable habits', () => {
  test('stepper increments past the target and decrements, persisted to Dexie', async () => {
    const user = userEvent.setup();
    const id = await useAppStore
      .getState()
      .addHabit(draft('Water', { type: 'count', target: 3, unit: 'glasses' }));
    renderScreen();

    expect(screen.getByText('0 / 3 glasses')).toBeInTheDocument();

    const plus = screen.getByRole('button', { name: /increase water/i });
    await user.click(plus);
    await user.click(plus);
    await user.click(plus);
    await user.click(plus);
    expect(await screen.findByText('4 / 3 glasses')).toBeInTheDocument();
    expect((await repo.getCheckinsForDate(today))[0]).toMatchObject({ habitId: id, value: 4 });

    await user.click(screen.getByRole('button', { name: /decrease water/i }));
    expect(await screen.findByText('3 / 3 glasses')).toBeInTheDocument();
  });
});

describe('detail link', () => {
  test('each row links to the habit detail screen', async () => {
    const id = await useAppStore.getState().addHabit(draft('Meditate'));
    renderScreen();
    expect(screen.getByRole('link', { name: /view meditate/i })).toHaveAttribute(
      'href',
      `/habit/${id}`,
    );
  });
});

// Reordering now lives on the Habits screen — see HabitsScreen.test.tsx.
// Today stays focused on "what do I do now".

describe('daily progress', () => {
  test('summarises the day above the list and updates as habits are completed', async () => {
    const user = userEvent.setup();
    await useAppStore.getState().addHabit(draft('Meditate'));
    await useAppStore.getState().addHabit(draft('Stretch'));
    renderScreen();

    expect(screen.getByText('0 of 2 done')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /meditate/i }));

    expect(await screen.findByText('1 of 2 done')).toBeInTheDocument();
  });

  test('is not shown when there is nothing to track', () => {
    renderScreen();
    expect(screen.queryByText(/of 0 done/i)).not.toBeInTheDocument();
  });
});

describe('date navigation', () => {
  test('previous day allows backfill check-in for yesterday', async () => {
    const user = userEvent.setup();
    await useAppStore.getState().addHabit(draft('Meditate'));
    renderScreen();

    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /previous day/i }));
    expect(await screen.findByRole('heading', { name: 'Yesterday' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /meditate/i }));
    await waitFor(async () =>
      expect((await repo.getCheckinsForDate(yesterday))[0]).toMatchObject({ value: 1 }),
    );
    expect(await repo.getCheckinsForDate(today)).toEqual([]);
  });

  test('cannot navigate into the future', () => {
    renderScreen();
    expect(screen.getByRole('button', { name: /next day/i })).toBeDisabled();
  });
});
