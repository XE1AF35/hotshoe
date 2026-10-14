import { useSyncExternalStore } from 'react';

/**
 * Hash routes keep the app a single static page, which suits GitHub Pages and offline use, and
 * keep the back button working between tabs.
 */
export const tabs = ['log', 'entries', 'map', 'more'] as const;
export type Tab = (typeof tabs)[number];

export function parseTab(hash: string): Tab {
  const name = hash.replace(/^#\/?/, '').split('/')[0] ?? '';
  return (tabs as readonly string[]).includes(name) ? (name as Tab) : 'log';
}

export function tabHref(tab: Tab): string {
  return `#/${tab}`;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useTab(): Tab {
  return useSyncExternalStore(subscribe, () => parseTab(window.location.hash));
}
