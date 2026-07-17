import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { addDays, dayOfWeek, todayKey } from '../../lib/dates';
import Heatmap from './Heatmap';

const today = todayKey();

function cells(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-date]')];
}

describe('Heatmap', () => {
  test('renders one cell per day for the window, ending today', () => {
    const { container } = render(<Heatmap checkins={[]} target={1} color="#10b981" />);
    const dayCells = cells(container);
    expect(dayCells).toHaveLength(17 * 7);
    expect(dayCells[0].dataset.date).toBe(addDays(today, -(17 * 7 - 1)));
    expect(dayCells[dayCells.length - 1].dataset.date).toBe(today);
  });

  test('aligns the first column to Sunday with leading pad cells', () => {
    const { container } = render(<Heatmap checkins={[]} target={1} color="#10b981" />);
    const start = addDays(today, -(17 * 7 - 1));
    expect(container.querySelectorAll('.heatmap-cell.pad')).toHaveLength(dayOfWeek(start));
  });

  test('maps value/target ratio to intensity levels', () => {
    const checkins = [
      { date: today, value: 8 },                    // >= target -> 3
      { date: addDays(today, -1), value: 5 },       // >= half   -> 2
      { date: addDays(today, -2), value: 2 },       // < half    -> 1
      { date: addDays(today, -3), value: 0 },       // zero      -> 0
    ];
    const { container } = render(<Heatmap checkins={checkins} target={8} color="#10b981" />);
    const byDate = Object.fromEntries(cells(container).map((c) => [c.dataset.date, c.dataset.level]));
    expect(byDate[today]).toBe('3');
    expect(byDate[addDays(today, -1)]).toBe('2');
    expect(byDate[addDays(today, -2)]).toBe('1');
    expect(byDate[addDays(today, -3)]).toBe('0');
    expect(byDate[addDays(today, -4)]).toBe('0'); // day with no check-in at all
  });

  test('binary habit: a done day is full intensity', () => {
    const { container } = render(
      <Heatmap checkins={[{ date: today, value: 1 }]} target={1} color="#3b82f6" />,
    );
    const cell = container.querySelector<HTMLElement>(`[data-date="${today}"]`);
    expect(cell?.dataset.level).toBe('3');
  });
});
