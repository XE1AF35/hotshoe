import Dexie from 'dexie';
import type { HotshoeDb } from './database.ts';
import { MissingRecordError, withStorageErrors } from './errors.ts';
import { type EntryId, newPhotoId, type Photo, type PhotoId, type StoredPhoto } from './schema.ts';

export type NewPhoto = Omit<Photo, 'id' | 'bytes' | 'createdAt'>;

export async function addPhoto(db: HotshoeDb, input: NewPhoto, now = Date.now()): Promise<Photo> {
  const photo: Photo = {
    ...input,
    id: newPhotoId(),
    bytes: input.image.size + input.thumb.size,
    createdAt: now,
  };
  // Read the bytes first: a Dexie transaction ends at the first await that isn't Dexie's own.
  const stored = await toStored(photo);
  await withStorageErrors(() =>
    db.transaction('rw', db.entries, db.photos, async () => {
      if ((await db.entries.get(photo.entryId)) === undefined) {
        throw new MissingRecordError(`Entry ${photo.entryId} does not exist.`);
      }
      await db.photos.add(stored);
    }),
  );
  return photo;
}

/** An entry's photos, oldest first. */
export async function listPhotos(db: HotshoeDb, entryId: EntryId): Promise<Photo[]> {
  const stored = await db.photos
    .where('[entryId+takenAt]')
    .between([entryId, Dexie.minKey], [entryId, Dexie.maxKey])
    .toArray();
  return stored.map(fromStored);
}

export async function deletePhoto(db: HotshoeDb, id: PhotoId): Promise<void> {
  await db.photos.delete(id);
}

/** The thumbnail of an entry's first photo, for list rows, or null when it has none. */
export async function firstThumb(db: HotshoeDb, entryId: EntryId): Promise<Blob | null> {
  const first = await db.photos
    .where('[entryId+takenAt]')
    .between([entryId, Dexie.minKey], [entryId, Dexie.maxKey])
    .first();
  return first ? new Blob([first.thumb], { type: 'image/jpeg' }) : null;
}

/**
 * A check of whether a time falls within a second of a stored photo's shot time, for spotting
 * photos added before. The second either side counts too, since a photo from Log with photo
 * keeps its file date, written just after the shot.
 */
export async function storedPhotoSecondCheck(db: HotshoeDb): Promise<(at: number) => boolean> {
  // Index keys only: reading the photos themselves would load every image.
  // Dexie types a compound index's keys as single values, though each is a pair.
  type Key = readonly [EntryId, number];
  const keys = (await db.photos.orderBy('[entryId+takenAt]').keys()) as unknown as Key[];
  const seconds = new Set(keys.map(([, takenAt]) => secondOf(takenAt)));
  return (at) => {
    const second = secondOf(at);
    return seconds.has(second - 1) || seconds.has(second) || seconds.has(second + 1);
  };
}

/** Bytes used by all photos, for the storage readout. */
export async function totalPhotoBytes(db: HotshoeDb): Promise<number> {
  // Index keys only: reading the photos themselves would load every image.
  const sizes = (await db.photos.orderBy('bytes').keys()) as number[];
  return sizes.reduce((total, bytes) => total + bytes, 0);
}

async function toStored(photo: Photo): Promise<StoredPhoto> {
  const [image, thumb] = await Promise.all([photo.image.arrayBuffer(), photo.thumb.arrayBuffer()]);
  return { ...photo, image, thumb };
}

function secondOf(epochMs: number): number {
  return Math.floor(epochMs / 1000);
}

function fromStored(stored: StoredPhoto): Photo {
  return {
    ...stored,
    image: new Blob([stored.image], { type: 'image/jpeg' }),
    thumb: new Blob([stored.thumb], { type: 'image/jpeg' }),
  };
}
