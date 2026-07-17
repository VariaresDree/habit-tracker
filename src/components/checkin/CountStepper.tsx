import type { Habit } from '../../db/db';
import { useAppStore } from '../../store/useAppStore';

export default function CountStepper({ habit, value }: { habit: Habit; value: number }) {
  const setCheckinValue = useAppStore((s) => s.setCheckinValue);
  return (
    <div className="stepper">
      <button
        aria-label={`Decrease ${habit.name}`}
        onClick={() => void setCheckinValue(habit.id, value - 1)}
        disabled={value <= 0}
      >
        −
      </button>
      <button
        aria-label={`Increase ${habit.name}`}
        onClick={() => void setCheckinValue(habit.id, value + 1)}
      >
        +
      </button>
    </div>
  );
}
