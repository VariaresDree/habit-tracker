import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { HABIT_COLORS, HABIT_EMOJIS, HABIT_TEMPLATES, type HabitTemplate } from '../../lib/templates';
import { useAppStore } from '../../store/useAppStore';
import EmptyState from '../common/EmptyState';
import Icon from '../common/Icon';

export default function HabitFormScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const habits = useAppStore((s) => s.habits);
  const addHabit = useAppStore((s) => s.addHabit);
  const updateHabit = useAppStore((s) => s.updateHabit);
  const editing = id ? habits.find((h) => h.id === id) : undefined;

  const [name, setName] = useState(editing?.name ?? '');
  const [emoji, setEmoji] = useState(editing?.emoji ?? '✨');
  const [color, setColor] = useState(editing?.color ?? HABIT_COLORS[0]);
  const [type, setType] = useState<'binary' | 'count'>(editing?.type ?? 'binary');
  // String state: coercing to number on each keystroke mangles cleared fields
  // (empty -> forced "1" -> typing "8" yields "18"). Parse on submit instead.
  const [target, setTarget] = useState(String(editing?.target ?? 3));
  const [unit, setUnit] = useState(editing?.unit ?? '');
  const [reminderTime, setReminderTime] = useState(editing?.reminderTime ?? '');

  if (id && !editing) {
    return <EmptyState message="Habit not found." />;
  }

  const applyTemplate = (t: HabitTemplate) => {
    setName(t.name);
    setEmoji(t.emoji);
    setColor(t.color);
    setType(t.type);
    setTarget(String(t.target));
    setUnit(t.unit ?? '');
    setReminderTime(t.reminderTime ?? '');
  };

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

      {!editing && (
        <section className="templates">
          <h2>Start from an example</h2>
          <div className="template-row">
            {HABIT_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                className="template-chip"
                onClick={() => applyTemplate(t)}
              >
                <span aria-hidden="true">{t.emoji}</span>
                {t.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Shows the decision being made, rather than describing it. */}
      <div className="habit-preview" style={{ '--habit-color': color } as React.CSSProperties}>
        <span className="habit-emoji">{emoji}</span>
        <div className="habit-body">
          <span className="habit-name">{name.trim() || 'Your habit'}</span>
          <span className="preview-meta">
            {type === 'binary' ? 'Done or not done' : `Goal: ${target || 1} ${unit || 'per day'}`}
          </span>
        </div>
      </div>

      <label htmlFor="habit-name">Name</label>
      <input
        id="habit-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Drink water"
      />

      <fieldset className="picker-group">
        <legend>Icon</legend>
        <div className="emoji-grid">
          {HABIT_EMOJIS.map((choice) => (
            <button
              key={choice}
              type="button"
              className={choice === emoji ? 'emoji-choice selected' : 'emoji-choice'}
              aria-pressed={choice === emoji}
              aria-label={`Icon ${choice}`}
              onClick={() => setEmoji(choice)}
            >
              {choice}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="picker-group">
        <legend>Colour</legend>
        <div className="color-row">
          {HABIT_COLORS.map((choice) => (
            <button
              key={choice}
              type="button"
              className={choice === color ? 'color-choice selected' : 'color-choice'}
              style={{ background: choice }}
              aria-pressed={choice === color}
              aria-label={`Colour ${choice}`}
              onClick={() => setColor(choice)}
            >
              {choice === color && <Icon name="check" size={16} />}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Changing binary<->count would corrupt history semantics, so type locks after creation. */}
      <fieldset className="segmented" disabled={!!editing}>
        <legend>Type</legend>
        <label className={type === 'binary' ? 'segment selected' : 'segment'}>
          <input
            type="radio"
            name="habit-type"
            checked={type === 'binary'}
            onChange={() => setType('binary')}
          />
          Yes / no
        </label>
        <label className={type === 'count' ? 'segment selected' : 'segment'}>
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
