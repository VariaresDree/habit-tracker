import { useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, todayKey } from '../../lib/dates';
import { useAppStore } from '../../store/useAppStore';
import EmptyState from '../common/EmptyState';
import Icon from '../common/Icon';
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
  const reorderHabits = useAppStore((s) => s.reorderHabits);
  const [reordering, setReordering] = useState(false);
  const today = todayKey();

  const move = (index: number, delta: number) => {
    const ids = habits.map((h) => h.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void reorderHabits(ids);
  };

  return (
    <div className="checkin-screen">
      <header className="date-nav">
        <button
          aria-label="Previous day"
          onClick={() => void setSelectedDate(addDays(selectedDate, -1))}
        >
          <Icon name="chevron-left" size={22} />
        </button>
        <h1>{dateLabel(selectedDate, today)}</h1>
        <button
          aria-label="Next day"
          onClick={() => void setSelectedDate(addDays(selectedDate, 1))}
          disabled={selectedDate >= today}
        >
          <Icon name="chevron-right" size={22} />
        </button>
      </header>

      {habits.length === 0 ? (
        <EmptyState message="No habits yet.">
          <Link className="cta" to="/new">
            Add your first habit
          </Link>
        </EmptyState>
      ) : (
        <>
          <ul className="habit-list">
            {reordering
              ? habits.map((habit, index) => (
                  <li key={habit.id} className="habit-row reorder-row">
                    <span className="habit-emoji">{habit.emoji}</span>
                    <span className="habit-name">{habit.name}</span>
                    <button
                      aria-label={`Move ${habit.name} up`}
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                    >
                      <Icon name="chevron-up" />
                    </button>
                    <button
                      aria-label={`Move ${habit.name} down`}
                      onClick={() => move(index, 1)}
                      disabled={index === habits.length - 1}
                    >
                      <Icon name="chevron-down" />
                    </button>
                  </li>
                ))
              : habits.map((habit) => <HabitRow key={habit.id} habit={habit} />)}
          </ul>
          {habits.length > 1 && (
            <button
              className="reorder-toggle"
              aria-label={reordering ? 'Done reordering' : 'Reorder habits'}
              onClick={() => setReordering((r) => !r)}
            >
              <Icon name="grip" size={16} />
              {reordering ? 'Done' : 'Reorder'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
