import type { NewHabitDraft } from '../db/db';

export interface HabitTemplate extends NewHabitDraft {
  id: string;
}

// A blank form is the hardest screen in a habit tracker: it asks the user to
// invent structure before they've felt any benefit. These give them a running
// start — one tap fills the form, which they can still edit before saving.
export const HABIT_TEMPLATES: HabitTemplate[] = [
  {
    id: 'water',
    name: 'Drink water',
    emoji: '💧',
    color: '#0284c7',
    type: 'count',
    target: 8,
    unit: 'glasses',
    reminderTime: null,
  },
  {
    id: 'meditate',
    name: 'Meditate',
    emoji: '🧘',
    color: '#7c3aed',
    type: 'binary',
    target: 1,
    reminderTime: null,
  },
  {
    id: 'read',
    name: 'Read',
    emoji: '📖',
    color: '#b45309',
    type: 'count',
    target: 10,
    unit: 'pages',
    reminderTime: null,
  },
  {
    id: 'walk',
    name: 'Walk',
    emoji: '🚶',
    color: '#059669',
    type: 'count',
    target: 30,
    unit: 'minutes',
    reminderTime: null,
  },
  {
    id: 'stretch',
    name: 'Stretch',
    emoji: '🤸',
    color: '#db2777',
    type: 'binary',
    target: 1,
    reminderTime: null,
  },
  {
    id: 'sleep',
    name: 'Sleep by 11',
    emoji: '😴',
    color: '#4f46e5',
    type: 'binary',
    target: 1,
    reminderTime: '22:30',
  },
];

/** Curated swatches — chosen to stay legible as an accent in both themes. */
export const HABIT_COLORS = [
  '#0b7a5e',
  '#0284c7',
  '#4f46e5',
  '#7c3aed',
  '#db2777',
  '#b91c1c',
  '#b45309',
  '#4d7c0f',
];

/** Common habit glyphs, so the emoji field isn't a blank text box. */
export const HABIT_EMOJIS = [
  '✨', '💧', '🧘', '📖', '🚶', '🏃', '🤸', '🏋️',
  '🥗', '😴', '📝', '🎯', '🧠', '🎸', '🌱', '💊',
];
