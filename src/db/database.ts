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
  }
}
