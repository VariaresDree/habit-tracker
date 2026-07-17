import { describe, expect, test } from 'vitest';
import { bestStreak, completionRate, currentStreak, totalUnits } from './streaks';

const day = (date: string, value: number) => ({ date, value });

describe('currentStreak', () => {
  test('counts consecutive completed days ending today', () => {
    const days = [day('2026-07-16', 1), day('2026-07-17', 1), day('2026-07-18', 1)];
    expect(currentStreak(days, 1, '2026-07-18')).toBe(3);
  });

  test('today not yet done does not break the streak', () => {
    const days = [day('2026-07-16', 1), day('2026-07-17', 1)];
    expect(currentStreak(days, 1, '2026-07-18')).toBe(2);
  });

  test('a gap before yesterday breaks the streak', () => {
    const days = [day('2026-07-14', 1), day('2026-07-15', 1), day('2026-07-17', 1)];
    expect(currentStreak(days, 1, '2026-07-18')).toBe(1);
  });

  test('neither today nor yesterday done means streak 0', () => {
    const days = [day('2026-07-15', 1), day('2026-07-16', 1)];
    expect(currentStreak(days, 1, '2026-07-18')).toBe(0);
  });

  test('countable habit: only days meeting target count', () => {
    const days = [day('2026-07-16', 8), day('2026-07-17', 5), day('2026-07-18', 9)];
    expect(currentStreak(days, 8, '2026-07-18')).toBe(1);
  });

  test('empty history returns 0', () => {
    expect(currentStreak([], 1, '2026-07-18')).toBe(0);
  });

  test('unsorted input is handled', () => {
    const days = [day('2026-07-18', 1), day('2026-07-16', 1), day('2026-07-17', 1)];
    expect(currentStreak(days, 1, '2026-07-18')).toBe(3);
  });
});

describe('bestStreak', () => {
  test('finds the longest run, not the most recent', () => {
    const days = [
      day('2026-07-01', 1),
      day('2026-07-02', 1),
      day('2026-07-03', 1),
      // gap
      day('2026-07-10', 1),
      day('2026-07-11', 1),
    ];
    expect(bestStreak(days, 1)).toBe(3);
  });

  test('incomplete days split runs for countable habits', () => {
    const days = [
      day('2026-07-01', 8),
      day('2026-07-02', 3),
      day('2026-07-03', 8),
      day('2026-07-04', 8),
    ];
    expect(bestStreak(days, 8)).toBe(2);
  });

  test('empty history returns 0', () => {
    expect(bestStreak([], 1)).toBe(0);
  });
});

describe('completionRate', () => {
  test('computes completed days over the inclusive window', () => {
    const days = [day('2026-07-01', 1), day('2026-07-10', 1), day('2026-07-15', 1)];
    const result = completionRate(days, 1, '2026-06-19', '2026-07-18');
    expect(result).toEqual({ completed: 3, totalDays: 30, rate: 0.1 });
  });

  test('partial countable days are not completed', () => {
    const days = [day('2026-07-17', 5), day('2026-07-18', 8)];
    const result = completionRate(days, 8, '2026-07-17', '2026-07-18');
    expect(result).toEqual({ completed: 1, totalDays: 2, rate: 0.5 });
  });

  test('check-ins outside the window are ignored', () => {
    const days = [day('2026-06-01', 1), day('2026-07-18', 1)];
    const result = completionRate(days, 1, '2026-07-17', '2026-07-18');
    expect(result.completed).toBe(1);
  });

  test('inverted window returns zeros', () => {
    expect(completionRate([], 1, '2026-07-18', '2026-07-17')).toEqual({
      completed: 0,
      totalDays: 0,
      rate: 0,
    });
  });
});

describe('totalUnits', () => {
  test('sums values inside the inclusive window', () => {
    const days = [day('2026-07-16', 5), day('2026-07-17', 3), day('2026-07-18', 8)];
    expect(totalUnits(days, '2026-07-17', '2026-07-18')).toBe(11);
  });

  test('empty history sums to 0', () => {
    expect(totalUnits([], '2026-07-01', '2026-07-18')).toBe(0);
  });
});
