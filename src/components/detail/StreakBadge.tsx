import { todayKey } from '../../lib/dates';
import { bestStreak, currentStreak, type DayValue } from '../../lib/streaks';

export default function StreakBadge({
  history,
  target,
}: {
  history: DayValue[];
  target: number;
}) {
  const current = currentStreak(history, target, todayKey());
  const best = bestStreak(history, target);

  return (
    <div className="streak-badge">
      <div className="streak" aria-label="Current streak">
        <strong>{current}</strong>
        <span>current streak</span>
      </div>
      <div className="streak" aria-label="Best streak">
        <strong>{best}</strong>
        <span>best streak</span>
      </div>
    </div>
  );
}
