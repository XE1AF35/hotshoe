/**
 * Backup and restore. Loaded only when needed, so zod and fflate stay out of the initial bundle.
 *
 * A backup is a zip holding `backup.json` (everything but the photos), `photos/<id>.jpg`, and
 * `thumbs/<id>.jpg`. A backup without photos holds only `backup.json`, and a bare `backup.json`
 * can be restored too.
 */
import { strFromU8, strToU8, unzipSync, type Zippable, zipSync } from 'fflate';
import type { HotshoeDb } from '../../db/database.ts';
import { withStorageErrors } from '../../db/errors.ts';
import type { PhotoId, StoredPhoto } from '../../db/schema.ts';
import { settleActiveTrip } from '../../db/trips.ts';
import { fileDateStamp } from '../../lib/time.ts';
import { type BackupJson, backupJsonSchema } from './backupSchema.ts';

/** A problem with a backup file, worded for the person restoring it. */
export class BackupError extends Error {
  override readonly name = 'BackupError';
}

/** Caps applied before anything is unpacked, so a hostile file can't exhaust memory. */
export interface BackupLimits {
  readonly fileBytes: number;
  readonly jsonBytes: number;
  readonly photoBytes: number;
  readonly totalBytes: number;
}

export const defaultLimits: BackupLimits = {
  fileBytes: 2e9,
  jsonBytes: 10e6,
  photoBytes: 25e6,
  totalBytes: 2e9,
};

const jsonPath = 'backup.json';
const photoPath = /^(photos|thumbs)\/([0-9a-f-]{36})\.jpg$/;

export interface CreatedBackup {
  readonly file: File;
  readonly entries: number;
  readonly photos: number;
  /** When the snapshot was taken. Anything changed after this isn't in the file. */
  readonly madeAt: number;
  readonly includesPhotos: boolean;
}

export async function createBackup(
  db: HotshoeDb,
  { includePhotos, now = Date.now() }: { readonly includePhotos: boolean; readonly now?: number },
): Promise<CreatedBackup> {
  const [trips, entries, photos] = await db.transaction('r', db.trips, db.entries, db.photos, () =>
    Promise.all([
      db.trips.toArray(),
      db.entries.toArray(),
      includePhotos ? db.photos.toArray() : Promise.resolve<StoredPhoto[]>([]),
    ]),
  );

  const json: BackupJson = {
    format: 'hotshoe-backup',
    version: 3,
    exportedAt: new Date(now).toISOString(),
    trips,
    entries,
    photos: photos.map(({ id, entryId, takenAt, source, width, height, createdAt }) => ({
      id,
      entryId,
      takenAt,
      source,
      width,
      height,
      createdAt,
    })),
  };

  const files: Zippable = { [jsonPath]: [strToU8(JSON.stringify(json, null, 2)), { level: 6 }] };
  // JPEGs don't compress any further, so they are stored as they are.
  for (const photo of photos) {
    files[`photos/${photo.id}.jpg`] = [new Uint8Array(photo.image), { level: 0 }];
    files[`thumbs/${photo.id}.jpg`] = [new Uint8Array(photo.thumb), { level: 0 }];
  }
  const zipped = zipSync(files, { mtime: now });

  return {
    file: new File([zipped], `hotshoe-backup-${fileDateStamp(now)}.zip`, {
      type: 'application/zip',
    }),
    entries: entries.length,
    photos: photos.length,
    madeAt: now,
    includesPhotos: includePhotos,
  };
}

export interface ReadBackup {
  readonly data: BackupJson;
  readonly photoFiles: ReadonlyMap<PhotoId, { image: ArrayBuffer; thumb: ArrayBuffer }>;
}

