/**
 * Light or dark mode. The choice is a setting for this device, kept in localStorage rather than
 * the database so public/theme-init.js can read it before the page is drawn. Without a choice,
 * the phone's own setting decides ("System").
 */
export type ThemeChoice = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const themeStorageKey = 'hotshoe-theme';
const changeEvent = 'hotshoe:themechange';

/** The page background in each mode, the same as --surface in index.css, for the status bar. */
const surface: Record<Theme, string> = { light: '#fafaf9', dark: '#0c0a09' };

function systemDark(): MediaQueryList {
  return window.matchMedia('(prefers-color-scheme: dark)');
}

export function getThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(themeStorageKey);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    // Storage can be blocked, such as in some private windows.
    return 'system';
  }
}

export function resolveTheme(choice: ThemeChoice, systemIsDark: boolean): Theme {
  if (choice !== 'system') return choice;
  return systemIsDark ? 'dark' : 'light';
}

/** The mode on screen now. */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** Puts a choice on screen, and tells anything drawn in its own colours, such as the map. */
export function applyTheme(choice: ThemeChoice = getThemeChoice()): void {
  const theme = resolveTheme(choice, systemDark().matches);
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', surface[theme]);
  window.dispatchEvent(new Event(changeEvent));
}

/** Saves a choice for this device and puts it on screen. */
export function setThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(themeStorageKey);
    else localStorage.setItem(themeStorageKey, choice);
  } catch {
    // Not saved, but still used until the app is closed.
  }
  applyTheme(choice);
}

/** Calls back with the new mode whenever it changes. Returns a function that stops it. */
export function onThemeChange(callback: (theme: Theme) => void): () => void {
  const listener = () => callback(currentTheme());
  window.addEventListener(changeEvent, listener);
  return () => window.removeEventListener(changeEvent, listener);
}

/** Keeps System in step when the phone switches mode, such as at sunset. Call once at start. */
export function followSystemTheme(): () => void {
  const query = systemDark();
  const listener = () => {
    if (getThemeChoice() === 'system') applyTheme('system');
  };
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
