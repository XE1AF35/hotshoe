/**
 * What still needs backing up. Kept out of backup.ts, which is loaded only when needed, because
 * the Log screen's reminder reads it on every visit.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { useDb } from '../../db/DbProvider.tsx';
import type { HotshoeDb } from '../../db/database.ts';
import { getSettings, setSetting } from '../../db/settings.ts';
import { formatCount } from '../../lib/format.ts';
import type { CreatedBackup } from './backup.ts';

export interface BackupStatus {
  readonly lastBackupAt: number | null;
  /** Changes made since the last backup that holds them. Deletions never count. */
  readonly pending: {
    readonly entries: number;
    readonly photos: number;
    readonly trips: boolean;
  };
  /**
   * How long the oldest pending change has waited: from the backup it missed, or from when it was
   * made if no backup came before it. Photos count from the last backup that held photos.
   */
  readonly pendingSince: number | null;
  /** When to remind: after this many days, or this many pending entries. */
  readonly reminder: { readonly days: number; readonly entries: number };
}

const dayMs = 86_400_000;

/** The backup status, kept up to date. Undefined while loading. */
export function useBackupStatus(): BackupStatus | undefined {
  const db = useDb();
  return useLiveQuery(() => readBackupStatus(db), [db]);
}

export async function readBackupStatus(db: HotshoeDb): Promise<BackupStatus> {
  const settings = await getSettings(db);
  const since = settings.lastBackupAt ?? 0;
  // Index keys only, in ascending order: reading the photos themselves would load every image.
  const [entryTimes, photoTimes] = (await Promise.all([
    db.entries.where('updatedAt').above(since).keys(),
    db.photos
      .where('createdAt')
      .above(settings.lastPhotoBackupAt ?? 0)
      .keys(),
  ])) as [number[], number[]];
  // Trips are few and not indexed by updatedAt, so all of them are read.
  const tripTimes = (await db.trips.toArray())
    .map((trip) => trip.updatedAt)
    .filter((time) => time > since);
  const entryTripSince =
    entryTimes.length > 0 || tripTimes.length > 0
      ? (settings.lastBackupAt ?? Math.min(...entryTimes, ...tripTimes))
      : null;
  const photoSince =
    photoTimes.length > 0 ? (settings.lastPhotoBackupAt ?? photoTimes[0] ?? null) : null;
  const waiting = [entryTripSince, photoSince].filter((time) => time !== null);
  return {
    lastBackupAt: settings.lastBackupAt,
    pending: {
      entries: entryTimes.length,
      photos: photoTimes.length,
      trips: tripTimes.length > 0,
    },
    pendingSince: waiting.length === 0 ? null : Math.min(...waiting),
    reminder: { days: settings.backupReminderDays, entries: settings.backupReminderEntries },
  };
}

/**
 * A backup is due when something is pending and either enough entries have built up, or it has
 * waited longer than the reminder interval.
 */
export function backupDue(status: BackupStatus, now: number): boolean {
  const { pending, reminder } = status;
  if (!hasPending(status)) return false;
  if (pending.entries >= reminder.entries) return true;
  return now - (status.pendingSince ?? now) >= reminder.days * dayMs;
}

/** `3 entries and 1 photo aren’t backed up yet.`, or null when nothing is pending. */
export function describePending(status: BackupStatus): string | null {
  if (!hasPending(status)) return null;
  const { pending } = status;
  const parts = [
    pending.entries > 0 && formatCount(pending.entries, 'entry', 'entries'),
    pending.photos > 0 && formatCount(pending.photos, 'photo', 'photos'),
    pending.trips && 'trip changes',
  ].filter((part) => part !== false);
  const last = parts.pop();
  // `1 entry isn’t`, but `2 entries`, `trip changes`, and any list `aren’t`.
  const singular = parts.length === 0 && pending.entries + pending.photos === 1 && !pending.trips;
  const list =
    parts.length === 0 ? last : `${parts.join(', ')}${parts.length > 1 ? ',' : ''} and ${last}`;
  const sentence = `${list} ${singular ? 'isn’t' : 'aren’t'} backed up yet.`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function hasPending({ pending }: BackupStatus): boolean {
  return pending.entries > 0 || pending.photos > 0 || pending.trips;
}

/** Call once a backup has been saved or shared. */
export async function recordBackup(
  db: HotshoeDb,
  backup: Pick<CreatedBackup, 'madeAt' | 'includesPhotos'>,
): Promise<void> {
  await db.transaction('rw', db.meta, async () => {
    await setSetting(db, 'lastBackupAt', backup.madeAt);
    if (backup.includesPhotos) await setSetting(db, 'lastPhotoBackupAt', backup.madeAt);
  });
}
