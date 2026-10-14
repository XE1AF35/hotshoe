import type { HotshoeDb } from './database.ts';
import {
  InvalidInputError,
  MissingRecordError,
  normaliseText,
  withStorageErrors,
} from './errors.ts';
import { limits, newTripId, type Trip, type TripId } from './schema.ts';
import { getSetting, setSetting } from './settings.ts';

function tripName(name: string): string {
  const normalised = normaliseText(name, limits.tripNameLength, 'Trip name');
  if (normalised === null) throw new InvalidInputError('Trip name cannot be blank.');
  return normalised;
}

export async function addTrip(db: HotshoeDb, name: string, now = Date.now()): Promise<Trip> {
  const trip: Trip = {
    id: newTripId(),
    name: tripName(name),
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
  await withStorageErrors(() => db.trips.add(trip));
  return trip;
}

export async function renameTrip(
  db: HotshoeDb,
  id: TripId,
  name: string,
  now = Date.now(),
): Promise<Trip> {
  const newName = tripName(name);
  return updateTrip(db, id, (trip) => ({ ...trip, name: newName, updatedAt: now }));
}

/** Archived trips drop out of pickers but keep their entries. Archiving the active trip clears it. */
export async function setTripArchived(
  db: HotshoeDb,
  id: TripId,
  archived: boolean,
  now = Date.now(),
): Promise<Trip> {
  return db.transaction('rw', db.trips, db.meta, async () => {
    const updated = await updateTrip(db, id, (trip) => ({
      ...trip,
      archivedAt: archived ? (trip.archivedAt ?? now) : null,
      updatedAt: now,
    }));
    if (archived) await clearActiveTripIf(db, id);
    return updated;
  });
}

/** Deletes a trip. Its entries are kept and become trip-less. */
export async function deleteTrip(db: HotshoeDb, id: TripId, now = Date.now()): Promise<void> {
  await withStorageErrors(() =>
    db.transaction('rw', db.trips, db.entries, db.meta, async () => {
      await db.entries.where('tripId').equals(id).modify({ tripId: null, updatedAt: now });
      await db.trips.delete(id);
      await clearActiveTripIf(db, id);
    }),
  );
}

/** All trips, newest first. */
export function listTrips(db: HotshoeDb): Promise<Trip[]> {
  return db.trips.orderBy('createdAt').reverse().toArray();
}

async function updateTrip(db: HotshoeDb, id: TripId, change: (trip: Trip) => Trip): Promise<Trip> {
  return withStorageErrors(() =>
    db.transaction('rw', db.trips, async () => {
      const current = await db.trips.get(id);
      if (!current) throw new MissingRecordError(`Trip ${id} does not exist.`);
      const updated = change(current);
      await db.trips.put(updated);
      return updated;
    }),
  );
}

async function clearActiveTripIf(db: HotshoeDb, id: TripId): Promise<void> {
  if ((await getSetting(db, 'activeTripId')) === id) {
    await setSetting(db, 'activeTripId', null);
  }
}
