import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import DayProgress from './DayProgress';

describe('DayProgress', () => {
  test('states the count in words, not colour alone', () => {
    render(<DayProgress completed={3} total={5} />);
    expect(screen.getByText('3 of 5 done')).toBeInTheDocument();
    expect(screen.getByText(/2 to go/i)).toBeInTheDocument();
  });

  test('celebrates a finished day', () => {
    render(<DayProgress completed={4} total={4} />);
    expect(screen.getByText('4 of 4 done')).toBeInTheDocument();
    expect(screen.getByText(/all done/i)).toBeInTheDocument();
  });

  test('a fresh day reads as nothing done yet', () => {
    render(<DayProgress completed={0} total={3} />);
    expect(screen.getByText('0 of 3 done')).toBeInTheDocument();
    expect(screen.getByText(/3 to go/i)).toBeInTheDocument();
  });

  test('handles having no habits without dividing by zero', () => {
    const { container } = render(<DayProgress completed={0} total={0} />);
    const arc = container.querySelector('.ring-value') as SVGCircleElement;
    expect(arc.getAttribute('stroke-dashoffset')).not.toMatch(/NaN/);
  });

  test('the ring closes completely only when the day is complete', () => {
    const { container: partial } = render(<DayProgress completed={1} total={4} />);
    const { container: full } = render(<DayProgress completed={4} total={4} />);

    const offsetOf = (c: HTMLElement) =>
      Number((c.querySelector('.ring-value') as SVGCircleElement).getAttribute('stroke-dashoffset'));

    expect(offsetOf(full)).toBeCloseTo(0);
    expect(offsetOf(partial)).toBeGreaterThan(0);
  });

  test('the ring itself is decorative — the text carries the meaning', () => {
    const { container } = render(<DayProgress completed={1} total={2} />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
