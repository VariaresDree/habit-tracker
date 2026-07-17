import type { Habit } from '../../db/db';
import { addDays, todayKey } from '../../lib/dates';
import { completionRate, totalUnits, type DayValue } from '../../lib/streaks';

const WINDOWS = [30, 90];

export default function StatsPanel({ history, habit }: { history: DayValue[]; habit: Habit }) {
  const today = todayKey();

  return (
    <div className="stats-panel">
      {WINDOWS.map((n) => {
        const from = addDays(today, -(n - 1));
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
