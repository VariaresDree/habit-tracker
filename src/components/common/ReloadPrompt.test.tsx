import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import ReloadPrompt from './ReloadPrompt';

const mocks = vi.hoisted(() => ({
  needRefresh: false,
  offlineReady: false,
  setNeedRefresh: vi.fn(),
  setOfflineReady: vi.fn(),
  updateServiceWorker: vi.fn(async () => {}),
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [mocks.needRefresh, mocks.setNeedRefresh],
    offlineReady: [mocks.offlineReady, mocks.setOfflineReady],
    updateServiceWorker: mocks.updateServiceWorker,
  }),
}));

beforeEach(() => {
  mocks.needRefresh = false;
  mocks.offlineReady = false;
  vi.clearAllMocks();
});

describe('ReloadPrompt', () => {
  test('renders nothing when there is nothing to say', () => {
    const { container } = render(<ReloadPrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  test('update available: reload button applies the new service worker', async () => {
    const user = userEvent.setup();
    mocks.needRefresh = true;
    render(<ReloadPrompt />);

    expect(screen.getByText(/update available/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /reload/i }));
    expect(mocks.updateServiceWorker).toHaveBeenCalledWith(true);
  });

  test('offline ready: shows a dismissible note', async () => {
    const user = userEvent.setup();
    mocks.offlineReady = true;
    render(<ReloadPrompt />);

    expect(screen.getByText(/ready to work offline/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(mocks.setOfflineReady).toHaveBeenCalledWith(false);
  });
});
