export interface BackupStatus {
  readonly lastBackupAt: number | null;
  /** Entries added or edited since the last backup. */
  readonly changed: number;
  /** When the oldest of those changes was made. */
  readonly oldestChangeAt: number | null;
}

const dayMs = 86_400_000;

/**
 * A backup is due when there are changes and either enough of them have built up, or the last
 * backup (or, with none yet, the oldest change) is older than the reminder interval.
 */
export function backupDue(
  status: BackupStatus,
  thresholds: { readonly days: number; readonly entries: number },
  now: number,
): boolean {
  if (status.changed === 0) return false;
  if (status.changed >= thresholds.entries) return true;
  const since = status.lastBackupAt ?? status.oldestChangeAt ?? now;
  return now - since >= thresholds.days * dayMs;
}
