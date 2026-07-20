import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import Icon, { ICON_NAMES } from './Icon';

describe('Icon', () => {
  test('is hidden from assistive tech when it is purely decorative', () => {
    const { container } = render(<Icon name="check" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('role', 'img');
  });

  test('becomes a labelled image when it carries meaning on its own', () => {
    const { getByRole } = render(<Icon name="flame" label="Current streak" />);
    const svg = getByRole('img', { name: 'Current streak' });
    expect(svg).not.toHaveAttribute('aria-hidden');
  });

  test('honours a requested size', () => {
    const { container } = render(<Icon name="plus" size={32} />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('width', '32');
    expect(svg).toHaveAttribute('height', '32');
  });

  test('inherits colour and never traps keyboard focus', () => {
    const { container } = render(<Icon name="trash" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveAttribute('focusable', 'false');
  });

  // Guards against a typo'd name silently rendering an empty icon.
  test('every declared icon draws something', () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      expect(container.querySelector('svg')!.children.length).toBeGreaterThan(0);
      unmount();
    }
  });
});
