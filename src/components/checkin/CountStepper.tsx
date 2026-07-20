import type { Habit } from '../../db/db';
import { useAppStore } from '../../store/useAppStore';
import Icon from '../common/Icon';

export default function CountStepper({ habit, value }: { habit: Habit; value: number }) {
  const setCheckinValue = useAppStore((s) => s.setCheckinValue);
  return (
    <div className="stepper">
      <button
        aria-label={`Decrease ${habit.name}`}
        onClick={() => void setCheckinValue(habit.id, value - 1)}
        disabled={value <= 0}
      >
        <Icon name="minus" />
      </button>
      <button
        aria-label={`Increase ${habit.name}`}
        onClick={() => void setCheckinValue(habit.id, value + 1)}
      >
        <Icon name="plus" />
      </button>
    </div>
  );
}
