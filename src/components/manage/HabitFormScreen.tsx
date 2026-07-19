import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import EmptyState from '../common/EmptyState';

export default function HabitFormScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const habits = useAppStore((s) => s.habits);
  const addHabit = useAppStore((s) => s.addHabit);
  const updateHabit = useAppStore((s) => s.updateHabit);
  const editing = id ? habits.find((h) => h.id === id) : undefined;

  const [name, setName] = useState(editing?.name ?? '');
  const [emoji, setEmoji] = useState(editing?.emoji ?? '✨');
  const [color, setColor] = useState(editing?.color ?? '#10b981');
  const [type, setType] = useState<'binary' | 'count'>(editing?.type ?? 'binary');
  // String state: coercing to number on each keystroke mangles cleared fields
  // (empty -> forced "1" -> typing "8" yields "18"). Parse on submit instead.
  const [target, setTarget] = useState(String(editing?.target ?? 3));
  const [unit, setUnit] = useState(editing?.unit ?? '');
  const [reminderTime, setReminderTime] = useState(editing?.reminderTime ?? '');

  if (id && !editing) {
    return <EmptyState message="Habit not found." />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const payload = {
      name: name.trim(),
      emoji: emoji.trim() || '✨',
      color,
      type,
      target: type === 'binary' ? 1 : Math.max(1, Number(target) || 1),
      unit: type === 'count' && unit.trim() ? unit.trim() : undefined,
      reminderTime: reminderTime || null,
    };
    if (editing) {
      await updateHabit(editing.id, payload);
    } else {
      await addHabit(payload);
    }
    navigate('/');
  };

  return (
    <form className="habit-form" onSubmit={(e) => void submit(e)}>
      <h1>{editing ? 'Edit habit' : 'New habit'}</h1>

      <label htmlFor="habit-name">Name</label>
      <input
        id="habit-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Drink water"
      />

      <div className="form-row">
        <div>
          <label htmlFor="habit-emoji">Emoji</label>
          <input
            id="habit-emoji"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            maxLength={4}
          />
        </div>
        <div>
          <label htmlFor="habit-color">Color</label>
          <input
            id="habit-color"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </div>
      </div>

      {/* Changing binary<->count would corrupt history semantics, so type locks after creation. */}
      <fieldset disabled={!!editing}>
        <legend>Type</legend>
        <label>
          <input
            type="radio"
            name="habit-type"
            checked={type === 'binary'}
            onChange={() => setType('binary')}
          />
          Yes / no
        </label>
        <label>
          <input
            type="radio"
            name="habit-type"
            checked={type === 'count'}
            onChange={() => setType('count')}
          />
          Countable
        </label>
      </fieldset>

      {type === 'count' && (
        <div className="form-row">
          <div>
            <label htmlFor="habit-target">Daily target</label>
            <input
              id="habit-target"
              type="number"
              min={1}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="habit-unit">Unit</label>
            <input
              id="habit-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="e.g. glasses"
            />
          </div>
        </div>
      )}

      <label htmlFor="habit-reminder">Reminder time (optional)</label>
      <input
        id="habit-reminder"
        type="time"
        value={reminderTime}
        onChange={(e) => setReminderTime(e.target.value)}
      />
      <p className="field-hint">Reminders arrive once notifications are enabled in Settings.</p>

      <button className="cta" type="submit" disabled={!name.trim()}>
        {editing ? 'Save' : 'Create habit'}
      </button>
    </form>
  );
}
