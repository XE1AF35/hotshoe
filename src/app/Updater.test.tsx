import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Updater } from './Updater.tsx';
import { holdUpdates } from './updates.ts';

const sw = vi.hoisted(() => ({
  needRefresh: false,
  updateServiceWorker: vi.fn(async (_reload?: boolean) => {}),
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [sw.needRefresh, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: sw.updateServiceWorker,
  }),
}));

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  sw.needRefresh = true;
  sw.updateServiceWorker.mockClear();
  sessionStorage.clear();
});

afterEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

describe('Updater', () => {
  it('installs a waiting version when the app is hidden', () => {
    render(<Updater />);
    expect(screen.getByRole('status').textContent).toContain('installs next time you leave');

    act(() => setVisibility('hidden'));
    expect(sw.updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('waits while work is in progress, then installs on the next hide', () => {
    render(<Updater />);
    const release = holdUpdates();
    act(() => setVisibility('hidden'));
    expect(sw.updateServiceWorker).not.toHaveBeenCalled();

    release();
    act(() => setVisibility('visible'));
    act(() => setVisibility('hidden'));
    expect(sw.updateServiceWorker).toHaveBeenCalledOnce();
  });

  it('installs straight away from Update now, and says so after the reload', () => {
    const { unmount } = render(<Updater />);
    fireEvent.click(screen.getByRole('button', { name: 'Update now' }));
    expect(sw.updateServiceWorker).toHaveBeenCalledWith(true);
    unmount();

    sw.needRefresh = false;
    render(<Updater />);
    expect(screen.getByRole('status').textContent).toBe('Hotshoe has been updated.');
  });

  it('does nothing when there is no new version', () => {
    sw.needRefresh = false;
    render(<Updater />);
    act(() => setVisibility('hidden'));
    expect(sw.updateServiceWorker).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
