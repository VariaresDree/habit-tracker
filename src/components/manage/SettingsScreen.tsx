import { useCallback, useEffect, useState } from 'react';
import type { Habit } from '../../db/db';
import * as repo from '../../db/repo';
import { todayKey } from '../../lib/dates';
import {
  getNotificationPermission,
  requestNotificationPermission,
} from '../../lib/notifications';
import { useAppStore } from '../../store/useAppStore';

export default function SettingsScreen() {
  const notificationsEnabled = useAppStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useAppStore((s) => s.setNotificationsEnabled);
  const unarchiveHabit = useAppStore((s) => s.unarchiveHabit);
  const deleteHabit = useAppStore((s) => s.deleteHabit);
  const hydrate = useAppStore((s) => s.hydrate);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  const [permission, setPermission] = useState<NotificationPermission>(getNotificationPermission);
  const [archived, setArchived] = useState<Habit[]>([]);
  const [importError, setImportError] = useState<string | null>(null);

  const refreshArchived = useCallback(async () => {
    setArchived(await repo.getArchivedHabits());
  }, []);

  useEffect(() => {
    void refreshArchived();
  }, [refreshArchived]);

  const enable = async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === 'granted') {
      await setNotificationsEnabled(true);
    }
  };

  const unarchive = async (id: number) => {
    await unarchiveHabit(id);
    await refreshArchived();
  };

  const remove = async (habit: Habit) => {
    if (window.confirm(`Delete "${habit.name}" and all its history?`)) {
      await deleteHabit(habit.id);
      await refreshArchived();
    }
  };

  const exportBackup = async () => {
    const backup = await repo.exportData();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `habit-tracker-backup-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // FileReader instead of File.text(): identical support in browsers, and
  // jsdom (tests) only implements the former.
  const readFileText = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });

  const importBackup = async (file: File) => {
    setImportError(null);
    let payload: unknown;
    try {
      payload = JSON.parse(await readFileText(file));
    } catch {
      setImportError('Not a valid habit-tracker backup file.');
      return;
    }
    if (!window.confirm('Importing replaces ALL current habits and history. Continue?')) {
      return;
    }
    try {
      await repo.importData(payload);
      await hydrate();
      await refreshArchived();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed.');
    }
  };

  return (
    <div className="settings-screen">
      <h1>Settings</h1>

      <section>
        <h2>Notifications</h2>
        <p className="field-hint">
          Reminders fire only while the app is open — this app has no server, so nothing can push
          notifications in the background.
        </p>
        {permission === 'default' && (
          <button className="cta" onClick={() => void enable()}>
            Enable notifications
          </button>
        )}
        {permission === 'denied' && (
          <p className="field-hint">
            Notifications are blocked in your browser settings. Reminder times are saved, but
            nothing can fire until you allow notifications for this site.
          </p>
        )}
        {permission === 'granted' && (
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={notificationsEnabled}
              onChange={(e) => void setNotificationsEnabled(e.target.checked)}
            />
            Reminders enabled
          </label>
        )}
      </section>

      <section>
        <h2>Appearance</h2>
        <fieldset className="theme-picker">
          <legend>Theme</legend>
          {(['system', 'light', 'dark'] as const).map((option) => (
            <label key={option}>
              <input
                type="radio"
                name="theme"
                checked={theme === option}
                onChange={() => void setTheme(option)}
              />
              {option[0].toUpperCase() + option.slice(1)}
            </label>
          ))}
        </fieldset>
      </section>

      <section>
        <h2>Data</h2>
        <p className="field-hint">
          Export a backup file, or import one to move your data between devices. Importing
          replaces everything on this device.
        </p>
        <div className="data-actions">
          <button className="cta" onClick={() => void exportBackup()}>
            Export data
          </button>
          <label className="import-label" htmlFor="import-file">
            Import data
          </label>
          <input
            id="import-file"
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importBackup(file);
              e.target.value = '';
            }}
          />
        </div>
        {importError && (
          <p className="import-error" role="alert">
            {importError}
          </p>
        )}
      </section>

      <section>
        <h2>Archived habits</h2>
        {archived.length === 0 ? (
          <p className="field-hint">No archived habits.</p>
        ) : (
          <ul className="archived-list">
            {archived.map((habit) => (
              <li key={habit.id}>
                <span>
                  {habit.emoji} {habit.name}
                </span>
                <button onClick={() => void unarchive(habit.id)} aria-label={`Unarchive ${habit.name}`}>
                  Unarchive
                </button>
                <button
                  className="danger"
                  onClick={() => void remove(habit)}
                  aria-label={`Delete ${habit.name}`}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
