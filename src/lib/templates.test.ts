import { describe, expect, test } from 'vitest';
import { HABIT_TEMPLATES } from './templates';

describe('starter templates', () => {
  test('offers a small, non-overwhelming set', () => {
    expect(HABIT_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    expect(HABIT_TEMPLATES.length).toBeLessThanOrEqual(8);
  });

  test('every template is a valid habit draft', () => {
    for (const t of HABIT_TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.emoji.length).toBeGreaterThan(0);
      expect(t.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(['binary', 'count']).toContain(t.type);
      expect(t.target).toBeGreaterThan(0);
    }
  });

  test('countable templates carry a unit and a real goal; binary ones do not', () => {
    for (const t of HABIT_TEMPLATES) {
      if (t.type === 'count') {
        expect(t.unit).toBeTruthy();
        expect(t.target).toBeGreaterThan(1);
      } else {
        expect(t.target).toBe(1);
        expect(t.unit).toBeUndefined();
      }
    }
  });

  test('ids are unique so they can key a list', () => {
    const ids = HABIT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
