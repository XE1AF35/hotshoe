import type { HotshoeDb } from './database.ts';
import {
  InvalidInputError,
  MissingRecordError,
  normaliseText,
  withStorageErrors,
} from './errors.ts';
import { type CameraClock, limits, newTripId, type Trip, type TripId } from './schema.ts';

/** Kept in meta under the key it had as a setting, so no migration was needed. */
const activeTripKey = 'activeTripId';

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
    cameraClock: null,
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
    // Settled first too, so an archived trip an older version left active can't come back here.
    await settleActiveTrip(db);
    const updated = await updateTrip(db, id, (trip) => ({
      ...trip,
      archivedAt: archived ? (trip.archivedAt ?? now) : null,
      updatedAt: now,
    }));
    if (archived) await settleActiveTrip(db);
    return updated;
  });
}

/** Records how the trip's camera clock differs, or clears it with null. */
export async function setCameraClock(
  db: HotshoeDb,
  id: TripId,
  cameraClock: CameraClock | null,
  now = Date.now(),
): Promise<Trip> {
  return updateTrip(db, id, (trip) => ({ ...trip, cameraClock, updatedAt: now }));
}

/** Deletes a trip. Its entries are kept and become trip-less. */
export async function deleteTrip(db: HotshoeDb, id: TripId, now = Date.now()): Promise<void> {
  await withStorageErrors(() =>
    db.transaction('rw', db.trips, db.entries, db.meta, async () => {
      await db.entries.where('tripId').equals(id).modify({ tripId: null, updatedAt: now });
      await db.trips.delete(id);
      await settleActiveTrip(db);
    }),
  );
}

/**
 * The trip new entries join, or null. It is always a trip that exists and isn't archived: a
 * stored id that no longer meets that is read as none.
 */
export async function activeTrip(db: HotshoeDb): Promise<Trip | null> {
  const id = await storedActiveTripId(db);
  const trip = id === null ? undefined : await db.trips.get(id);
  return trip !== undefined && isOpen(trip) ? trip : null;
}

/** Makes a trip the active one, or clears it with null. Refuses a missing or archived trip. */
export async function setActiveTrip(db: HotshoeDb, id: TripId | null): Promise<void> {
  await withStorageErrors(() =>
    db.transaction('rw', db.trips, db.meta, async () => {
      if (id !== null) await assertTripOpen(db, id);
      await db.meta.put({ key: activeTripKey, value: id });
    }),
  );
}

/**
 * Clears the active trip if it no longer exists or has been archived, so unarchiving never brings
 * it back. Call it inside any transaction, over trips and meta, that can remove or archive trips.
 */
export async function settleActiveTrip(db: HotshoeDb): Promise<void> {
  const id = await storedActiveTripId(db);
  if (id === null) return;
  const trip = await db.trips.get(id);
  if (trip === undefined || !isOpen(trip)) await db.meta.put({ key: activeTripKey, value: null });
}

/** Throws unless the trip exists and isn't archived, so new entries can join it. */
export async function assertTripOpen(db: HotshoeDb, id: TripId): Promise<void> {
  const trip = await db.trips.get(id);
  if (trip === undefined) throw new MissingRecordError(`Trip ${id} does not exist.`);
  if (!isOpen(trip)) throw new InvalidInputError(`Trip ${id} is archived.`);
}

const isOpen = (trip: Trip): boolean => trip.archivedAt === null;

async function storedActiveTripId(db: HotshoeDb): Promise<TripId | null> {
  const row = await db.meta.get(activeTripKey);
  return typeof row?.value === 'string' ? (row.value as TripId) : null;
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
