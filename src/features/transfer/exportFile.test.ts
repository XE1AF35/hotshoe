import { describe, expect, it } from 'vitest';
import { addEntry } from '../../db/entries.ts';
import { addPhoto } from '../../db/photos.ts';
import { addTrip } from '../../db/trips.ts';
import { createTestDb, jpegBlob, newEntryInput } from '../../test/db.ts';
import { createExport, slug } from './exportFile.ts';

const now = Date.parse('2026-10-14T03:12:45Z');

describe('createExport', () => {
  it("exports one trip's entries with their photo names, or everything", async () => {
    const db = createTestDb();
    const trip = await addTrip(db, 'Waiheke Island');
    const onTrip = await addEntry(db, newEntryInput({ tripId: trip.id }));
    await addEntry(db, newEntryInput({ lat: 10 }));
    const later = await addPhoto(db, {
      entryId: onTrip.id,
      takenAt: 2000,
      source: 'camera',
      image: jpegBlob(400),
      thumb: jpegBlob(40),
      width: 4,
      height: 3,
    });
    const earlier = await addPhoto(db, {
      entryId: onTrip.id,
      takenAt: 1000,
      source: 'library',
      image: jpegBlob(400),
      thumb: jpegBlob(40),
      width: 4,
      height: 3,
    });

    const tripExport = await createExport(db, { format: 'geojson', scope: trip.id, now });
    expect(tripExport.entries).toBe(1);
    expect(tripExport.file.name).toMatch(/^hotshoe-waiheke-island-\d{8}\.geojson$/);
    expect(tripExport.file.type).toBe('application/geo+json');
    const json = JSON.parse(await tripExport.file.text());
    expect(json.features[0].properties).toMatchObject({
      trip: 'Waiheke Island',
      photos: [`${earlier.id}.jpg`, `${later.id}.jpg`],
    });

    const all = await createExport(db, { format: 'gpx', scope: 'all', now });
    expect(all.entries).toBe(2);
    expect(all.file.name).toMatch(/^hotshoe-all-\d{8}\.gpx$/);
  });
});

describe('slug', () => {
  it.each([
    ['Waiheke Island', 'waiheke-island'],
    ['Ōtaki & Kāpiti!', 'otaki-kapiti'],
    ['日本', 'trip'],
    ['  --  ', 'trip'],
  ])('turns %j into %j', (name, expected) => {
    expect(slug(name)).toBe(expected);
  });
});
