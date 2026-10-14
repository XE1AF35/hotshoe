import { useLiveQuery } from 'dexie-react-hooks';
import { useDb } from './DbProvider.tsx';
import type { Entry } from './schema.ts';
import { getSettings, type Settings } from './settings.ts';

/** All settings, kept up to date. Undefined while loading. */
export function useSettings(): Settings | undefined {
  const db = useDb();
  return useLiveQuery(() => getSettings(db), [db]);
}

/** The most recently logged entry, null when there are none. Undefined while loading. */
export function useLatestEntry(): Entry | null | undefined {
  const db = useDb();
  return useLiveQuery(async () => (await db.entries.orderBy('loggedAt').last()) ?? null, [db]);
}
