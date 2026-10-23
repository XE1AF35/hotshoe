import { describe, expect, it } from 'vitest';
import { addEntry, deleteEntry, updateEntry } from '../../db/entries.ts';
import { addPhoto, deletePhoto, type NewPhoto } from '../../db/photos.ts';
import type { EntryId } from '../../db/schema.ts';
import { setSetting } from '../../db/settings.ts';
import { addTrip, renameTrip, setCameraClock } from '../../db/trips.ts';
import { createTestDb, jpegBlob, newEntryInput } from '../../test/db.ts';
import { createBackup } from './backup.ts';
import {
  type BackupStatus,
  backupDue,
  describePending,
  readBackupStatus,
  recordBackup,
} from './backupStatus.ts';

const base = Date.parse('2026-10-14T03:00:00Z');
/** A moment some minutes into the test's day. */
const at = (minutes: number) => base + minutes * 60_000;

function photoInput(entryId: EntryId): NewPhoto {
  return {
    entryId,
    takenAt: base,
    source: 'camera',
    image: jpegBlob(400),
    thumb: jpegBlob(40),
    width: 1600,
    height: 1200,
  };
}

describe('readBackupStatus', () => {
  it('counts every entry as pending before the first backup', async () => {
    const db = createTestDb();
    await addEntry(db, newEntryInput(), at(2));
    await addEntry(db, newEntryInput(), at(3));

    const status = await readBackupStatus(db);

    expect(status.lastBackupAt).toBeNull();
    expect(status.pending).toEqual({ entries: 2, photos: 0, trips: false });
    expect(status.pendingSince).toBe(at(2));
  });

  it('notices entries edited after the backup', async () => {
    const db = createTestDb();
    const entry = await addEntry(db, newEntryInput(), at(1));
    await recordBackup(db, await createBackup(db, { includePhotos: true, now: at(5) }));

    await updateEntry(db, entry.id, { label: 'Wharf' }, at(6));

    expect((await readBackupStatus(db)).pending).toEqual({ entries: 1, photos: 0, trips: false });
  });

  it('notices trips renamed or given a camera clock after the backup', async () => {
    const db = createTestDb();
    const waiheke = await addTrip(db, 'Waiheke', at(1));
    const coromandel = await addTrip(db, 'Coromandel', at(1));
    await recordBackup(db, await createBackup(db, { includePhotos: true, now: at(5) }));
    expect((await readBackupStatus(db)).pending.trips).toBe(false);

    await renameTrip(db, waiheke.id, 'Waiheke Island', at(7));
    await setCameraClock(
      db,
      coromandel.id,
      { offsetS: 90, phoneUtcOffsetMin: 780, measuredAt: at(6) },
      at(6),
    );

    const status = await readBackupStatus(db);
    expect(status.pending).toEqual({ entries: 0, photos: 0, trips: true });
    expect(status.pendingSince).toBe(at(5));
  });

  it('never counts deletions, since nothing is lost', async () => {
    const db = createTestDb();
    const kept = await addEntry(db, newEntryInput(), at(1));
    const removed = await addEntry(db, newEntryInput(), at(1));
    const photo = await addPhoto(db, photoInput(kept.id), at(2));
    await recordBackup(db, await createBackup(db, { includePhotos: true, now: at(5) }));

    await deletePhoto(db, photo.id);
    await deleteEntry(db, removed.id);

    expect((await readBackupStatus(db)).pending).toEqual({ entries: 0, photos: 0, trips: false });
  });
});

