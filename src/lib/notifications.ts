import type { Habit } from '../db/db';
import * as repo from '../db/repo';
import { useAppStore } from '../store/useAppStore';
import { todayKey } from './dates';

export interface ReminderCandidate {
  habit: Habit;
  at: number; // epoch ms
}

function reminderDate(base: Date, reminderTime: string, dayOffset: number): Date {
  const [hh, mm] = reminderTime.split(':').map(Number);
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hh, mm, 0, 0);
  return d;
}

// Earliest upcoming reminder. A habit completed today defers to tomorrow;
// a time already past today also rolls to tomorrow (tomorrow starts fresh).
export function nextReminder(
  habits: Habit[],
  todayCheckins: Record<string, number>,
  now: Date,
): ReminderCandidate | null {
  let best: ReminderCandidate | null = null;
  for (const h of habits) {
    if (!h.reminderTime || h.archivedAt !== null) continue;
    const doneToday = (todayCheckins[h.id] ?? 0) >= h.target;
    const todayAt = reminderDate(now, h.reminderTime, 0);
    const at =
      todayAt.getTime() <= now.getTime() || doneToday
        ? reminderDate(now, h.reminderTime, 1).getTime()
        : todayAt.getTime();
    if (!best || at < best.at) best = { habit: h, at };
  }
  return best;
}

export function getNotificationPermission(): NotificationPermission {
  return typeof Notification === 'undefined' ? 'denied' : Notification.permission;
}

export function requestNotificationPermission(): Promise<NotificationPermission> {
  return Notification.requestPermission();
}

export async function showReminder(habit: Habit): Promise<void> {
  const title = `${habit.emoji} ${habit.name}`;
  const body =
    habit.type === 'count'
      ? `Goal today: ${habit.target} ${habit.unit ?? ''}`.trim()
      : 'Time for your habit.';
  const options = {
    body,
    icon: `${import.meta.env.BASE_URL}icons/pwa-192.png`,
    tag: `habit-${habit.id}`,
  };
  // Via the SW registration when available (survives tab focus loss in an
  // installed PWA); plain Notification otherwise (vite dev has no SW).
  const reg = await navigator.serviceWorker?.getRegistration?.();
  if (reg) {
    await reg.showNotification(title, options);
  } else {
    new Notification(title, options);
  }
}

// Arms a timer for the next due reminder; re-checks completion at fire time
// and re-arms on store changes and tab visibility. Runs only while the app
// is open — a client-only PWA has no server to push in the background.
export function startReminderScheduler(
  show: (habit: Habit) => void = (h) => void showReminder(h),
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  // Overlapping arm() calls race across the IndexedDB await below: each one
  // clears the timer before awaiting, so two could both set timers and
  // double-fire. Only the newest generation is allowed to arm.
  let generation = 0;

  const arm = async () => {
    const gen = ++generation;
    clearTimeout(timer);
    const { habits } = useAppStore.getState();
    const rows = await repo.getCheckinsForDate(todayKey());
    if (stopped || gen !== generation) return;
    const todayCheckins: Record<string, number> = {};
    for (const row of rows) todayCheckins[row.habitId] = row.value;
    const next = nextReminder(habits, todayCheckins, new Date());
    if (!next) return;
    timer = setTimeout(() => void fire(next.habit.id), Math.max(0, next.at - Date.now()));
  };

  const fire = async (habitId: string) => {
    const habit = useAppStore.getState().habits.find((h) => h.id === habitId);
    const rows = await repo.getCheckinsForDate(todayKey());
    if (stopped) return;
    const value = rows.find((r) => r.habitId === habitId)?.value ?? 0;
    if (habit && value < habit.target) show(habit);
    void arm();
  };

  void arm();
  const unsubscribe = useAppStore.subscribe(() => void arm());
  const onVisible = () => void arm();
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribe();
    document.removeEventListener('visibilitychange', onVisible);
  };
}
