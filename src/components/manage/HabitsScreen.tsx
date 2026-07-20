import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Habit } from '../../db/db';
import * as repo from '../../db/repo';
import { useAppStore } from '../../store/useAppStore';
import EmptyState from '../common/EmptyState';
import Icon from '../common/Icon';

// The management surface. Today answers "what do I do now"; this answers
// "what am I tracking, and in what order" — keeping the daily screen free of
// editing chrome.
export default function HabitsScreen() {
  const habits = useAppStore((s) => s.habits);
  const reorderHabits = useAppStore((s) => s.reorderHabits);
  const unarchiveHabit = useAppStore((s) => s.unarchiveHabit);
  const deleteHabit = useAppStore((s) => s.deleteHabit);
  const [archived, setArchived] = useState<Habit[]>([]);

  const refreshArchived = useCallback(async () => {
    setArchived(await repo.getArchivedHabits());
  }, []);

  useEffect(() => {
    void refreshArchived();
  }, [refreshArchived, habits]);

  const move = (index: number, delta: number) => {
    const ids = habits.map((h) => h.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void reorderHabits(ids);
  };

  const restore = async (id: string) => {
    await unarchiveHabit(id);
    await refreshArchived();
  };

  const remove = async (habit: Habit) => {
    if (window.confirm(`Delete "${habit.name}" and all its history?`)) {
      await deleteHabit(habit.id);
      await refreshArchived();
    }
  };

  return (
    <div className="habits-screen">
      <header className="screen-header">
        <h1>Habits</h1>
        <Link className="add-habit" to="/new" aria-label="Add habit">
          <Icon name="plus" size={22} />
        </Link>
      </header>

      {habits.length === 0 ? (
        <EmptyState message="No habits yet.">
          <Link className="cta" to="/new">
            Add your first habit
          </Link>
        </EmptyState>
      ) : (
        <ul className="manage-list">
          {habits.map((habit, index) => (
            <li
              key={habit.id}
              className="manage-row"
              style={{ '--habit-color': habit.color } as React.CSSProperties}
            >
              <span className="habit-emoji">{habit.emoji}</span>
              <Link className="manage-name" to={`/habit/${habit.id}`} aria-label={`View ${habit.name}`}>
                {habit.name}
              </Link>
              <div className="manage-actions">
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
              </div>
            </li>
          ))}
        </ul>
      )}

      <section>
        <h2>Archived</h2>
        {archived.length === 0 ? (
          <p className="field-hint">No archived habits.</p>
        ) : (
          <ul className="archived-list">
            {archived.map((habit) => (
              <li key={habit.id}>
                <span>
                  {habit.emoji} {habit.name}
                </span>
                <button onClick={() => void restore(habit.id)} aria-label={`Unarchive ${habit.name}`}>
                  Restore
                </button>
                <button
                  className="danger"
                  onClick={() => void remove(habit)}
                  aria-label={`Delete ${habit.name}`}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
