import Dexie from 'dexie';
import type { HotshoeDb } from './database.ts';
import { MissingRecordError, withStorageErrors } from './errors.ts';
import { type EntryId, newPhotoId, type Photo, type PhotoId } from './schema.ts';

export type NewPhoto = Omit<Photo, 'id' | 'bytes' | 'createdAt'>;

export async function addPhoto(db: HotshoeDb, input: NewPhoto, now = Date.now()): Promise<Photo> {
  const photo: Photo = {
    ...input,
    id: newPhotoId(),
    bytes: input.image.size + input.thumb.size,
    createdAt: now,
  };
  await withStorageErrors(() =>
    db.transaction('rw', db.entries, db.photos, async () => {
      if ((await db.entries.get(photo.entryId)) === undefined) {
        throw new MissingRecordError(`Entry ${photo.entryId} does not exist.`);
      }
      await db.photos.add(photo);
    }),
  );
  return photo;
}

/** An entry's photos, oldest first. */
export function listPhotos(db: HotshoeDb, entryId: EntryId): Promise<Photo[]> {
  return db.photos
    .where('[entryId+takenAt]')
    .between([entryId, Dexie.minKey], [entryId, Dexie.maxKey])
    .toArray();
}

export async function deletePhoto(db: HotshoeDb, id: PhotoId): Promise<void> {
  await db.photos.delete(id);
}

/** Bytes used by all photos, for the storage readout. */
export async function totalPhotoBytes(db: HotshoeDb): Promise<number> {
  let total = 0;
  await db.photos.each((photo) => {
    total += photo.bytes;
  });
  return total;
}
