import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { db } from './db/db';
import { todayKey } from './lib/dates';
import { useAppStore } from './store/useAppStore';

beforeEach(async () => {
  await db.delete();
  await db.open();
  useAppStore.setState({
    status: 'loading',
    habits: [],
    selectedDate: todayKey(),
    checkins: {},
  });
});

test('gates on hydration, then shows the Today screen with tab navigation', async () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );

  expect(screen.getByRole('status')).toBeInTheDocument();

  const nav = await screen.findByRole('navigation');
  expect(nav).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Today' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'New' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
});

test('tab links navigate between screens', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole('navigation');

  await user.click(screen.getByRole('link', { name: 'Settings' }));
  expect(await screen.findByRole('heading', { name: /settings/i })).toBeInTheDocument();
});
