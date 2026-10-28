import Dexie, { type EntityTable } from 'dexie';
import type { Entry, StoredPhoto, Trip } from './schema.ts';

export interface MetaRow {
  readonly key: string;
  readonly value: unknown;
}

export class HotshoeDb extends Dexie {
  // `declare` keeps these as types only, so class fields do not overwrite the tables Dexie creates.
  declare entries: EntityTable<Entry, 'id'>;
  declare trips: EntityTable<Trip, 'id'>;
  declare photos: EntityTable<StoredPhoto, 'id'>;
  declare meta: EntityTable<MetaRow, 'key'>;

  constructor(name = 'hotshoe') {
    super(name);

    // Never edit a published version. Add a new version with an upgrade function instead.
    this.version(1).stores({
      entries: 'id, loggedAt, tripId, [tripId+loggedAt], updatedAt',
      trips: 'id, name, createdAt',
      photos: 'id, entryId, [entryId+takenAt]',
      meta: 'key',
    });
    // Indexes photo sizes, so the storage readout can add them up without reading any images.
    // Only an index is added, which IndexedDB builds itself, so no upgrade function is needed.
    this.version(2).stores({
      photos: 'id, entryId, [entryId+takenAt], bytes',
    });
    // Trips gain a camera clock, unset for trips made before.
    this.version(3)
      .stores({})
      .upgrade((tx) =>
        tx
          .table('trips')
          .toCollection()
          .modify((trip: { cameraClock?: unknown }) => {
            trip.cameraClock ??= null;
          }),
      );
    // Indexes when photos were added, so the backup status can find new ones without reading any
    // images. Only an index is added, so no upgrade function is needed.
    this.version(4).stores({
      photos: 'id, entryId, [entryId+takenAt], bytes, createdAt',
    });
    // Entries gain an origin in place of the `source: 'gps'` placeholder. Every entry so far was
    // logged with a fix, so its accuracy stays as it was.
    this.version(5)
      .stores({})
      .upgrade((tx) =>
        tx
          .table('entries')
          .toCollection()
          .modify((entry: { origin?: unknown; source?: unknown }) => {
            entry.origin = 'logged';
            delete entry.source;
          }),
      );
  }
}
