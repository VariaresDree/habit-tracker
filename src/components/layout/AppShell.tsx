import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { getNotificationPermission, startReminderScheduler } from '../../lib/notifications';
import { useAppStore } from '../../store/useAppStore';
import { startAutoSync } from '../../sync/auto';
import TabBar from './TabBar';

export default function AppShell() {
  const status = useAppStore((s) => s.status);
  const hydrate = useAppStore((s) => s.hydrate);
  const notificationsEnabled = useAppStore((s) => s.notificationsEnabled);

  useEffect(() => {
    if (status === 'loading') void hydrate();
  }, [status, hydrate]);

  useEffect(() => {
    if (status !== 'ready' || !notificationsEnabled) return;
    if (getNotificationPermission() !== 'granted') return;
    return startReminderScheduler();
  }, [status, notificationsEnabled]);

  const user = useAppStore((s) => s.user);
  useEffect(() => {
    if (status !== 'ready' || !user) return;
    return startAutoSync();
  }, [status, user]);

  const theme = useAppStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim();
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', bg || '#10b981');
  }, [theme]);

  if (status !== 'ready') {
    return (
      <div className="splash" role="status">
        Loading…
      </div>
    );
  }

  return (
    <div className="app-shell">
      <main className="app-content">
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}
