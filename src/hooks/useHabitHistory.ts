import { useEffect, useState } from 'react';
import * as repo from '../db/repo';
import type { DayValue } from '../lib/streaks';
import { useAppStore } from '../store/useAppStore';

// Full history rather than a fixed window: streaks can span further back
// than any heatmap/stats window, and a personal tracker's row count stays small.
export function useHabitHistory(habitId: string): DayValue[] {
  // Subscribing to checkins makes an open detail screen refresh when the
  // user checks in elsewhere in the app.
  const checkins = useAppStore((s) => s.checkins);
  const [history, setHistory] = useState<DayValue[]>([]);

  useEffect(() => {
    if (!habitId) return;
    let cancelled = false;
    void repo.getCheckinsForHabit(habitId, '0000-01-01').then((rows) => {
      if (!cancelled) setHistory(rows.map((r) => ({ date: r.date, value: r.value })));
    });
    return () => {
      cancelled = true;
    };
  }, [habitId, checkins]);

  return history;
}
