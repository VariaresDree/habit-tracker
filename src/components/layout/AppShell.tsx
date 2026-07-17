import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import TabBar from './TabBar';

export default function AppShell() {
  const status = useAppStore((s) => s.status);
  const hydrate = useAppStore((s) => s.hydrate);

  useEffect(() => {
    if (status === 'loading') void hydrate();
  }, [status, hydrate]);

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
