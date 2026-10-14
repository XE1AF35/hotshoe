import { describe, expect, it } from 'vitest';
import { backupDue } from './reminder.ts';

const day = 86_400_000;
const now = 100 * day;
const thresholds = { days: 7, entries: 25 };

describe('backupDue', () => {
  it('is never due with nothing to back up', () => {
    expect(
      backupDue({ lastBackupAt: null, changed: 0, oldestChangeAt: null }, thresholds, now),
    ).toBe(false);
  });

  it('is due once enough entries have changed, however recent the backup', () => {
    const status = { lastBackupAt: now - day, changed: 25, oldestChangeAt: now - 1000 };
    expect(backupDue(status, thresholds, now)).toBe(true);
  });

  it('is due when the last backup is older than the interval', () => {
    const status = { lastBackupAt: now - 7 * day, changed: 1, oldestChangeAt: now - 1000 };
    expect(backupDue(status, thresholds, now)).toBe(true);
    expect(backupDue({ ...status, lastBackupAt: now - 6 * day }, thresholds, now)).toBe(false);
  });

  it('with no backup yet, counts from the oldest change', () => {
    const status = { lastBackupAt: null, changed: 3, oldestChangeAt: now - 8 * day };
    expect(backupDue(status, thresholds, now)).toBe(true);
    expect(backupDue({ ...status, oldestChangeAt: now - day }, thresholds, now)).toBe(false);
  });
});
