import { useLiveQuery } from 'dexie-react-hooks';
import { useDb } from './DbProvider.tsx';
import { listEntries } from './entries.ts';
import type { Entry, Trip, TripId } from './schema.ts';
import { getSettings, type Settings } from './settings.ts';
import { listTrips } from './trips.ts';

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

/** All entries, newest first. Undefined while loading. */
export function useEntries(): Entry[] | undefined {
  const db = useDb();
  return useLiveQuery(() => listEntries(db), [db]);
}

/** All trips, newest first, archived ones included. Undefined while loading. */
export function useTrips(): Trip[] | undefined {
  const db = useDb();
  return useLiveQuery(() => listTrips(db), [db]);
}

/** How many entries each trip has. Undefined while loading. */
export function useTripEntryCounts(): Map<TripId, number> | undefined {
  const db = useDb();
  return useLiveQuery(async () => {
    const counts = new Map<TripId, number>();
    // Reads only the index. Entries without a trip are not in it, as null is not a valid key.
    await db.entries.orderBy('tripId').eachKey((key) => {
      const tripId = key as TripId;
      counts.set(tripId, (counts.get(tripId) ?? 0) + 1);
    });
    return counts;
  }, [db]);
}
