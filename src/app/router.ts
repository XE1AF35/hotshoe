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

/** What follows the tab in the hash, such as the entry in `#/map/<entry id>`, or null. */
export function parseDetail(hash: string): string | null {
  const detail = hash.replace(/^#\/?/, '').split('/')[1];
  if (!detail) return null;
  try {
    return decodeURIComponent(detail);
  } catch {
    // A hand-typed hash with a broken escape such as %E0.
    return null;
  }
}

export function detailHref(tab: Tab, detail: string): string {
  return `#/${tab}/${encodeURIComponent(detail)}`;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useTab(): Tab {
  return useSyncExternalStore(subscribe, () => parseTab(window.location.hash));
}

export function useDetail(): string | null {
  return useSyncExternalStore(subscribe, () => parseDetail(window.location.hash));
}
