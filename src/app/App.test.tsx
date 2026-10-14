import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: async () => {},
  }),
}));

afterEach(() => {
  window.location.hash = '';
});

describe('App', () => {
  it('opens on the Log tab', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Log' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Log' }).getAttribute('aria-current')).toBe('page');
  });

  it('follows the hash to another tab', () => {
    render(<App />);
    act(() => {
      window.location.hash = '#/map';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Map' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Map' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Log' }).getAttribute('aria-current')).toBeNull();
  });

  it('asks to be opened from the Home Screen when running in a browser tab', () => {
    render(<App />);
    expect(screen.getByRole('complementary', { name: 'Install Hotshoe' })).toBeDefined();
  });
});
