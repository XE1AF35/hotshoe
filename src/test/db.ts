import { afterEach } from 'vitest';
import { HotshoeDb } from '../db/database.ts';
import type { NewEntry } from '../db/entries.ts';

const openDbs: HotshoeDb[] = [];

afterEach(async () => {
  await Promise.all(openDbs.splice(0).map((db) => db.delete()));
});

/** A fresh, empty database, deleted after the test. */
export function createTestDb(): HotshoeDb {
  const db = new HotshoeDb(`test-${crypto.randomUUID()}`);
  openDbs.push(db);
  return db;
}

export function newEntryInput(overrides: Partial<NewEntry> = {}): NewEntry {
  return {
    loggedAt: Date.parse('2026-10-14T01:00:00Z'),
    fixAt: Date.parse('2026-10-14T01:00:03Z'),
    timeZone: 'Pacific/Auckland',
    utcOffsetMin: 780,
    lat: -36.848461,
    lon: 174.763336,
    accuracyM: 8,
    altitudeM: 12.5,
    altitudeAccuracyM: 4,
    ...overrides,
  };
}

export function jpegBlob(bytes: number): Blob {
  const data = new Uint8Array(bytes);
  data.set([0xff, 0xd8, 0xff]);
  return new Blob([data], { type: 'image/jpeg' });
}
