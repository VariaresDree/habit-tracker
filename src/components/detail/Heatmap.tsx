import type { DayValue } from '../../lib/streaks';
import { addDays, dayOfWeek, rangeKeys, todayKey } from '../../lib/dates';

const WEEKS = 17;

function levelFor(value: number, target: number): number {
  if (value <= 0) return 0;
  const ratio = value / target;
  if (ratio >= 1) return 3;
  if (ratio >= 0.5) return 2;
  return 1;
}

const LEVEL_OPACITY = [1, 0.35, 0.65, 1];

export default function Heatmap({
  checkins,
  target,
  color,
}: {
  checkins: DayValue[];
  target: number;
  color: string;
}) {
  const today = todayKey();
  const start = addDays(today, -(WEEKS * 7 - 1));
  const byDate = new Map(checkins.map((c) => [c.date, c.value]));
  const pad = dayOfWeek(start); // leading blanks so columns start on Sunday

  return (
    <div className="heatmap" role="img" aria-label={`Last ${WEEKS} weeks of check-ins`}>
      {Array.from({ length: pad }, (_, i) => (
        <span key={`pad-${i}`} className="heatmap-cell pad" />
      ))}
      {rangeKeys(start, today).map((date) => {
        const value = byDate.get(date) ?? 0;
        const level = levelFor(value, target);
        return (
          <span
            key={date}
            className="heatmap-cell"
            data-date={date}
            data-level={level}
            title={`${date}: ${value} / ${target}`}
            style={{
              background: level === 0 ? 'var(--color-surface)' : color,
              opacity: LEVEL_OPACITY[level],
            }}
          />
        );
      })}
    </div>
  );
}
