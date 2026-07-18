import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { db, type NewHabitDraft } from '../../db/db';
import * as repo from '../../db/repo';
import { todayKey } from '../../lib/dates';
import { useAppStore } from '../../store/useAppStore';
import SettingsScreen from './SettingsScreen';

const notif = {
  permission: 'default' as NotificationPermission,
  requestPermission: vi.fn(async () => 'granted' as NotificationPermission),
};

const draft = (name: string): NewHabitDraft => ({
  name,
  emoji: '🧘',
  color: '#3b82f6',
  type: 'binary',
  target: 1,
  reminderTime: null,
});

beforeEach(async () => {
  notif.permission = 'default';
  vi.clearAllMocks();
  vi.stubGlobal('Notification', notif);
  await db.delete();
  await db.open();
  useAppStore.setState({
    status: 'loading',
    habits: [],
    selectedDate: todayKey(),
    checkins: {},
    notificationsEnabled: false,
    theme: 'system',
  });
  await useAppStore.getState().hydrate();
});

describe('notifications section', () => {
  test('always explains reminders only fire while the app is open', () => {
    render(<SettingsScreen />);
    expect(screen.getByText(/only while the app is open/i)).toBeInTheDocument();
  });

  test('default permission: enable button requests permission and auto-enables on grant', async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);

    await user.click(screen.getByRole('button', { name: /enable notifications/i }));

    expect(notif.requestPermission).toHaveBeenCalledOnce();
    expect(await screen.findByRole('checkbox', { name: /reminders enabled/i })).toBeChecked();
    expect(useAppStore.getState().notificationsEnabled).toBe(true);
  });

  test('denied permission: explanatory note, no enable control', () => {
    notif.permission = 'denied';
    render(<SettingsScreen />);

    expect(screen.getByText(/blocked in your browser/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enable notifications/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  test('granted permission: toggle reflects and persists the setting', async () => {
    notif.permission = 'granted';
    const user = userEvent.setup();
    render(<SettingsScreen />);

    const toggle = screen.getByRole('checkbox', { name: /reminders enabled/i });
    expect(toggle).not.toBeChecked();

    await user.click(toggle);
    await waitFor(() => expect(useAppStore.getState().notificationsEnabled).toBe(true));
    expect(await repo.getSetting('notificationsEnabled')).toBe(true);
  });
});

describe('appearance section', () => {
  test('theme radios reflect and update the store', async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);

    expect(screen.getByRole('radio', { name: /system/i })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: /dark/i }));
    await waitFor(() => expect(useAppStore.getState().theme).toBe('dark'));
    expect(await repo.getSetting('theme')).toBe('dark');
    expect(screen.getByRole('radio', { name: /dark/i })).toBeChecked();
  });
});

describe('data section', () => {
  test('export builds a downloadable backup blob named with today\'s date', async () => {
    const user = userEvent.setup();
    await useAppStore.getState().addHabit(draft('Meditate'));
    let capturedBlob: Blob | null = null;
    const createUrl = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return 'blob:mock';
    });
    vi.stubGlobal('URL', { ...URL, createObjectURL: createUrl, revokeObjectURL: vi.fn() });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<SettingsScreen />);

    await user.click(screen.getByRole('button', { name: /export data/i }));

    await waitFor(() => expect(createUrl).toHaveBeenCalledOnce());
    const blobText = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(capturedBlob!);
    });
    const backup = JSON.parse(blobText);
    expect(backup.version).toBe(1);
    expect(backup.habits.map((h: { name: string }) => h.name)).toEqual(['Meditate']);
    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  test('import replaces data after confirmation and refreshes the store', async () => {
    const user = userEvent.setup();
    await useAppStore.getState().addHabit(draft('Old habit'));
    const backup = await repo.exportData();
    await db.delete();
    await db.open();
    useAppStore.setState({ habits: [], checkins: {} });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<SettingsScreen />);

    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText(/import data/i), file);

    await waitFor(() =>
      expect(useAppStore.getState().habits.map((h) => h.name)).toEqual(['Old habit']),
    );
    expect(confirmSpy).toHaveBeenCalledOnce();
    confirmSpy.mockRestore();
  });

  test('malformed file shows an error and leaves data intact', async () => {
    const user = userEvent.setup();
    const id = await useAppStore.getState().addHabit(draft('Keep me'));
    await useAppStore.getState().hydrate();
    render(<SettingsScreen />);

    const file = new File(['not json {{{'], 'bad.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText(/import data/i), file);

    expect(await screen.findByRole('alert')).toHaveTextContent(/not a valid/i);
    expect(useAppStore.getState().habits.map((h) => h.id)).toEqual([id]);
    expect((await repo.getActiveHabits()).map((h) => h.id)).toEqual([id]);
  });

  test('declining the confirmation leaves data untouched', async () => {
    const user = userEvent.setup();
    const id = await useAppStore.getState().addHabit(draft('Keep me'));
    const backup = { version: 1, exportedAt: 'x', habits: [], checkins: [], settings: [] };
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<SettingsScreen />);

    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText(/import data/i), file);

    await waitFor(() => expect(confirmSpy).toHaveBeenCalledOnce());
    expect((await repo.getActiveHabits()).map((h) => h.id)).toEqual([id]);
    confirmSpy.mockRestore();
  });
});

describe('archived habits section', () => {
  test('shows a friendly empty state when nothing is archived', async () => {
    render(<SettingsScreen />);
    expect(await screen.findByText(/no archived habits/i)).toBeInTheDocument();
  });

  test('unarchive returns the habit to the active list', async () => {
    const user = userEvent.setup();
    const id = await useAppStore.getState().addHabit(draft('Meditate'));
    await useAppStore.getState().archiveHabit(id);
    render(<SettingsScreen />);

    expect(await screen.findByText(/meditate/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /unarchive meditate/i }));

    await waitFor(() =>
      expect(useAppStore.getState().habits.map((h) => h.id)).toEqual([id]),
    );
    expect(screen.queryByRole('button', { name: /unarchive meditate/i })).not.toBeInTheDocument();
    expect((await repo.getHabit(id))?.archivedAt).toBeNull();
  });

  test('delete confirms then removes the habit and its history', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const id = await useAppStore.getState().addHabit(draft('Meditate'));
    await useAppStore.getState().toggleCheckin(id);
    await useAppStore.getState().archiveHabit(id);
    render(<SettingsScreen />);

    await screen.findByText(/meditate/i);
    await user.click(screen.getByRole('button', { name: /delete meditate/i }));

    expect(confirmSpy).toHaveBeenCalledOnce();
    await waitFor(async () => expect(await repo.getHabit(id)).toBeUndefined());
    expect(await repo.getCheckinsForHabit(id, '2000-01-01')).toEqual([]);
    expect(screen.queryByText(/meditate/i)).not.toBeInTheDocument();
    confirmSpy.mockRestore();
  });
});
