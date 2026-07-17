export type DateKey = string; // 'YYYY-MM-DD', always local time

export function toDateKey(d: Date): DateKey {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayKey(now: Date = new Date()): DateKey {
  return toDateKey(now);
}

// Parse to a local-time Date at noon so DST shifts can never move the day.
function fromDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(key: DateKey, delta: number): DateKey {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + delta);
  return toDateKey(d);
}

export function dayOfWeek(key: DateKey): number {
  return fromDateKey(key).getDay(); // 0 = Sunday .. 6 = Saturday
}

export function rangeKeys(from: DateKey, to: DateKey): DateKey[] {
  const keys: DateKey[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) {
    keys.push(k);
  }
  return keys;
}
