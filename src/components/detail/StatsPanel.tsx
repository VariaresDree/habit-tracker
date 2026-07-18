import type { Habit } from '../../db/db';
import { addDays, toDateKey, todayKey } from '../../lib/dates';
import { completionRate, totalUnits, type DayValue } from '../../lib/streaks';

const WINDOWS = [30, 90];

export default function StatsPanel({ history, habit }: { history: DayValue[]; habit: Habit }) {
  const today = todayKey();
  // The denominator only counts days the habit has existed: from creation,
  // or from the first check-in when history reaches further back (backfill,
  // import). history arrives date-ascending from useHabitHistory.
  const created = toDateKey(new Date(habit.createdAt));
  const firstEntry = history[0]?.date;
  const habitStart = firstEntry && firstEntry < created ? firstEntry : created;

  return (
    <div className="stats-panel">
      {WINDOWS.map((n) => {
        const windowFrom = addDays(today, -(n - 1));
        const from = windowFrom > habitStart ? windowFrom : habitStart;
        const stats = completionRate(history, habit.target, from, today);
        const units = totalUnits(history, from, today);
        return (
          <div key={n} className="stat" aria-label={`Last ${n} days`}>
            <span className="stat-title">Last {n} days</span>
            <strong>{Math.round(stats.rate * 100)}%</strong>
            <small>
              {stats.completed} / {stats.totalDays} days
            </small>
            {habit.type === 'count' && (
              <small>
                {units} {habit.unit ?? 'units'} total
              </small>
            )}
          </div>
        );
      })}
    </div>
  );
}
