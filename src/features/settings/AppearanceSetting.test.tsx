import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  followSystemTheme,
  onThemeChange,
  resolveTheme,
  themeStorageKey,
} from '../../lib/theme.ts';
import { AppearanceSetting } from './AppearanceSetting.tsx';

const radio = (name: string | RegExp) => screen.getByRole('radio', { name }) as HTMLInputElement;

/** Stands in for the phone's light or dark setting, which tests can switch. */
function fakeSystem(dark: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: dark,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', () => query);
  return {
    switchTo(nowDark: boolean) {
      query.matches = nowDark;
      for (const listener of listeners) listener();
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = '<meta name="theme-color" content="#fafaf9" />';
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveTheme', () => {
  it('follows the phone under System, and otherwise the choice', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('the theme', () => {
  it('starts on System, following the phone, and sets the status bar colour', () => {
    fakeSystem(true);
    applyTheme();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')).toHaveProperty('content', '#0c0a09');
  });

  it('follows the phone switching mode under System, but not under a fixed choice', () => {
    const system = fakeSystem(false);
    const stop = followSystemTheme();
    applyTheme();
    system.switchTo(true);
    expect(document.documentElement.dataset.theme).toBe('dark');

    localStorage.setItem(themeStorageKey, 'light');
    applyTheme();
    system.switchTo(false);
    system.switchTo(true);
    expect(document.documentElement.dataset.theme).toBe('light');
    stop();
  });

  it('tells listeners the new mode', () => {
    fakeSystem(false);
    const seen: string[] = [];
    const stop = onThemeChange((theme) => seen.push(theme));
    applyTheme('dark');
    applyTheme('light');
    stop();
    applyTheme('dark');
    expect(seen).toEqual(['dark', 'light']);
  });
});

describe('AppearanceSetting', () => {
  it('saves a choice for this device and shows it straight away', () => {
    fakeSystem(false);
    render(<AppearanceSetting />);
    expect(radio(/System/).checked).toBe(true);

    fireEvent.click(radio('Dark'));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(themeStorageKey)).toBe('dark');

    fireEvent.click(radio(/System/));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(themeStorageKey)).toBeNull();
  });

  it('shows the saved choice when opened again', () => {
    fakeSystem(false);
    localStorage.setItem(themeStorageKey, 'light');
    render(<AppearanceSetting />);
    expect(radio('Light').checked).toBe(true);
  });
});
