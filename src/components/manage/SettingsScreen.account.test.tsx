import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { db } from '../../db/db';
import { todayKey } from '../../lib/dates';
import { useAppStore } from '../../store/useAppStore';
import SettingsScreen from './SettingsScreen';

const USER = { id: '9c72b791-db17-4908-af81-05264f0fa076', email: 'me@example.com' };

const m = vi.hoisted(() => ({
  sendCode: vi.fn(async () => {}),
  verifyCode: vi.fn(async () => ({
    id: '9c72b791-db17-4908-af81-05264f0fa076',
    email: 'me@example.com',
  })),
  signOut: vi.fn(async () => {}),
  getCurrentUser: vi.fn(async () => null as { id: string; email: string } | null),
  pushOutbox: vi.fn(async () => ({ status: 'pushed' as const, ops: 0 })),
}));

vi.mock('../../sync/auth', () => ({
  sendCode: m.sendCode,
  verifyCode: m.verifyCode,
  signOut: m.signOut,
  getCurrentUser: m.getCurrentUser,
}));
vi.mock('../../sync/push', () => ({ pushOutbox: m.pushOutbox }));

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() });
  await db.delete();
  await db.open();
  useAppStore.setState({
    status: 'ready',
    habits: [],
    selectedDate: todayKey(),
    checkins: {},
    notificationsEnabled: false,
    theme: 'system',
    user: null,
    authStatus: 'signed-out',
    syncState: 'idle',
    syncError: null,
    pendingOps: 0,
  });
});

describe('account section, signed out', () => {
  test('explains that nothing leaves the device until you sign in', () => {
    render(<SettingsScreen />);
    expect(screen.getByRole('heading', { name: /account/i })).toBeInTheDocument();
    expect(screen.getByText(/stays on this device/i)).toBeInTheDocument();
  });

  test('sending a code swaps the email field for a code field', async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);

    await user.type(screen.getByLabelText(/email/i), 'me@example.com');
    await user.click(screen.getByRole('button', { name: /send code/i }));

    expect(m.sendCode).toHaveBeenCalledWith('me@example.com');
    expect(await screen.findByLabelText(/sign-in code/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send code/i })).not.toBeInTheDocument();
  });

  test('entering the code signs in and shows the account', async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);

    await user.type(screen.getByLabelText(/email/i), 'me@example.com');
    await user.click(screen.getByRole('button', { name: /send code/i }));
    await user.type(await screen.findByLabelText(/sign-in code/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify/i }));

    expect(m.verifyCode).toHaveBeenCalledWith('me@example.com', '123456');
    // sign-in claims and uploads local data before it settles, so wait it out
    await waitFor(() => expect(useAppStore.getState().user).toEqual(USER));
    expect(await screen.findByText(/signed in as/i)).toBeInTheDocument();
  });

  test('a rejected sign-in is surfaced, not swallowed', async () => {
    const user = userEvent.setup();
    m.verifyCode.mockRejectedValueOnce(new Error('Token has expired or is invalid'));
    render(<SettingsScreen />);

    await user.type(screen.getByLabelText(/email/i), 'me@example.com');
    await user.click(screen.getByRole('button', { name: /send code/i }));
    await user.type(await screen.findByLabelText(/sign-in code/i), '000000');
    await user.click(screen.getByRole('button', { name: /verify/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/expired or is invalid/i);
    expect(useAppStore.getState().user).toBeNull();
  });
});

describe('account section, signed in', () => {
  beforeEach(() => {
    useAppStore.setState({ user: USER, authStatus: 'signed-in', pendingOps: 3 });
  });

  test('shows the account, the backlog, and a manual sync control', async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);

    expect(screen.getByText(/me@example.com/i)).toBeInTheDocument();
    expect(screen.getByText(/3 changes waiting/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /sync now/i }));
    await waitFor(() => expect(m.pushOutbox).toHaveBeenCalledWith(USER.id));
  });

  test('signing out keeps local data', async () => {
    const user = userEvent.setup();
    await useAppStore.getState().addHabit({
      name: 'Meditate',
      emoji: '🧘',
      color: '#3b82f6',
      type: 'binary',
      target: 1,
      reminderTime: null,
    });
    render(<SettingsScreen />);

    await user.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() => expect(useAppStore.getState().user).toBeNull());
    expect(m.signOut).toHaveBeenCalled();
    expect(await db.habits.count()).toBe(1);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  test('a sync error is shown with the queued work still counted', () => {
    useAppStore.setState({ syncState: 'error', syncError: 'network down', pendingOps: 2 });
    render(<SettingsScreen />);

    expect(screen.getByRole('alert')).toHaveTextContent(/network down/i);
    expect(screen.getByText(/2 changes waiting/i)).toBeInTheDocument();
  });
});
