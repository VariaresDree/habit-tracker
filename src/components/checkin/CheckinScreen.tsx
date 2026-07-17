import { Link } from 'react-router-dom';
import { addDays, todayKey } from '../../lib/dates';
import { useAppStore } from '../../store/useAppStore';
import EmptyState from '../common/EmptyState';
import HabitRow from './HabitRow';

function dateLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  return date;
}

export default function CheckinScreen() {
  const habits = useAppStore((s) => s.habits);
  const selectedDate = useAppStore((s) => s.selectedDate);
  const setSelectedDate = useAppStore((s) => s.setSelectedDate);
  const today = todayKey();

  return (
    <div className="checkin-screen">
      <header className="date-nav">
        <button
          aria-label="Previous day"
          onClick={() => void setSelectedDate(addDays(selectedDate, -1))}
        >
          ‹
        </button>
        <h1>{dateLabel(selectedDate, today)}</h1>
        <button
          aria-label="Next day"
          onClick={() => void setSelectedDate(addDays(selectedDate, 1))}
          disabled={selectedDate >= today}
        >
          ›
        </button>
      </header>

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
