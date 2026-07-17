import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type { Habit } from '../../db/db';
import { addDays, todayKey } from '../../lib/dates';
import StatsPanel from './StatsPanel';

const today = todayKey();

const habit = (overrides: Partial<Habit> = {}): Habit => ({
  id: 1,
  name: 'Water',
  emoji: '💧',
  color: '#10b981',
  type: 'binary',
  target: 1,
  reminderTime: null,
  sortOrder: 1,
  createdAt: new Date().toISOString(),
  archivedAt: null,
  ...overrides,
});

describe('StatsPanel', () => {
  test('shows hand-computed 30 and 90 day completion rates', () => {
    // T-1..T-6 complete: 6/30 = 20%, 6/90 ≈ 7%.
    const history = Array.from({ length: 6 }, (_, i) => ({
      date: addDays(today, -(i + 1)),
      value: 1,
    }));
    render(<StatsPanel history={history} habit={habit()} />);

    const last30 = screen.getByLabelText('Last 30 days');
    expect(last30).toHaveTextContent('20%');
    expect(last30).toHaveTextContent('6 / 30 days');

    const last90 = screen.getByLabelText('Last 90 days');
    expect(last90).toHaveTextContent('7%');
    expect(last90).toHaveTextContent('6 / 90 days');
  });

  test('partial countable days are not completed but still add to totals', () => {
    // Target 8: one full day (8) + one partial (5) -> 1 completed, 13 units.
    const history = [
      { date: addDays(today, -1), value: 8 },
      { date: addDays(today, -2), value: 5 },
    ];
    render(
      <StatsPanel history={history} habit={habit({ type: 'count', target: 8, unit: 'glasses' })} />,
    );

    const last30 = screen.getByLabelText('Last 30 days');
    expect(last30).toHaveTextContent('1 / 30 days');
    expect(last30).toHaveTextContent('13 glasses total');
  });

  test('brand-new habit shows 0%', () => {
    render(<StatsPanel history={[]} habit={habit()} />);
    expect(screen.getByLabelText('Last 30 days')).toHaveTextContent('0%');
    expect(screen.getByLabelText('Last 90 days')).toHaveTextContent('0%');
  });
});
