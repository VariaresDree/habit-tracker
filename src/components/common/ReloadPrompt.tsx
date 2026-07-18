import { useRegisterSW } from 'virtual:pwa-register/react';

export default function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh && !offlineReady) return null;

  return (
    <div className="reload-prompt" role="status">
      {needRefresh ? (
        <>
          <span>Update available.</span>
          <button onClick={() => void updateServiceWorker(true)}>Reload</button>
          <button onClick={() => setNeedRefresh(false)}>Later</button>
        </>
      ) : (
        <>
          <span>Ready to work offline.</span>
          <button onClick={() => setOfflineReady(false)}>Dismiss</button>
        </>
      )}
    </div>
  );
}
