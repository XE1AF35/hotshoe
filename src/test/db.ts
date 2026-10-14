import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { HotshoeDb } from '../db/database.ts';

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
