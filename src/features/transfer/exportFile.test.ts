import { describe, expect, it } from 'vitest';
import { addEntry } from '../../db/entries.ts';
import { addPhoto } from '../../db/photos.ts';
import type { EntryId } from '../../db/schema.ts';
import { addTrip, setCameraClock } from '../../db/trips.ts';
import { createTestDb, jpegBlob, newEntryInput } from '../../test/db.ts';
import { buildExport, cameraClockFor, readExportSource, slug } from './exportFile.ts';

const now = Date.parse('2026-10-14T03:12:45Z');
// The camera is on Auckland time (UTC+13) and runs 2 min 4 s fast.
const cameraClock = { offsetS: 46_800 + 124, phoneUtcOffsetMin: 780, measuredAt: 0 };

describe('readExportSource and buildExport', () => {
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

    const tripExport = buildExport(await readExportSource(db, trip.id), { format: 'geojson', now });
    expect(tripExport.entries).toBe(1);
    expect(tripExport.file.name).toMatch(/^hotshoe-waiheke-island-\d{8}\.geojson$/);
    expect(tripExport.file.type).toBe('application/geo+json');
    const json = JSON.parse(await tripExport.file.text());
    expect(json.features[0].properties).toMatchObject({
      trip: 'Waiheke Island',
      photos: [`${earlier.id}.jpg`, `${later.id}.jpg`],
    });

    const all = buildExport(await readExportSource(db, 'all'), { format: 'gpx', now });
    expect(all.entries).toBe(2);
    expect(all.file.name).toMatch(/^hotshoe-all-\d{8}\.gpx$/);
  });

  it('skips entries deleted since they were picked', async () => {
    const db = createTestDb();
    const kept = await addEntry(db, newEntryInput());
    const picked = buildExport(
      await readExportSource(db, { entryIds: [kept.id, 'deleted-since' as EntryId] }),
      { format: 'csv', now },
    );
    expect(picked.entries).toBe(1);
    expect(picked.file.name).toMatch(/^hotshoe-selection-\d{8}\.csv$/);
  });

  it('matches times to the camera clock only for GPX of a single trip that has one', async () => {
    const db = createTestDb();
    const measured = await addTrip(db, 'Waiheke');
    await setCameraClock(db, measured.id, cameraClock);
    const unmeasured = await addTrip(db, 'Rakino');
    await addEntry(db, newEntryInput({ tripId: measured.id }));
    await addEntry(db, newEntryInput({ tripId: unmeasured.id }));

    const trip = await readExportSource(db, measured.id);
    expect(cameraClockFor(trip, 'gpx')).toEqual(cameraClock);
    const matched = buildExport(trip, {
      format: 'gpx',
      cameraTime: { softwareUtcOffsetMin: 780 },
      now,
    });
    expect(matched.file.name).toMatch(/^hotshoe-waiheke-\d{8}-camera-time\.gpx$/);
    // 01:00:00 UTC plus the drift, for software set to UTC+13.
    expect(await matched.file.text()).toContain('<time>2026-10-14T01:02:04Z</time>');

    // With no zone given, it defaults to the one the clock was measured in.
    const defaultZone = buildExport(trip, {
      format: 'gpx',
      cameraTime: { softwareUtcOffsetMin: null },
      now,
    });
    expect(await defaultZone.file.text()).toContain('set the time zone to UTC+13:00');

    const plain = buildExport(trip, { format: 'gpx', cameraTime: null, now });
    expect(await plain.file.text()).toContain('<time>2026-10-14T01:00:00Z</time>');

    expect(cameraClockFor(trip, 'csv')).toBeNull();
    const csv = buildExport(trip, {
      format: 'csv',
      cameraTime: { softwareUtcOffsetMin: null },
      now,
    });
    expect(csv.file.name).not.toContain('camera-time');

    for (const scope of ['all', unmeasured.id] as const) {
      const source = await readExportSource(db, scope);
      expect(cameraClockFor(source, 'gpx')).toBeNull();
      const gpx = buildExport(source, {
        format: 'gpx',
        cameraTime: { softwareUtcOffsetMin: null },
        now,
      });
      expect(gpx.file.name).not.toContain('camera-time');
      expect(await gpx.file.text()).not.toContain('2026-10-14T01:02:04Z');
    }
  });

  it('gives each trip its own GPX track, even when two share a name', async () => {
    const db = createTestDb();
    const first = await addTrip(db, 'Coromandel');
    const second = await addTrip(db, 'Coromandel');
    await addEntry(db, newEntryInput({ tripId: first.id }));
    await addEntry(db, newEntryInput({ tripId: second.id }));

    const gpx = await buildExport(await readExportSource(db, 'all'), {
      format: 'gpx',
      now,
    }).file.text();
    expect(gpx.match(/<trk>/g)).toHaveLength(2);
    expect(gpx.match(/<name>Coromandel<\/name>/g)).toHaveLength(2);
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
