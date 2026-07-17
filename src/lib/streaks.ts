import { addDays, rangeKeys, type DateKey } from './dates';

export interface DayValue {
  date: DateKey;
  value: number;
}

export interface CompletionStats {
  completed: number;
  totalDays: number;
  rate: number;
}

function completedDates(days: DayValue[], target: number): Set<DateKey> {
  const set = new Set<DateKey>();
  for (const d of days) {
    if (d.value >= target) set.add(d.date);
  }
  return set;
}

export function currentStreak(days: DayValue[], target: number, today: DateKey): number {
  const done = completedDates(days, target);
  // An unfinished today doesn't break the streak — anchor on yesterday instead.
  const anchor = done.has(today) ? today : addDays(today, -1);
  let streak = 0;
  for (let k = anchor; done.has(k); k = addDays(k, -1)) {
    streak++;
  }
  return streak;
}

export function bestStreak(days: DayValue[], target: number): number {
  const done = [...completedDates(days, target)].sort();
  let best = 0;
  let run = 0;
  let prev: DateKey | null = null;
  for (const date of done) {
    run = prev !== null && addDays(prev, 1) === date ? run + 1 : 1;
    best = Math.max(best, run);
    prev = date;
  }
  return best;
}

export function completionRate(
  days: DayValue[],
  target: number,
  from: DateKey,
  to: DateKey,
): CompletionStats {
  if (from > to) return { completed: 0, totalDays: 0, rate: 0 };
  const totalDays = rangeKeys(from, to).length;
  const done = completedDates(days, target);
  let completed = 0;
  for (const date of done) {
    if (date >= from && date <= to) completed++;
  }
  return { completed, totalDays, rate: completed / totalDays };
}

export function totalUnits(days: DayValue[], from: DateKey, to: DateKey): number {
  let sum = 0;
  for (const d of days) {
    if (d.date >= from && d.date <= to) sum += d.value;
  }
  return sum;
}
