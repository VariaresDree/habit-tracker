import { Link } from 'react-router-dom';
import type { Habit } from '../../db/db';
import { useAppStore } from '../../store/useAppStore';
import Icon from '../common/Icon';
import CountStepper from './CountStepper';

export default function HabitRow({ habit }: { habit: Habit }) {
  const value = useAppStore((s) => s.checkins[habit.id] ?? 0);
  const toggleCheckin = useAppStore((s) => s.toggleCheckin);
  const done = value >= habit.target;
  const percent = habit.target > 0 ? Math.min((value / habit.target) * 100, 100) : 0;

  return (
    <li
      className={done ? 'habit-row done' : 'habit-row'}
      style={{ '--habit-color': habit.color } as React.CSSProperties}
    >
      {habit.type === 'binary' ? (
        <button className="row-main" aria-pressed={done} onClick={() => void toggleCheckin(habit.id)}>
          <span className="habit-emoji">{habit.emoji}</span>
          <span className="habit-name">{habit.name}</span>
          <span className="habit-check" aria-hidden="true">
            {done && <Icon name="check" />}
          </span>
        </button>
      ) : (
        <div className="row-main">
          <span className="habit-emoji">{habit.emoji}</span>
          <div className="habit-body">
            <span className="habit-name">{habit.name}</span>
            {/* Progress duplicated visually; the count text beside it is the
                accessible source of truth. */}
            <div className="habit-bar" aria-hidden="true">
              <div className="habit-bar-fill" style={{ width: `${percent}%` }} />
            </div>
          </div>
          <span className="habit-count" aria-live="polite">
            {value} / {habit.target} {habit.unit}
          </span>
          <CountStepper habit={habit} value={value} />
        </div>
      )}
      <Link className="habit-edit" to={`/habit/${habit.id}`} aria-label={`View ${habit.name}`}>
        <Icon name="chevron-right" />
      </Link>
    </li>
  );
}
