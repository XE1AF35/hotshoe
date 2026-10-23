import { useLiveQuery } from 'dexie-react-hooks';
import { useDb } from './DbProvider.tsx';
import { listEntries } from './entries.ts';
import { listPhotos, totalPhotoBytes } from './photos.ts';
import type { Entry, EntryId, Photo, Trip, TripId } from './schema.ts';
import { activeTrip, listTrips } from './trips.ts';

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

/** The trip new entries join, null when there is none. Undefined while loading. */
export function useActiveTrip(): Trip | null | undefined {
  const db = useDb();
  return useLiveQuery(() => activeTrip(db), [db]);
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

/** An entry's photos, oldest first. Undefined while loading. */
export function usePhotos(entryId: EntryId): Photo[] | undefined {
  const db = useDb();
  return useLiveQuery(() => listPhotos(db, entryId), [db, entryId]);
}

/** How many photos each entry has, read from the index alone. Undefined while loading. */
export function usePhotoCounts(): Map<EntryId, number> | undefined {
  const db = useDb();
  return useLiveQuery(async () => {
    const counts = new Map<EntryId, number>();
    await db.photos.orderBy('entryId').eachKey((key) => {
      const entryId = key as EntryId;
      counts.set(entryId, (counts.get(entryId) ?? 0) + 1);
    });
    return counts;
  }, [db]);
}

/** How much Hotshoe holds, for the storage readout. Undefined while loading. */
export function useStoredCounts():
  | { entries: number; photos: number; photoBytes: number }
  | undefined {
  const db = useDb();
  return useLiveQuery(async () => {
    const [entries, photos, photoBytes] = await Promise.all([
      db.entries.count(),
      db.photos.count(),
      totalPhotoBytes(db),
    ]);
    return { entries, photos, photoBytes };
  }, [db]);
}
