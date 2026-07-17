import { Link } from 'react-router-dom';
import type { Habit } from '../../db/db';
import { useAppStore } from '../../store/useAppStore';
import CountStepper from './CountStepper';

export default function HabitRow({ habit }: { habit: Habit }) {
  const value = useAppStore((s) => s.checkins[habit.id] ?? 0);
  const toggleCheckin = useAppStore((s) => s.toggleCheckin);
  const done = value >= habit.target;

  return (
    <li className={done ? 'habit-row done' : 'habit-row'} style={{ '--habit-color': habit.color } as React.CSSProperties}>
      {habit.type === 'binary' ? (
        <button
          className="row-main"
          aria-pressed={done}
          onClick={() => void toggleCheckin(habit.id)}
        >
          <span className="habit-emoji">{habit.emoji}</span>
          <span className="habit-name">{habit.name}</span>
          <span className="habit-check" aria-hidden="true">
            {done ? '✓' : ''}
          </span>
        </button>
      ) : (
        <div className="row-main">
          <span className="habit-emoji">{habit.emoji}</span>
          <span className="habit-name">{habit.name}</span>
          <span className="habit-count">
            {value} / {habit.target} {habit.unit}
          </span>
          <CountStepper habit={habit} value={value} />
        </div>
      )}
      <Link className="habit-edit" to={`/habit/${habit.id}/edit`} aria-label={`Edit ${habit.name}`}>
        ✎
      </Link>
    </li>
  );
}
