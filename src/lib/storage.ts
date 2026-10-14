import type { PersistResult } from '../db/settings.ts';

/**
 * Asks the browser not to clear Hotshoe's data under storage pressure. WebKit decides by its own
 * rules, which favour Home Screen apps, so this is a request rather than a guarantee.
 */
export async function requestPersistence(): Promise<PersistResult> {
  if (typeof navigator.storage?.persist !== 'function') return 'unsupported';
  try {
    if (await navigator.storage.persisted()) return 'granted';
    return (await navigator.storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}
