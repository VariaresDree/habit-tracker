import { useState, type FormEvent } from 'react';
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
  const hydrate = useAppStore((s) => s.hydrate);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  const user = useAppStore((s) => s.user);
  const authStatus = useAppStore((s) => s.authStatus);
  const syncState = useAppStore((s) => s.syncState);
  const syncError = useAppStore((s) => s.syncError);
  const pendingOps = useAppStore((s) => s.pendingOps);
  const signIn = useAppStore((s) => s.signIn);
  const verifyCode = useAppStore((s) => s.verifyCode);
  const signOutAction = useAppStore((s) => s.signOut);
  const syncNow = useAppStore((s) => s.syncNow);

  const [permission, setPermission] = useState<NotificationPermission>(getNotificationPermission);
  const [importError, setImportError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const enable = async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === 'granted') {
      await setNotificationsEnabled(true);
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

  const submitEmail = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setBusy(true);
    try {
      await signIn(email.trim());
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setBusy(true);
    try {
      await verifyCode(email.trim(), code.trim());
      setCode('');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Could not verify the code.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-screen">
      <h1>Settings</h1>

      <section>
        <h2>Account</h2>
        {!user ? (
          <>
            <p className="field-hint">
              Signed out, everything stays on this device. Sign in to sync your habits across
              devices — your habit names and check-ins are then stored in your account.
            </p>
            {authStatus === 'code-sent' ? (
              <form className="account-form" onSubmit={(e) => void submitCode(e)}>
                <label htmlFor="account-code">Sign-in code</label>
                <input
                  id="account-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6-digit code"
                />
                <p className="field-hint">Sent to {email}. It expires shortly.</p>
                <button className="cta" type="submit" disabled={busy || !code.trim()}>
                  Verify code
                </button>
              </form>
            ) : (
              <form className="account-form" onSubmit={(e) => void submitEmail(e)}>
                <label htmlFor="account-email">Email</label>
                <input
                  id="account-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                <button className="cta" type="submit" disabled={busy || !email.trim()}>
                  Send code
                </button>
              </form>
            )}
          </>
        ) : (
          <>
            <p>
              Signed in as <strong>{user.email}</strong>
            </p>
            <p className="field-hint">
              {pendingOps === 0
                ? 'Everything is uploaded.'
                : `${pendingOps} ${pendingOps === 1 ? 'change' : 'changes'} waiting to upload.`}
              {syncState === 'syncing' && ' Syncing…'}
              {syncState === 'offline' && ' Offline — will retry when you reconnect.'}
            </p>
            <div className="account-actions">
              <button onClick={() => void syncNow()} disabled={syncState === 'syncing'}>
                Sync now
              </button>
              <button onClick={() => void signOutAction()}>Sign out</button>
            </div>
          </>
        )}
        {(authError || syncError) && (
          <p className="import-error" role="alert">
            {authError ?? syncError}
          </p>
        )}
      </section>

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

    </div>
  );
}
