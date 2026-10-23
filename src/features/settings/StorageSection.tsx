import { useEffect, useState } from 'react';
import { useStoredCounts } from '../../db/hooks.ts';
import { useSettings } from '../../db/SettingsProvider.tsx';
import type { PersistResult } from '../../db/settings.ts';
import { formatBytes } from '../../lib/format.ts';

/** What Hotshoe keeps on this iPhone, and whether iOS has agreed to keep it. */
export function StorageSection() {
  const counts = useStoredCounts();
  const settings = useSettings();
  const usage = useStorageUsage(counts?.photoBytes);

  return (
    <section aria-labelledby="storage-heading" className="space-y-2">
      <h2 id="storage-heading" className="font-semibold text-lg">
        Storage
      </h2>
      {counts && (
        <p>
          {plural(counts.entries, 'entry', 'entries')} and{' '}
          {plural(counts.photos, 'photo', 'photos')}
          {counts.photos > 0 && ` (${formatBytes(counts.photoBytes)})`}.
          {usage !== null && ` Hotshoe is using about ${formatBytes(usage)} in all.`}
        </p>
      )}
      <p className="text-muted text-sm">{persistenceText(settings.persistResult)}</p>
    </section>
  );
}

/** The browser's own estimate, which includes the app and map caches. Null where unavailable. */
function useStorageUsage(refreshKey: unknown): number | null {
  const [usage, setUsage] = useState<number | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measured when the photos change.
  useEffect(() => {
    let current = true;
    navigator.storage
      ?.estimate?.()
      .then((estimate) => {
        if (current && estimate.usage !== undefined) setUsage(estimate.usage);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [refreshKey]);
  return usage;
}

function persistenceText(result: PersistResult | null): string {
  switch (result) {
    case 'granted':
      return 'iOS has agreed to keep this data, even when the iPhone is short of space.';
    case 'denied':
    case 'unsupported':
      return "iOS hasn't promised to keep this data if the iPhone runs short of space, so keep a recent backup.";
    default:
      return 'Hotshoe asks iOS to keep its data after you log your first location.';
  }
}

function plural(value: number, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`;
}
