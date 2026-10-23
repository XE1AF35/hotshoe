import { describe, expect, it } from 'vitest';
import { createTestDb, newEntryInput } from '../test/db.ts';
import { addEntry } from './entries.ts';
import { InvalidInputError, MissingRecordError } from './errors.ts';
import type { TripId } from './schema.ts';
import {
  activeTrip,
  addTrip,
  deleteTrip,
  listTrips,
  renameTrip,
  setActiveTrip,
  setTripArchived,
} from './trips.ts';

describe('addTrip and renameTrip', () => {
  it('trims names and rejects blank or over-long ones', async () => {
    const db = createTestDb();
    expect((await addTrip(db, '  South Island  ')).name).toBe('South Island');
    await expect(addTrip(db, '   ')).rejects.toBeInstanceOf(InvalidInputError);
    await expect(addTrip(db, 'x'.repeat(81))).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('renames a trip', async () => {
    const db = createTestDb();
    const trip = await addTrip(db, 'Souht Island', 1000);
    const renamed = await renameTrip(db, trip.id, 'South Island', 2000);
    expect(renamed).toEqual({ ...trip, name: 'South Island', updatedAt: 2000 });
  });

  it('fails to rename a missing trip', async () => {
    const db = createTestDb();
    await expect(renameTrip(db, 'missing' as TripId, 'x')).rejects.toBeInstanceOf(
      MissingRecordError,
    );
  });
});

describe('setTripArchived', () => {
  it('archives and unarchives, clearing the active trip when archived', async () => {
    const db = createTestDb();
    const trip = await addTrip(db, 'Coromandel');
    await setActiveTrip(db, trip.id);

    const archived = await setTripArchived(db, trip.id, true, 5000);
    expect(archived.archivedAt).toBe(5000);
    expect(await activeTrip(db)).toBeNull();

    expect((await setTripArchived(db, trip.id, false)).archivedAt).toBeNull();
    expect(await activeTrip(db)).toBeNull();
  });

  it('keeps the original archive time when archived twice', async () => {
    const db = createTestDb();
    const trip = await addTrip(db, 'Coromandel');
    await setTripArchived(db, trip.id, true, 5000);
    expect((await setTripArchived(db, trip.id, true, 6000)).archivedAt).toBe(5000);
  });
});

describe('deleteTrip', () => {
  it('keeps the entries, removes them from the trip, and clears the active trip', async () => {
    const db = createTestDb();
    const trip = await addTrip(db, 'Coromandel');
    const other = await addTrip(db, 'Northland');
    await setActiveTrip(db, trip.id);
    const inTrip = await addEntry(db, newEntryInput({ tripId: trip.id }), 1000);
    const inOther = await addEntry(db, newEntryInput({ tripId: other.id }), 1000);

    await deleteTrip(db, trip.id, 2000);

    expect(await db.trips.get(trip.id)).toBeUndefined();
    expect(await db.entries.get(inTrip.id)).toMatchObject({ tripId: null, updatedAt: 2000 });
    expect(await db.entries.get(inOther.id)).toEqual(inOther);
    expect(await activeTrip(db)).toBeNull();
  });
});

describe('setActiveTrip and activeTrip', () => {
  it('sets and clears the active trip', async () => {
    const db = createTestDb();
    const trip = await addTrip(db, 'Coromandel');
    expect(await activeTrip(db)).toBeNull();

    await setActiveTrip(db, trip.id);
    expect(await activeTrip(db)).toEqual(trip);

    await setActiveTrip(db, null);
    expect(await activeTrip(db)).toBeNull();
  });

  it('refuses a missing or archived trip', async () => {
    const db = createTestDb();
    const trip = await addTrip(db, 'Coromandel');
    const archived = await addTrip(db, 'Northland');
    await setTripArchived(db, archived.id, true);
    await setActiveTrip(db, trip.id);

    await expect(setActiveTrip(db, 'missing' as TripId)).rejects.toBeInstanceOf(MissingRecordError);
    await expect(setActiveTrip(db, archived.id)).rejects.toBeInstanceOf(InvalidInputError);
    expect(await activeTrip(db)).toEqual(trip);
  });

  it('returns null for a stored id whose trip has gone', async () => {
    const db = createTestDb();
    // As an older version could leave it, before the trips module owned the setting.
    await db.meta.put({ key: 'activeTripId', value: 'missing' });
    expect(await activeTrip(db)).toBeNull();
  });

  it('does not bring back an archived trip an older version left active', async () => {
    const db = createTestDb();
    const trip = await addTrip(db, 'Coromandel');
    await setTripArchived(db, trip.id, true);
    await db.meta.put({ key: 'activeTripId', value: trip.id });
    expect(await activeTrip(db)).toBeNull();

    await setTripArchived(db, trip.id, false);
    expect(await activeTrip(db)).toBeNull();
  });
});

describe('listTrips', () => {
  it('lists newest first', async () => {
    const db = createTestDb();
    await addTrip(db, 'Older', 1000);
    await addTrip(db, 'Newer', 2000);
    expect((await listTrips(db)).map((trip) => trip.name)).toEqual(['Newer', 'Older']);
  });
});
