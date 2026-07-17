import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { addDays, todayKey } from '../../lib/dates';
import StreakBadge from './StreakBadge';

const today = todayKey();
const day = (offset: number, value = 1) => ({ date: addDays(today, offset), value });

describe('StreakBadge', () => {
  test('shows hand-computed current and best streaks', () => {
    // T-1..T-3 done (current: 3, today unfinished doesn't break it),
    // gap at T-4, then T-5..T-9 done (best: 5).
    const history = [
      day(-1), day(-2), day(-3),
      day(-5), day(-6), day(-7), day(-8), day(-9),
    ];
    render(<StreakBadge history={history} target={1} />);

    expect(screen.getByLabelText(/current streak/i)).toHaveTextContent('3');
    expect(screen.getByLabelText(/best streak/i)).toHaveTextContent('5');
  });

  test('brand-new habit shows zeros', () => {
    render(<StreakBadge history={[]} target={1} />);
    expect(screen.getByLabelText(/current streak/i)).toHaveTextContent('0');
    expect(screen.getByLabelText(/best streak/i)).toHaveTextContent('0');
  });
});
