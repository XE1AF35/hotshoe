import type { HotshoeDb } from '../../db/database.ts';
import type { CameraClock, Entry, EntryId, PhotoId, TripId } from '../../db/schema.ts';
import { fileDateStamp } from '../../lib/time.ts';
import { type ExportFormat, type ExportRow, formatDetails, formatExport } from './formats.ts';

/** Every entry, one trip's, or a hand-picked set. */
export type ExportScope = 'all' | TripId | { readonly entryIds: readonly EntryId[] };

export interface CreatedExport {
  readonly file: File;
  readonly entries: number;
}

/** What an export is made from, read in one go so a live query can watch exactly that. */
export interface ExportSource {
  readonly rows: readonly ExportRow[];
  /** Goes in the file name: `all`, `selection`, or the trip's name as a slug. */
  readonly scopeName: string;
  /** The camera clock of the one trip being exported, if it has been measured. */
  readonly tripCameraClock: CameraClock | null;
}

/**
 * Matching GPX times to a trip's camera clock, for photo software set to this time zone (minutes
 * from UTC). A null zone is the one the clock was measured in, which is what most people already
 * enter. Null instead of the choice leaves times in plain UTC.
 */
export type CameraTimeChoice = { readonly softwareUtcOffsetMin: number | null } | null;

/** The zone photo software is set to for a clock: the one chosen, or where it was measured. */
export function softwareZone(chosen: number | null, clock: CameraClock | null): number {
  return chosen ?? clock?.phoneUtcOffsetMin ?? 0;
}

/** Reads the entries in scope with their trips and photo ids. */
export async function readExportSource(db: HotshoeDb, scope: ExportScope): Promise<ExportSource> {
  const [trips, entries, photoIds] = await db.transaction(
    'r',
    db.trips,
    db.entries,
    db.photos,
    () => Promise.all([db.trips.toArray(), entriesInScope(db, scope), photoIdsByEntry(db)]),
  );
  const tripsById = new Map(trips.map((trip) => [trip.id, trip]));
  const rows: ExportRow[] = entries.map((entry) => {
    const trip = entry.tripId === null ? undefined : tripsById.get(entry.tripId);
    return {
      entry,
      trip: trip ? { id: trip.id, name: trip.name } : null,
      photoIds: photoIds.get(entry.id) ?? [],
    };
  });
  const scopeTrip = typeof scope === 'string' && scope !== 'all' ? tripsById.get(scope) : undefined;
  return {
    rows,
    scopeName:
      scope === 'all'
        ? 'all'
        : typeof scope === 'object'
          ? 'selection'
          : slug(scopeTrip?.name ?? 'trip'),
    tripCameraClock: scopeTrip?.cameraClock ?? null,
  };
}

/**
 * The camera clock an export can match its times to: only GPX of a single trip with a measured
 * clock, since that is what photo software geotags from. Null otherwise.
 */
export function cameraClockFor(source: ExportSource, format: ExportFormat): CameraClock | null {
  return format === 'gpx' ? source.tripCameraClock : null;
}

/** Makes the file to share. Pure, so it can be remade whenever the source or the choices change. */
export function buildExport(
  source: ExportSource,
  {
    format,
    cameraTime = null,
    now = Date.now(),
  }: {
    readonly format: ExportFormat;
    /** Applies only where `cameraClockFor` finds a clock. */
    readonly cameraTime?: CameraTimeChoice;
    readonly now?: number;
  },
): CreatedExport {
  const cameraClock = cameraTime === null ? null : cameraClockFor(source, format);
  const { extension, mimeType } = formatDetails(format);
  const name = `hotshoe-${source.scopeName}-${fileDateStamp(now)}${cameraClock ? '-camera-time' : ''}.${extension}`;
  return {
    file: new File(
      [
        formatExport(format, source.rows, now, {
          cameraClock,
          softwareUtcOffsetMin: softwareZone(cameraTime?.softwareUtcOffsetMin ?? null, cameraClock),
        }),
      ],
      name,
      { type: mimeType },
    ),
    entries: source.rows.length,
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
