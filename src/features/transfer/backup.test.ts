import { strFromU8, strToU8, unzipSync, type Zippable, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { HotshoeDb } from '../../db/database.ts';
import { addEntry, updateEntry } from '../../db/entries.ts';
import { addPhoto, listPhotos } from '../../db/photos.ts';
import { getSetting, setSetting } from '../../db/settings.ts';
import { addTrip, setCameraClock } from '../../db/trips.ts';
import { createTestDb, jpegBlob, newEntryInput } from '../../test/db.ts';
import {
  BackupError,
  type BackupLimits,
  createBackup,
  defaultLimits,
  previewRestore,
  readBackup,
  restoreBackup,
} from './backup.ts';

const now = Date.parse('2026-10-14T03:12:45Z');

async function seed(db: HotshoeDb) {
  const trip = await addTrip(db, 'Waiheke', 1000);
  const entry = await addEntry(db, newEntryInput({ tripId: trip.id }), 2000);
  const bare = await addEntry(db, newEntryInput({ lat: 10 }), 3000);
  const photo = await addPhoto(db, {
    entryId: entry.id,
    takenAt: 1500,
    source: 'camera',
    image: jpegBlob(400),
    thumb: jpegBlob(40),
    width: 1600,
    height: 1200,
  });
  return { trip, entry, bare, photo };
}

async function backupBytes(db: HotshoeDb, includePhotos = true): Promise<Uint8Array> {
  const { file } = await createBackup(db, { includePhotos, now });
  return new Uint8Array(await file.arrayBuffer());
}

/** Rewrites one file in a backup zip, to make broken or hostile backups. */
function edit(bytes: Uint8Array, change: (files: Record<string, Uint8Array>) => void): Uint8Array {
  const files = unzipSync(bytes);
  change(files);
  return zipSync(files as Zippable);
}

interface LooseBackup {
  entries: Record<string, unknown>[];
  trips: unknown[];
}

function editJson(bytes: Uint8Array, change: (json: LooseBackup) => void) {
  return edit(bytes, (files) => {
    const json = JSON.parse(strFromU8(files['backup.json'] ?? new Uint8Array()));
    change(json);
    files['backup.json'] = strToU8(JSON.stringify(json));
  });
}

describe('createBackup', () => {
  it('names the file by date and lays out backup.json, photos, and thumbs', async () => {
    const db = createTestDb();
    const { photo } = await seed(db);
    const backup = await createBackup(db, { includePhotos: true, now });

    expect(backup.file.name).toMatch(/^hotshoe-backup-2026101\d\.zip$/);
    expect(backup).toMatchObject({ entries: 2, photos: 1 });
    const files = unzipSync(new Uint8Array(await backup.file.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual([
      'backup.json',
      `photos/${photo.id}.jpg`,
      `thumbs/${photo.id}.jpg`,
    ]);
    const json = JSON.parse(strFromU8(files['backup.json'] ?? new Uint8Array()));
    expect(json).toMatchObject({
      format: 'hotshoe-backup',
      version: 2,
      exportedAt: '2026-10-14T03:12:45.000Z',
    });
    expect(json.photos[0]).not.toHaveProperty('image');
  });

  it('leaves the photos out when asked', async () => {
    const db = createTestDb();
    await seed(db);
    const files = unzipSync(await backupBytes(db, false));
    expect(Object.keys(files)).toEqual(['backup.json']);
  });
});

describe('restoreBackup', () => {
  it('restores everything, photos included, into an empty device', async () => {
    const source = createTestDb();
    const { entry, photo } = await seed(source);
    const backup = readBackup(await backupBytes(source));

    const target = createTestDb();
    expect(await previewRestore(target, backup)).toEqual({
      entries: 2,
      trips: 1,
      photos: 1,
      alreadyPresent: 0,
    });
    expect(await restoreBackup(target, backup, 'merge')).toEqual({ entries: 2, photos: 1 });

    expect(await target.entries.get(entry.id)).toEqual(await source.entries.get(entry.id));
    const [restored] = await listPhotos(target, entry.id);
    expect(restored?.id).toBe(photo.id);
    expect(restored?.bytes).toBe(440);
    expect(new Uint8Array(await (restored?.image ?? new Blob()).arrayBuffer())).toEqual(
      new Uint8Array(await photo.image.arrayBuffer()),
    );
  });

  it('restores a backup without photos, and a bare backup.json', async () => {
    const source = createTestDb();
    await seed(source);
    const zipOnly = readBackup(await backupBytes(source, false));
    const json = unzipSync(await backupBytes(source, false))['backup.json'] ?? new Uint8Array();

    expect(await restoreBackup(createTestDb(), zipOnly, 'merge')).toEqual({
      entries: 2,
      photos: 0,
    });
    expect(await restoreBackup(createTestDb(), readBackup(json), 'merge')).toEqual({
      entries: 2,
      photos: 0,
    });
  });

  it("keeps a trip's camera clock, and restores version 1 backups without one", async () => {
    const source = createTestDb();
    const { trip } = await seed(source);
    const clock = { offsetS: 46_804, phoneUtcOffsetMin: 780, measuredAt: 5000 };
    await setCameraClock(source, trip.id, clock, 6000);

    const current = createTestDb();
    await restoreBackup(current, readBackup(await backupBytes(source)), 'merge');
    expect((await current.trips.get(trip.id))?.cameraClock).toEqual(clock);

    const older = editJson(await backupBytes(source), (json) => {
      Object.assign(json, { version: 1 });
      for (const saved of json.trips as Record<string, unknown>[]) delete saved.cameraClock;
    });
    const fromOlder = createTestDb();
    await restoreBackup(fromOlder, readBackup(older), 'merge');
    expect((await fromOlder.trips.get(trip.id))?.cameraClock).toBeNull();
  });

  it('merges by keeping the more recently edited copy of each entry', async () => {
    const db = createTestDb();
    const { entry, bare } = await seed(db);
    const backup = readBackup(await backupBytes(db));

    // After the backup: one entry edited here, one deleted, and one added.
    await updateEntry(db, entry.id, { label: 'Edited here' }, 9000);
    await db.entries.delete(bare.id);
    const added = await addEntry(db, newEntryInput(), 9500);

    expect(await previewRestore(db, backup)).toMatchObject({ alreadyPresent: 1 });
    expect(await restoreBackup(db, backup, 'merge')).toEqual({ entries: 1, photos: 0 });
    expect((await db.entries.get(entry.id))?.label).toBe('Edited here');
    expect(await db.entries.get(bare.id)).toBeDefined();
    expect(await db.entries.get(added.id)).toBeDefined();
  });

  it('replaces everything, and clears an active trip the backup does not have', async () => {
    const db = createTestDb();
    await seed(db);
    const backup = readBackup(await backupBytes(createTestDb()));
    const other = await addTrip(db, 'Elsewhere');
    await setSetting(db, 'activeTripId', other.id);

    expect(await restoreBackup(db, backup, 'replace')).toEqual({ entries: 0, photos: 0 });
    expect(await db.entries.count()).toBe(0);
    expect(await db.photos.count()).toBe(0);
    expect(await getSetting(db, 'activeTripId')).toBeNull();
  });
});

describe('readBackup rejects', () => {
  async function valid() {
    const db = createTestDb();
    const seeded = await seed(db);
    return { bytes: await backupBytes(db), ...seeded };
  }

  function rejects(bytes: Uint8Array, message: RegExp, limits?: BackupLimits) {
    expect(() => readBackup(bytes, limits)).toThrow(BackupError);
    expect(() => readBackup(bytes, limits)).toThrow(message);
  }

  it('files that are not backups, or are damaged', async () => {
    rejects(strToU8('GIF89a'), /isn't a Hotshoe backup/);
    const { bytes } = await valid();
    rejects(bytes.slice(0, bytes.length - 40), /couldn't be opened|damaged/);
  });

  it('unexpected paths, including ones that climb out of the folder', async () => {
    const { bytes } = await valid();
    rejects(
      edit(bytes, (files) => (files['../evil.js'] = strToU8('x'))),
      /unexpected file/,
    );
    rejects(
      edit(bytes, (files) => (files['photos/a.png'] = strToU8('x'))),
      /unexpected file/,
    );
  });

  it('photos that are not JPEGs, are not listed, or are missing', async () => {
    const { bytes, photo } = await valid();
    rejects(
      edit(bytes, (files) => (files[`photos/${photo.id}.jpg`] = strToU8('<svg/>'))),
      /isn't a JPEG/,
    );
    const stranger = crypto.randomUUID();
    rejects(
      edit(
        bytes,
        (files) => (files[`photos/${stranger}.jpg`] = new Uint8Array([0xff, 0xd8, 0xff])),
      ),
      /doesn't list/,
    );
    rejects(
      edit(bytes, (files) => {
        delete files[`thumbs/${photo.id}.jpg`];
      }),
      /missing some of its photos/,
    );
  });

  it('data that fails the schema', async () => {
    const { bytes } = await valid();
    rejects(
      editJson(bytes, (json) => Object.assign(json.entries[0] ?? {}, { lat: 91 })),
      /entries\.0\.lat/,
    );
    rejects(
      editJson(bytes, (json) => Object.assign(json.entries[0] ?? {}, { extra: 'field' })),
      /entries\.0/,
    );
    rejects(
      editJson(bytes, (json) => {
        json.trips = [];
      }),
      /refers to a trip/,
    );
    rejects(
      editJson(bytes, (json) => {
        json.entries = [...json.entries, json.entries[0] ?? {}];
      }),
      /same id twice/,
    );
    rejects(
      edit(bytes, (files) => (files['backup.json'] = strToU8('{"format":'))),
      /couldn't be read/,
    );
  });

  it('zip bombs, judged on declared sizes before anything is unpacked', async () => {
    const { bytes } = await valid();
    const bomb = edit(bytes, (files) => (files['backup.json'] = new Uint8Array(2_000_000)));
    expect(bomb.byteLength).toBeLessThan(20_000);
    rejects(bomb, /larger than Hotshoe can restore/, { ...defaultLimits, jsonBytes: 1_000_000 });
    rejects(bytes, /larger than Hotshoe can restore/, { ...defaultLimits, totalBytes: 100 });
    rejects(bytes, /too large/, { ...defaultLimits, fileBytes: 100 });
  });
});
