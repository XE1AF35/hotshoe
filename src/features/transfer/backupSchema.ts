import { z } from 'zod';
import { type EntryId, limits, origins, type PhotoId, type TripId } from '../../db/schema.ts';

/** The most `backup.json` may hold. Real backups are a few hundred bytes per entry. */
export const maxItems = 100_000;

const epochMs = z.number().int().min(0).max(8.64e15);
const entryId = z.uuid().transform((id) => id as EntryId);
const tripId = z.uuid().transform((id) => id as TripId);
const photoId = z.uuid().transform((id) => id as PhotoId);
const metres = z.number().min(0).max(1e8);

const tripSchema = z.strictObject({
  id: tripId,
  name: z.string().trim().min(1).max(limits.tripNameLength),
  createdAt: epochMs,
  updatedAt: epochMs,
  archivedAt: epochMs.nullable(),
  // Added in backup version 2; earlier backups have none.
  cameraClock: z
    .strictObject({
      offsetS: z
        .int()
        .min(-30 * 86_400)
        .max(30 * 86_400),
      phoneUtcOffsetMin: z
        .int()
        .min(-24 * 60)
        .max(24 * 60),
      measuredAt: epochMs,
    })
    .nullable()
    .default(null),
});

const entryFields = {
  id: entryId,
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  loggedAt: epochMs,
  fixAt: epochMs,
  accuracyM: metres.nullable(),
  altitudeM: z.number().min(-1e5).max(1e5).nullable(),
  altitudeAccuracyM: metres.nullable(),
  label: z.string().max(limits.labelLength).nullable(),
  frame: z.string().max(limits.frameLength).nullable(),
  tripId: tripId.nullable(),
  timeZone: z.string().min(1).max(64),
  utcOffsetMin: z
    .int()
    .min(-24 * 60)
    .max(24 * 60),
  createdAt: epochMs,
  updatedAt: epochMs,
};

const entrySchema = z.strictObject({ ...entryFields, origin: z.enum(origins) });

// Versions 1 and 2 had a `source: 'gps'` placeholder where origin is now, and every entry was
// logged with a fix.
const olderEntrySchema = z
  .strictObject({ ...entryFields, accuracyM: metres, source: z.literal('gps') })
  .transform(({ source: _, ...entry }) => ({ ...entry, origin: 'logged' as const }));

const photoSchema = z.strictObject({
  id: photoId,
  entryId,
  takenAt: epochMs,
  source: z.enum(['camera', 'library']),
  width: z.int().min(1).max(20_000),
  height: z.int().min(1).max(20_000),
  createdAt: epochMs,
});

const backupFields = {
  format: z.literal('hotshoe-backup'),
  exportedAt: z.iso.datetime(),
  trips: z.array(tripSchema).max(maxItems),
  photos: z.array(photoSchema).max(maxItems),
};

/** `backup.json`: everything except the photo files themselves. */
export const backupJsonSchema = z
  // Version 2 added trips' camera clocks, and version 3 entries' origins. All three restore.
  .discriminatedUnion('version', [
    z.strictObject({
      ...backupFields,
      version: z.literal(3),
      entries: z.array(entrySchema).max(maxItems),
    }),
    z.strictObject({
      ...backupFields,
      version: z.union([z.literal(1), z.literal(2)]),
      entries: z.array(olderEntrySchema).max(maxItems),
    }),
  ])
  .superRefine((backup, context) => {
    const tripIds = new Set(backup.trips.map((trip) => trip.id));
    const entryIds = new Set(backup.entries.map((entry) => entry.id));
    const photoIds = new Set(backup.photos.map((photo) => photo.id));
    for (const [key, ids] of [
      ['trips', tripIds],
      ['entries', entryIds],
      ['photos', photoIds],
    ] as const) {
      if (ids.size !== backup[key].length) {
        context.addIssue({ code: 'custom', path: [key], message: 'has the same id twice' });
      }
    }
    backup.entries.forEach((entry, index) => {
      if (entry.tripId !== null && !tripIds.has(entry.tripId)) {
        context.addIssue({
          code: 'custom',
          path: ['entries', index, 'tripId'],
          message: 'refers to a trip that is not in the backup',
        });
      }
    });
    backup.photos.forEach((photo, index) => {
      if (!entryIds.has(photo.entryId)) {
        context.addIssue({
          code: 'custom',
          path: ['photos', index, 'entryId'],
          message: 'refers to an entry that is not in the backup',
        });
      }
    });
  });

export type BackupJson = z.output<typeof backupJsonSchema>;
