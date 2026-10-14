import { isValidLatLon, type LatLon } from '../lib/coords.ts';
import type { TimeContext } from '../lib/time.ts';
import type { HotshoeDb } from './database.ts';
import {
  InvalidInputError,
  MissingRecordError,
  normaliseText,
  withStorageErrors,
} from './errors.ts';
import { type Entry, type EntryId, limits, newEntryId, type Photo, type TripId } from './schema.ts';

export interface NewEntry extends LatLon, TimeContext {
  readonly loggedAt: number;
  readonly fixAt: number;
  readonly accuracyM: number;
  readonly altitudeM: number | null;
  readonly altitudeAccuracyM: number | null;
  readonly label?: string | null;
  readonly frame?: string | null;
  readonly tripId: TripId | null;
}

export interface EntryPatch {
  readonly label?: string | null;
  readonly frame?: string | null;
  readonly tripId?: TripId | null;
}

/** Everything removed by deleteEntry, so the delete can be undone. */
export interface DeletedEntry {
  readonly entry: Entry;
  readonly photos: readonly Photo[];
}

export async function addEntry(db: HotshoeDb, input: NewEntry, now = Date.now()): Promise<Entry> {
  if (!isValidLatLon(input)) {
    throw new InvalidInputError('Latitude or longitude is out of range.');
  }
  if (!Number.isFinite(input.accuracyM) || input.accuracyM < 0) {
    throw new InvalidInputError('Accuracy must be zero or more metres.');
  }

  const entry: Entry = {
    id: newEntryId(),
    loggedAt: input.loggedAt,
    fixAt: input.fixAt,
    timeZone: input.timeZone,
    utcOffsetMin: input.utcOffsetMin,
    lat: input.lat,
    lon: input.lon,
    accuracyM: input.accuracyM,
    altitudeM: input.altitudeM,
    altitudeAccuracyM: input.altitudeAccuracyM,
    label: normaliseText(input.label, limits.labelLength, 'Label'),
    frame: normaliseText(input.frame, limits.frameLength, 'Frame'),
    tripId: input.tripId,
    source: 'gps',
    createdAt: now,
    updatedAt: now,
  };

  await withStorageErrors(() =>
    db.transaction('rw', db.entries, db.trips, async () => {
      await assertTripExists(db, entry.tripId);
      await db.entries.add(entry);
    }),
  );
  return entry;
}

export async function updateEntry(
  db: HotshoeDb,
  id: EntryId,
  patch: EntryPatch,
  now = Date.now(),
): Promise<Entry> {
  const changes: { -readonly [K in keyof Entry]?: Entry[K] } = { updatedAt: now };
  if (patch.label !== undefined) {
    changes.label = normaliseText(patch.label, limits.labelLength, 'Label');
  }
  if (patch.frame !== undefined) {
    changes.frame = normaliseText(patch.frame, limits.frameLength, 'Frame');
  }
  if (patch.tripId !== undefined) {
    changes.tripId = patch.tripId;
  }

  return withStorageErrors(() =>
    db.transaction('rw', db.entries, db.trips, async () => {
      const current = await db.entries.get(id);
      if (!current) throw new MissingRecordError(`Entry ${id} does not exist.`);
      if (changes.tripId !== undefined) await assertTripExists(db, changes.tripId);
      const updated: Entry = { ...current, ...changes };
      await db.entries.put(updated);
      return updated;
    }),
  );
}

/** Deletes an entry and its photos together. Returns what was removed, or null if nothing was. */
export async function deleteEntry(db: HotshoeDb, id: EntryId): Promise<DeletedEntry | null> {
  return db.transaction('rw', db.entries, db.photos, async () => {
    const entry = await db.entries.get(id);
    if (!entry) return null;
    const photos = await db.photos.where('entryId').equals(id).toArray();
    await db.photos.bulkDelete(photos.map((photo) => photo.id));
    await db.entries.delete(id);
    return { entry, photos };
  });
}

/** Puts back an entry removed by deleteEntry. Its trip is dropped if that trip has since gone. */
export async function restoreEntry(db: HotshoeDb, deleted: DeletedEntry): Promise<void> {
  await withStorageErrors(() =>
    db.transaction('rw', db.entries, db.photos, db.trips, async () => {
      const { entry, photos } = deleted;
      const tripStillExists =
        entry.tripId === null || (await db.trips.get(entry.tripId)) !== undefined;
      await db.entries.put(tripStillExists ? entry : { ...entry, tripId: null });
      await db.photos.bulkPut([...photos]);
    }),
  );
}

/** All entries, newest first. */
export function listEntries(db: HotshoeDb): Promise<Entry[]> {
  return db.entries.orderBy('loggedAt').reverse().toArray();
}

/** Entries added or edited after `since`, for the backup reminder. */
export function countEntriesChangedSince(db: HotshoeDb, since: number): Promise<number> {
  return db.entries.where('updatedAt').above(since).count();
}

async function assertTripExists(db: HotshoeDb, tripId: TripId | null): Promise<void> {
  if (tripId !== null && (await db.trips.get(tripId)) === undefined) {
    throw new MissingRecordError(`Trip ${tripId} does not exist.`);
  }
}
