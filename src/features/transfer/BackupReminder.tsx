import { tabHref } from '../../app/router.ts';
import { backupDue, describePending, useBackupStatus } from './backupStatus.ts';

/** A nudge on the Log screen when changes have gone too long without a backup. */
export function BackupReminder() {
  const status = useBackupStatus();
  if (!status || !backupDue(status, Date.now())) return null;

  return (
    <aside
      aria-label="Backup reminder"
      className="flex items-center gap-3 rounded-2xl bg-warning p-4 text-on-warning text-sm"
    >
      <p className="flex-1">{describePending(status)}</p>
      <a
        href={tabHref('more')}
        className="flex min-h-11 items-center rounded-xl bg-on-warning px-3 font-semibold text-warning"
      >
        Back up
      </a>
    </aside>
  );
}
