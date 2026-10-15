import Dexie from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { useDb } from '../../db/DbProvider.tsx';
import type { TripId } from '../../db/schema.ts';
import { summariseTrip, type TripSummary } from './summary.ts';

/** A trip's summary, kept up to date. Undefined while loading. */
export function useTripSummary(tripId: TripId, accuracyTargetM: number): TripSummary | undefined {
  const db = useDb();
  return useLiveQuery(async () => {
    const entries = await db.entries
      .where('[tripId+loggedAt]')
      .between([tripId, Dexie.minKey], [tripId, Dexie.maxKey])
      .toArray();
    // Keys only: reading the photos themselves would load every image.
    const photoIds =
      entries.length === 0
        ? []
        : await db.photos
            .where('entryId')
            .anyOf(entries.map((entry) => entry.id))
            .primaryKeys();
    return summariseTrip(entries, photoIds.length, accuracyTargetM);
  }, [db, tripId, accuracyTargetM]);
}
