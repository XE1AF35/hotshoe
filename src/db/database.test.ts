import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { jpegBlob } from '../test/db.ts';
import { HotshoeDb } from './database.ts';
import { listEntries } from './entries.ts';
import { listPhotos, totalPhotoBytes } from './photos.ts';
import type { EntryId, TripId } from './schema.ts';

describe('HotshoeDb upgrades', () => {
  it('opens a version 1 database without losing anything', async () => {
    const name = `test-v1-${crypto.randomUUID()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({
      entries: 'id, loggedAt, tripId, [tripId+loggedAt], updatedAt',
      trips: 'id, name, createdAt',
      photos: 'id, entryId, [entryId+takenAt]',
      meta: 'key',
    });
    await v1.table('entries').add({
      id: 'e1',
      loggedAt: 1000,
      fixAt: 1000,
      timeZone: 'Pacific/Auckland',
      utcOffsetMin: 780,
      lat: -36.8,
      lon: 174.7,
      accuracyM: 5,
      altitudeM: null,
      altitudeAccuracyM: null,
      label: 'Wharf',
      frame: null,
      tripId: null,
      source: 'gps',
      createdAt: 1000,
      updatedAt: 1000,
    });
    await v1.table('trips').add({
      id: 't1',
      name: 'Waiheke',
      createdAt: 500,
      updatedAt: 500,
      archivedAt: null,
    });
    await v1.table('photos').add({
      id: 'p1',
      entryId: 'e1',
      takenAt: 900,
      source: 'camera',
      image: await jpegBlob(500).arrayBuffer(),
      thumb: await jpegBlob(50).arrayBuffer(),
      width: 4,
      height: 3,
      bytes: 550,
      createdAt: 1000,
    });
    v1.close();

    const db = new HotshoeDb(name);
    try {
      expect((await listEntries(db)).map((entry) => entry.label)).toEqual(['Wharf']);
      expect(await listPhotos(db, 'e1' as EntryId)).toHaveLength(1);
      expect(await totalPhotoBytes(db)).toBe(550);
      expect(db.verno).toBe(5);
      expect((await db.trips.get('t1' as TripId))?.cameraClock).toBeNull();
      const entry = await db.entries.get('e1' as EntryId);
      expect(entry?.origin).toBe('logged');
      expect(entry?.accuracyM).toBe(5);
      expect(entry).not.toHaveProperty('source');
    } finally {
      await db.delete();
    }
  });
});
