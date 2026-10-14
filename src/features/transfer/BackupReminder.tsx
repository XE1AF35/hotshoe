import { tabHref } from '../../app/router.ts';
import { useBackupStatus } from '../../db/hooks.ts';
import type { Settings } from '../../db/settings.ts';
import { backupDue } from './reminder.ts';

/** A nudge on the Log screen when entries have gone too long without a backup. */
export function BackupReminder({
  settings,
}: {
  readonly settings: Pick<Settings, 'backupReminderDays' | 'backupReminderEntries'>;
}) {
  const status = useBackupStatus();
  if (
    !status ||
    !backupDue(
      status,
      { days: settings.backupReminderDays, entries: settings.backupReminderEntries },
      Date.now(),
    )
  ) {
    return null;
  }

  return (
    <aside
      aria-label="Backup reminder"
      className="flex items-center gap-3 rounded-2xl bg-warning p-4 text-on-warning text-sm"
    >
      <p className="flex-1">
        {status.changed} {status.changed === 1 ? 'entry isn’t' : 'entries aren’t'} backed up yet.
      </p>
      <a
        href={tabHref('more')}
        className="flex min-h-11 items-center rounded-xl bg-on-warning px-3 font-semibold text-warning"
      >
        Back up
      </a>
    </aside>
  );
}
