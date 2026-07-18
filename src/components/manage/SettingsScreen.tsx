import { useCallback, useEffect, useState } from 'react';
import type { Habit } from '../../db/db';
import * as repo from '../../db/repo';
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

  const [permission, setPermission] = useState<NotificationPermission>(getNotificationPermission);
  const [archived, setArchived] = useState<Habit[]>([]);

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
