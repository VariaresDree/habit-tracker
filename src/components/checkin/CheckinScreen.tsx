import { Link } from 'react-router-dom';
import { addDays, todayKey } from '../../lib/dates';
import { useAppStore } from '../../store/useAppStore';
import EmptyState from '../common/EmptyState';
import Icon from '../common/Icon';
import DayProgress from './DayProgress';
import HabitRow from './HabitRow';

function dateLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  return date;
}

// "Saturday, 18 July" — orientation for backfilled days, where a bare
// 'Yesterday' isn't enough to know what you're editing.
function fullDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export default function CheckinScreen() {
  const habits = useAppStore((s) => s.habits);
  const checkins = useAppStore((s) => s.checkins);
  const selectedDate = useAppStore((s) => s.selectedDate);
  const setSelectedDate = useAppStore((s) => s.setSelectedDate);
  const today = todayKey();
  const completed = habits.filter((h) => (checkins[h.id] ?? 0) >= h.target).length;

  return (
    <div className="checkin-screen">
      <header className="date-nav">
        <button
          aria-label="Previous day"
          onClick={() => void setSelectedDate(addDays(selectedDate, -1))}
        >
          <Icon name="chevron-left" size={22} />
        </button>
        <div className="date-heading">
          <h1>{dateLabel(selectedDate, today)}</h1>
          <p>{fullDate(selectedDate)}</p>
        </div>
        <button
          aria-label="Next day"
          onClick={() => void setSelectedDate(addDays(selectedDate, 1))}
          disabled={selectedDate >= today}
        >
          <Icon name="chevron-right" size={22} />
        </button>
        <Link className="add-habit" to="/new" aria-label="Add habit">
          <Icon name="plus" size={22} />
        </Link>
      </header>

      {habits.length > 0 && <DayProgress completed={completed} total={habits.length} />}

      {habits.length === 0 ? (
        <EmptyState message="No habits yet.">
          <Link className="cta" to="/new">
            Add your first habit
          </Link>
        </EmptyState>
      ) : (
        <ul className="habit-list">
          {habits.map((habit) => (
            <HabitRow key={habit.id} habit={habit} />
          ))}
        </ul>
      )}
    </div>
  );
}
