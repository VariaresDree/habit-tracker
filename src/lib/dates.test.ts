import { describe, expect, test } from 'vitest';
import { addDays, dayOfWeek, rangeKeys, toDateKey, todayKey } from './dates';

describe('toDateKey', () => {
  test('formats with zero-padded month and day', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  test('uses local time, so 11:59pm stays on the same local day', () => {
    expect(toDateKey(new Date(2026, 6, 17, 23, 59))).toBe('2026-07-17');
  });

  test('uses local time, so 00:01am stays on the same local day', () => {
    expect(toDateKey(new Date(2026, 6, 18, 0, 1))).toBe('2026-07-18');
  });
});

describe('todayKey', () => {
  test('returns the key for an injected "now"', () => {
    expect(todayKey(new Date(2026, 6, 18, 14, 30))).toBe('2026-07-18');
  });
});

describe('addDays', () => {
  test('adds within a month', () => {
    expect(addDays('2026-07-10', 5)).toBe('2026-07-15');
  });

  test('subtracts across a month boundary', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  test('handles leap years', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  test('crosses a year boundary', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
  });

  test('zero delta is identity', () => {
    expect(addDays('2026-07-18', 0)).toBe('2026-07-18');
  });
});

describe('dayOfWeek', () => {
  test('returns 0 for a Sunday', () => {
    expect(dayOfWeek('2026-07-12')).toBe(0);
  });

  test('returns 6 for a Saturday', () => {
    expect(dayOfWeek('2026-07-18')).toBe(6);
  });

  test('returns 3 for a Wednesday', () => {
    expect(dayOfWeek('2026-07-15')).toBe(3);
  });
});

describe('rangeKeys', () => {
  test('returns inclusive ordered range', () => {
    expect(rangeKeys('2026-01-30', '2026-02-02')).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ]);
  });

  test('single-day range returns one key', () => {
    expect(rangeKeys('2026-07-18', '2026-07-18')).toEqual(['2026-07-18']);
  });

  test('inverted range returns empty array', () => {
    expect(rangeKeys('2026-07-18', '2026-07-17')).toEqual([]);
  });
});
