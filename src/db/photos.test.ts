import { describe, expect, it } from 'vitest';
import { createTestDb, jpegBlob, newEntryInput } from '../test/db.ts';
import { addEntry } from './entries.ts';
import { MissingRecordError } from './errors.ts';
import { addPhoto, deletePhoto, listPhotos, type NewPhoto, totalPhotoBytes } from './photos.ts';
import type { EntryId } from './schema.ts';

function photoInput(entryId: EntryId, overrides: Partial<NewPhoto> = {}): NewPhoto {
  return {
    entryId,
    takenAt: 1000,
    source: 'camera',
    image: jpegBlob(400),
    thumb: jpegBlob(40),
    width: 1600,
    height: 1200,
    ...overrides,
  };
}

describe('photos', () => {
  it('stores image blobs and reads them back intact', async () => {
    const db = createTestDb();
    const entry = await addEntry(db, newEntryInput());
    const photo = await addPhoto(db, photoInput(entry.id));

    const [stored] = await listPhotos(db, entry.id);
    expect(stored?.bytes).toBe(440);
    expect(stored?.image.type).toBe('image/jpeg');
    const bytes = new Uint8Array(await (stored?.image ?? new Blob()).arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(bytes.byteLength).toBe(400);
    expect(stored?.id).toBe(photo.id);
  });

  it("lists only that entry's photos, oldest first", async () => {
    const db = createTestDb();
    const entry = await addEntry(db, newEntryInput());
    const other = await addEntry(db, newEntryInput());
    await addPhoto(db, photoInput(entry.id, { takenAt: 3000 }));
    await addPhoto(db, photoInput(other.id, { takenAt: 2000 }));
    await addPhoto(db, photoInput(entry.id, { takenAt: 1000 }));

    expect((await listPhotos(db, entry.id)).map((photo) => photo.takenAt)).toEqual([1000, 3000]);
  });

  it('refuses a photo for a missing entry', async () => {
    const db = createTestDb();
    await expect(addPhoto(db, photoInput('missing' as EntryId))).rejects.toBeInstanceOf(
      MissingRecordError,
    );
  });

  it('totals photo storage and updates after a delete', async () => {
    const db = createTestDb();
    const entry = await addEntry(db, newEntryInput());
    const first = await addPhoto(db, photoInput(entry.id));
    await addPhoto(db, photoInput(entry.id, { image: jpegBlob(1000) }));
    expect(await totalPhotoBytes(db)).toBe(440 + 1040);

    await deletePhoto(db, first.id);
    expect(await totalPhotoBytes(db)).toBe(1040);
  });
});
