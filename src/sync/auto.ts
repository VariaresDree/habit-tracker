import { useAppStore } from '../store/useAppStore';

// Keeps the upload queue moving without the user thinking about it: once on
// start, when local data changes (debounced), when the tab regains focus, and
// when the network comes back. syncNow already ignores overlapping calls.
export function startAutoSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const trigger = () => void useAppStore.getState().syncNow();
  const debounced = () => {
    clearTimeout(timer);
    timer = setTimeout(trigger, 1500);
  };

  trigger();
  const unsubscribe = useAppStore.subscribe((state, prev) => {
    if (state.habits !== prev.habits || state.checkins !== prev.checkins) debounced();
  });
  window.addEventListener('online', trigger);
  document.addEventListener('visibilitychange', trigger);

  return () => {
    clearTimeout(timer);
    unsubscribe();
    window.removeEventListener('online', trigger);
    document.removeEventListener('visibilitychange', trigger);
  };
}
