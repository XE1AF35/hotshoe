import type { HotshoeDb } from '../../db/database.ts';
import type { Entry, EntryId, PhotoId, TripId } from '../../db/schema.ts';
import { fileDateStamp } from '../../lib/time.ts';
import { type ExportFormat, type ExportRow, formatDetails, formatExport } from './formats.ts';

/** Every entry, one trip's, or a hand-picked set. */
export type ExportScope = 'all' | TripId | { readonly entryIds: readonly EntryId[] };

export interface CreatedExport {
  readonly file: File;
  readonly entries: number;
}

export async function createExport(
  db: HotshoeDb,
  {
    format,
    scope,
    cameraTime = null,
    now = Date.now(),
  }: {
    readonly format: ExportFormat;
    readonly scope: ExportScope;
    /**
     * For a trip with a measured camera clock: match GPX times to that camera, for photo software
     * set to this time zone (minutes from UTC). Null leaves times in plain UTC.
     */
    readonly cameraTime?: { readonly softwareUtcOffsetMin: number } | null;
    readonly now?: number;
  },
): Promise<CreatedExport> {
  const [trips, entries, photoIds] = await db.transaction(
    'r',
    db.trips,
    db.entries,
    db.photos,
    () => Promise.all([db.trips.toArray(), entriesInScope(db, scope), photoIdsByEntry(db)]),
  );
  const tripNames = new Map(trips.map((trip) => [trip.id, trip.name]));
  const rows: ExportRow[] = entries.map((entry) => ({
    entry,
    tripName: entry.tripId === null ? null : (tripNames.get(entry.tripId) ?? null),
    photoIds: photoIds.get(entry.id) ?? [],
  }));

  const cameraClock =
    cameraTime !== null && format === 'gpx' && typeof scope === 'string' && scope !== 'all'
      ? (trips.find((trip) => trip.id === scope)?.cameraClock ?? null)
      : null;
  const { extension, mimeType } = formatDetails[format];
  const scopeName =
    scope === 'all'
      ? 'all'
      : typeof scope === 'object'
        ? 'selection'
        : slug(tripNames.get(scope) ?? 'trip');
  const name = `hotshoe-${scopeName}-${fileDateStamp(now)}${cameraClock ? '-camera-time' : ''}.${extension}`;
  return {
    file: new File(
      [
        formatExport(format, rows, now, {
          cameraClock,
          softwareUtcOffsetMin: cameraTime?.softwareUtcOffsetMin ?? 0,
        }),
      ],
      name,
      { type: mimeType },
    ),
    entries: rows.length,
  };
}

async function entriesInScope(db: HotshoeDb, scope: ExportScope): Promise<Entry[]> {
  if (scope === 'all') return db.entries.toArray();
  if (typeof scope === 'object') {
    // Entries deleted since they were picked are skipped.
    const found = await db.entries.bulkGet([...scope.entryIds]);
    return found.filter((entry) => entry !== undefined);
  }
  return db.entries.where('tripId').equals(scope).toArray();
}

/** Each entry's photo ids in the order the entry shows them, read from an index alone. */
async function photoIdsByEntry(db: HotshoeDb): Promise<Map<EntryId, PhotoId[]>> {
  const byEntry = new Map<EntryId, PhotoId[]>();
  const index = db.photos.orderBy('[entryId+takenAt]');
  const [keys, ids] = await Promise.all([index.keys(), index.primaryKeys()]);
  keys.forEach((key, i) => {
    const [entryId] = key as unknown as [EntryId, number];
    const id = ids[i] as PhotoId;
    const list = byEntry.get(entryId);
    if (list) list.push(id);
    else byEntry.set(entryId, [id]);
  });
  return byEntry;
}

/** A trip name made safe for a file name: `Waiheke Island` becomes `waiheke-island`. */
export function slug(name: string): string {
  const text = name
    .normalize('NFKD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return text === '' ? 'trip' : text;
}