describe('recordBackup', () => {
  it('marks the moment the backup was made, so later changes stay pending', async () => {
    const db = createTestDb();
    await addEntry(db, newEntryInput(), at(2));
    const backup = await createBackup(db, { includePhotos: true, now: at(5) });
    // Logged while the backup waited to be shared.
    await addEntry(db, newEntryInput(), at(6));

    await recordBackup(db, backup);

    const status = await readBackupStatus(db);
    expect(status.lastBackupAt).toBe(at(5));
    expect(status.pending.entries).toBe(1);
    expect(status.pendingSince).toBe(at(5));
  });

  it('leaves new photos pending after a backup made without them', async () => {
    const db = createTestDb();
    const entry = await addEntry(db, newEntryInput(), at(1));
    await addPhoto(db, photoInput(entry.id), at(2));
    expect((await readBackupStatus(db)).pending).toEqual({ entries: 1, photos: 1, trips: false });

    await recordBackup(db, await createBackup(db, { includePhotos: false, now: at(5) }));
    const withoutPhotos = await readBackupStatus(db);
    expect(withoutPhotos.pending).toEqual({ entries: 0, photos: 1, trips: false });
    // No backup has held photos yet, so the photo has waited since it was added.
    expect(withoutPhotos.pendingSince).toBe(at(2));

    await recordBackup(db, await createBackup(db, { includePhotos: true, now: at(7) }));
    const withPhotos = await readBackupStatus(db);
    expect(withPhotos.pending).toEqual({ entries: 0, photos: 0, trips: false });
    expect(withPhotos.pendingSince).toBeNull();
  });
});

describe('backupDue', () => {
  const day = 86_400_000;
  const now = at(0) + 100 * day;
  const status = (overrides: Partial<BackupStatus>): BackupStatus => ({
    lastBackupAt: now - day,
    pending: { entries: 0, photos: 0, trips: false },
    pendingSince: null,
    reminder: { days: 7, entries: 25 },
    ...overrides,
  });

  it('reads its thresholds from the settings', async () => {
    const db = createTestDb();
    await setSetting(db, 'backupReminderDays', 3);
    await setSetting(db, 'backupReminderEntries', 10);
    expect((await readBackupStatus(db)).reminder).toEqual({ days: 3, entries: 10 });
  });

  it('is never due with nothing pending', () => {
    expect(backupDue(status({ lastBackupAt: null }), now)).toBe(false);
  });

  it('is due once enough entries are pending, however recent the backup', () => {
    const pending = { entries: 25, photos: 0, trips: false };
    expect(backupDue(status({ pending, pendingSince: now - day }), now)).toBe(true);
  });

  it("doesn't count photos towards the entries threshold", () => {
    const pending = { entries: 0, photos: 30, trips: false };
    expect(backupDue(status({ pending, pendingSince: now - day }), now)).toBe(false);
  });

  it('is due when anything has been pending for the interval', () => {
    const pending = { entries: 0, photos: 1, trips: false };
    const old = status({ pending, pendingSince: now - 7 * day });
    expect(backupDue(old, now)).toBe(true);
    expect(backupDue({ ...old, pendingSince: now - 6 * day }, now)).toBe(false);
    expect(backupDue({ ...old, pending: { entries: 0, photos: 0, trips: true } }, now)).toBe(true);
  });

  it('counts pending photos from the last backup that held photos', async () => {
    const db = createTestDb();
    const entry = await addEntry(db, newEntryInput(), at(0));
    await recordBackup(db, await createBackup(db, { includePhotos: true, now: at(0) + day }));
    await addPhoto(db, photoInput(entry.id), at(0) + 2 * day);
    // Backups without photos since then don't make the photo any safer.
    await recordBackup(db, await createBackup(db, { includePhotos: false, now: at(0) + 7 * day }));

    const status = await readBackupStatus(db);
    expect(backupDue(status, at(0) + 7.5 * day)).toBe(false);
    expect(backupDue(status, at(0) + 8 * day)).toBe(true);
  });
});

describe('describePending', () => {
  const text = (entries: number, photos: number, trips: boolean) =>
    describePending({
      lastBackupAt: null,
      pending: { entries, photos, trips },
      pendingSince: null,
      reminder: { days: 7, entries: 25 },
    });

  it('names each kind that is pending', () => {
    expect(text(0, 0, false)).toBeNull();
    expect(text(1, 0, false)).toBe('1 entry isn’t backed up yet.');
    expect(text(3, 2, false)).toBe('3 entries and 2 photos aren’t backed up yet.');
    expect(text(0, 0, true)).toBe('Trip changes aren’t backed up yet.');
    expect(text(1, 1, true)).toBe('1 entry, 1 photo, and trip changes aren’t backed up yet.');
  });
});
