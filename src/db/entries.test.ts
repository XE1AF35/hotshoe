import { describe, expect, it } from 'vitest';
import { createTestDb, jpegBlob, newEntryInput } from '../test/db.ts';
import { addEntry, deleteEntry, listEntries, restoreEntry, updateEntry } from './entries.ts';
import { InvalidInputError, MissingRecordError } from './errors.ts';
import { addPhoto, listPhotos } from './photos.ts';
import type { EntryId, TripId } from './schema.ts';
import { addTrip, deleteTrip, setActiveTrip, setTripArchived } from './trips.ts';

describe('addEntry', () => {
  it('stores the entry with tidy text and timestamps', async () => {
    const db = createTestDb();
    const entry = await addEntry(db, newEntryInput({ label: '  Wharf  ', frame: '' }), 1000);

    expect(entry).toMatchObject({ label: 'Wharf', frame: null, createdAt: 1000, updatedAt: 1000 });
    expect(await db.entries.get(entry.id)).toEqual(entry);
  });

  it('rejects coordinates out of range', async () => {
    const db = createTestDb();
    await expect(addEntry(db, newEntryInput({ lat: 91 }))).rejects.toBeInstanceOf(
      InvalidInputError,
    );
    expect(await db.entries.count()).toBe(0);
  });

  it('rejects negative accuracy and over-long text', async () => {
    const db = createTestDb();
    await expect(addEntry(db, newEntryInput({ accuracyM: -1 }))).rejects.toThrow('Accuracy');
    await expect(addEntry(db, newEntryInput({ frame: 'x'.repeat(41) }))).rejects.toThrow('Frame');
  });

  it('rejects a trip that does not exist', async () => {
    const db = createTestDb();
    const tripId = 'missing' as TripId;
    await expect(addEntry(db, newEntryInput({ tripId }))).rejects.toBeInstanceOf(
      MissingRecordError,
    );
  });

  it('joins the active trip when given no trip, and none when given null', async () => {
    const db = createTestDb();
    const trip = await addTrip(db, 'Coromandel');
    expect((await addEntry(db, newEntryInput())).tripId).toBeNull();

    await setActiveTrip(db, trip.id);
    expect((await addEntry(db, newEntryInput())).tripId).toBe(trip.id);
    expect((await addEntry(db, newEntryInput({ tripId: null }))).tripId).toBeNull();
  });

  it('rejects an archived trip', async () => {
    const db = createTestDb();
    const trip = await addTrip(db, 'Coromandel');
    await setTripArchived(db, trip.id, true);
    await expect(addEntry(db, newEntryInput({ tripId: trip.id }))).rejects.toBeInstanceOf(
      InvalidInputError,
    );
    expect(await db.entries.count()).toBe(0);
  });
});

describe('updateEntry', () => {
  it('changes only the given fields and bumps updatedAt', async () => {
    const db = createTestDb();
    const trip = await addTrip(db, 'Coromandel');
    const entry = await addEntry(db, newEntryInput({ label: 'Wharf', frame: '12' }), 1000);

    const updated = await updateEntry(db, entry.id, { frame: '12A', tripId: trip.id }, 2000);

    expect(updated).toEqual({ ...entry, frame: '12A', tripId: trip.id, updatedAt: 2000 });
    expect(await db.entries.get(entry.id)).toEqual(updated);
  });

  it('clears a field set to null', async () => {
    const db = createTestDb();
    const entry = await addEntry(db, newEntryInput({ label: 'Wharf' }));
    expect((await updateEntry(db, entry.id, { label: null })).label).toBeNull();
  });

  it('fails for a missing entry', async () => {
    const db = createTestDb();
    await expect(updateEntry(db, 'missing' as EntryId, { label: 'x' })).rejects.toBeInstanceOf(
      MissingRecordError,
    );
  });
});

describe('deleteEntry and restoreEntry', () => {
  it('removes the entry with its photos, and undo puts both back', async () => {
    const db = createTestDb();
    const entry = await addEntry(db, newEntryInput());
    await addPhoto(db, {
      entryId: entry.id,
      takenAt: entry.loggedAt,
      source: 'camera',
      image: jpegBlob(500),
      thumb: jpegBlob(50),
      width: 1600,
      height: 1200,
    });

    const deleted = await deleteEntry(db, entry.id);
    expect(deleted?.photos).toHaveLength(1);
    expect(await db.entries.count()).toBe(0);
    expect(await db.photos.count()).toBe(0);

    if (!deleted) throw new Error('Expected the entry to be deleted');
    await restoreEntry(db, deleted);
    expect(await db.entries.get(entry.id)).toEqual(entry);
    expect(await listPhotos(db, entry.id)).toHaveLength(1);
  });

  it('returns null when there is nothing to delete', async () => {
    const db = createTestDb();
    expect(await deleteEntry(db, 'missing' as EntryId)).toBeNull();
  });

  it('restores without the trip if the trip was deleted in the meantime', async () => {
    const db = createTestDb();
    const trip = await addTrip(db, 'Coromandel');
    const entry = await addEntry(db, newEntryInput({ tripId: trip.id }));
    const deleted = await deleteEntry(db, entry.id);
    await deleteTrip(db, trip.id);

    if (!deleted) throw new Error('Expected the entry to be deleted');
    await restoreEntry(db, deleted);
    expect((await db.entries.get(entry.id))?.tripId).toBeNull();
  });
});

describe('listEntries', () => {
  it('lists newest first', async () => {
    const db = createTestDb();
    await addEntry(db, newEntryInput({ loggedAt: 1, label: 'first' }));
    await addEntry(db, newEntryInput({ loggedAt: 3, label: 'third' }));
    await addEntry(db, newEntryInput({ loggedAt: 2, label: 'second' }));

    expect((await listEntries(db)).map((entry) => entry.label)).toEqual([
      'third',
      'second',
      'first',
    ]);
  });
});