/** Unpacks and checks a backup file. Throws BackupError when anything about it is off. */
export function readBackup(bytes: Uint8Array, limits: BackupLimits = defaultLimits): ReadBackup {
  if (bytes.byteLength > limits.fileBytes) throw new BackupError('That file is too large.');

  // A bare backup.json, as saved from a zip by hand.
  if (bytes[0] === 0x7b) {
    if (bytes.byteLength > limits.jsonBytes) throw new BackupError('That file is too large.');
    return { data: parseJson(bytes), photoFiles: new Map() };
  }
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04)) {
    throw new BackupError("That isn't a Hotshoe backup. Choose a .zip file made by Hotshoe.");
  }

  let unzipped: Record<string, Uint8Array>;
  let total = 0;
  try {
    unzipped = unzipSync(bytes, {
      // Runs on each file's directory entry before it is unpacked.
      filter(file) {
        if (file.name.endsWith('/')) return false;
        const cap = file.name === jsonPath ? limits.jsonBytes : limits.photoBytes;
        if (file.name !== jsonPath && !photoPath.test(file.name)) {
          throw new BackupError(`The backup has an unexpected file: ${file.name.slice(0, 80)}`);
        }
        total += file.originalSize;
        if (file.originalSize > cap || total > limits.totalBytes) {
          throw new BackupError('The backup is larger than Hotshoe can restore.');
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError("That file couldn't be opened. It may be damaged.");
  }

  const json = unzipped[jsonPath];
  if (!json) throw new BackupError('The backup is missing backup.json.');
  const data = parseJson(json);

  const listed = new Set<string>(data.photos.map((photo) => photo.id));
  const found = new Map<PhotoId, { image?: ArrayBuffer; thumb?: ArrayBuffer }>();
  for (const [name, content] of Object.entries(unzipped)) {
    const match = photoPath.exec(name);
    if (!match) continue;
    const [, folder, id] = match;
    if (!id || !listed.has(id)) {
      throw new BackupError(`The backup has a photo it doesn't list: ${name}`);
    }
    if (!(content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff)) {
      throw new BackupError(`A photo in the backup isn't a JPEG: ${name}`);
    }
    const slot = found.get(id as PhotoId) ?? {};
    slot[folder === 'photos' ? 'image' : 'thumb'] = toArrayBuffer(content);
    found.set(id as PhotoId, slot);
  }

  const photoFiles = new Map<PhotoId, { image: ArrayBuffer; thumb: ArrayBuffer }>();
  for (const photo of data.photos) {
    const files = found.get(photo.id);
    if (!files?.image || !files.thumb) {
      throw new BackupError('The backup is missing some of its photos.');
    }
    photoFiles.set(photo.id, { image: files.image, thumb: files.thumb });
  }
  return { data, photoFiles };
}

export interface RestorePreview {
  readonly entries: number;
  readonly trips: number;
  readonly photos: number;
  /** Entries in the backup that are already on this device. */
  readonly alreadyPresent: number;
}

export async function previewRestore(db: HotshoeDb, backup: ReadBackup): Promise<RestorePreview> {
  const existing = await db.entries.bulkGet(backup.data.entries.map((entry) => entry.id));
  return {
    entries: backup.data.entries.length,
    trips: backup.data.trips.length,
    photos: backup.data.photos.length,
    alreadyPresent: existing.filter((entry) => entry !== undefined).length,
  };
}

export type RestoreMode = 'merge' | 'replace';

export interface RestoreResult {
  /** Entries added or replaced by a newer copy from the backup. */
  readonly entries: number;
  readonly photos: number;
}

/**
 * Writes a backup in one transaction, so a failure leaves the device as it was.
 *
 * Merge keeps everything on the device and takes each entry and trip from the backup only when
 * it is new or was changed more recently there. Replace makes the device match the backup.
 */
export async function restoreBackup(
  db: HotshoeDb,
  backup: ReadBackup,
  mode: RestoreMode,
): Promise<RestoreResult> {
  const { data, photoFiles } = backup;
  const photos: StoredPhoto[] = data.photos.map((photo) => {
    const files = photoFiles.get(photo.id);
    if (!files) throw new BackupError('The backup is missing some of its photos.');
    return {
      ...photo,
      ...files,
      bytes: files.image.byteLength + files.thumb.byteLength,
    };
  });

  return withStorageErrors(() =>
    db.transaction('rw', [db.trips, db.entries, db.photos, db.meta], async () => {
      if (mode === 'replace') {
        await Promise.all([db.trips.clear(), db.entries.clear(), db.photos.clear()]);
        await db.trips.bulkAdd(data.trips);
        await db.entries.bulkAdd(data.entries);
        await db.photos.bulkAdd(photos);
        await settleActiveTrip(db);
        return { entries: data.entries.length, photos: photos.length };
      }

      const newer = async <T extends { id: string; updatedAt: number }>(
        incoming: readonly T[],
        current: Promise<(T | undefined)[]>,
      ) => {
        const existing = await current;
        return incoming.filter((item, index) => {
          const mine = existing[index];
          return mine === undefined || item.updatedAt > mine.updatedAt;
        });
      };
      const trips = await newer(data.trips, db.trips.bulkGet(data.trips.map((trip) => trip.id)));
      const entries = await newer(
        data.entries,
        db.entries.bulkGet(data.entries.map((entry) => entry.id)),
      );
      const existingPhotos = await db.photos.bulkGet(photos.map((photo) => photo.id));
      const newPhotos = photos.filter((_, index) => existingPhotos[index] === undefined);

      await db.trips.bulkPut(trips);
      await db.entries.bulkPut(entries);
      await db.photos.bulkAdd(newPhotos);
      await settleActiveTrip(db);
      return { entries: entries.length, photos: newPhotos.length };
    }),
  );
}

function parseJson(bytes: Uint8Array): BackupJson {
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(bytes));
  } catch {
    throw new BackupError("The backup's data couldn't be read. It may be damaged.");
  }
  const parsed = backupJsonSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join('.') || 'the file';
    throw new BackupError(`The backup's data didn't pass checks (${where}: ${issue?.message}).`);
  }
  return parsed.data;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
