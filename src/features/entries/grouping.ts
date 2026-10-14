import type { Entry, Trip, TripId } from '../../db/schema.ts';
import { type DayKey, localDayKey } from '../../lib/time.ts';

export interface TripGroup {
  /** null for entries with no trip. */
  readonly trip: Trip | null;
  /** Newest first. */
  readonly entries: readonly Entry[];
}

export interface DayGroup {
  readonly day: DayKey;
  /** Ordered by each group's newest entry, newest first. */
  readonly trips: readonly TripGroup[];
}

/**
 * Groups entries by the local day they were logged on (in the zone where they were logged),
 * then by trip. Days are newest first. Entries pointing at a missing trip count as having none.
 */
export function groupByDayAndTrip(
  entries: readonly Entry[],
  trips: ReadonlyMap<TripId, Trip>,
): DayGroup[] {
  const newestFirst = [...entries].sort((a, b) => b.loggedAt - a.loggedAt);
  const days = new Map<DayKey, Map<TripId | null, Entry[]>>();

  for (const entry of newestFirst) {
    const day = localDayKey(entry.loggedAt, entry);
    const tripId = entry.tripId !== null && trips.has(entry.tripId) ? entry.tripId : null;

    let byTrip = days.get(day);
    if (!byTrip) {
      byTrip = new Map();
      days.set(day, byTrip);
    }
    const group = byTrip.get(tripId);
    if (group) {
      group.push(entry);
    } else {
      byTrip.set(tripId, [entry]);
    }
  }

  // Entries were visited newest first, so insertion order already gives newest-first groups.
  // Days are sorted explicitly because local days need not follow UTC order across zones.
  return [...days]
    .map(([day, byTrip]) => ({
      day,
      trips: [...byTrip].map(([tripId, groupEntries]) => ({
        trip: tripId === null ? null : (trips.get(tripId) ?? null),
        entries: groupEntries,
      })),
    }))
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}
