import type { HotshoeDb } from '../../db/database.ts';
import type { EntryId, PhotoId, TripId } from '../../db/schema.ts';
import { fileDateStamp } from '../../lib/time.ts';
import { type ExportFormat, type ExportRow, formatDetails, formatExport } from './formats.ts';

/** Every entry, or one trip's. */
export type ExportScope = 'all' | TripId;

export interface CreatedExport {
  readonly file: File;
  readonly entries: number;
}

export async function createExport(
  db: HotshoeDb,
  {
    format,
    scope,
    now = Date.now(),
  }: { readonly format: ExportFormat; readonly scope: ExportScope; readonly now?: number },
): Promise<CreatedExport> {
  const [trips, entries, photoIds] = await db.transaction(
    'r',
    db.trips,
    db.entries,
    db.photos,
    () =>
      Promise.all([
        db.trips.toArray(),
        scope === 'all' ? db.entries.toArray() : db.entries.where('tripId').equals(scope).toArray(),
        photoIdsByEntry(db),
      ]),
  );
  const tripNames = new Map(trips.map((trip) => [trip.id, trip.name]));
  const rows: ExportRow[] = entries.map((entry) => ({
    entry,
    tripName: entry.tripId === null ? null : (tripNames.get(entry.tripId) ?? null),
    photoIds: photoIds.get(entry.id) ?? [],
  }));

  const { extension, mimeType } = formatDetails[format];
  const scopeName = scope === 'all' ? 'all' : slug(tripNames.get(scope) ?? 'trip');
  const name = `hotshoe-${scopeName}-${fileDateStamp(now)}.${extension}`;
  return {
    file: new File([formatExport(format, rows, now)], name, { type: mimeType }),
    entries: rows.length,
  };
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
