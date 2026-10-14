import { useCallback, useMemo, useState } from 'react';
import { CameraIcon } from '../../app/icons.tsx';
import { ScreenHeader } from '../../app/ScreenHeader.tsx';
import { Toast } from '../../app/Toast.tsx';
import { useDb } from '../../db/DbProvider.tsx';
import { type DeletedEntry, restoreEntry } from '../../db/entries.ts';
import { useEntries, usePhotoCounts, useSettings, useTrips } from '../../db/hooks.ts';
import type { Entry, EntryId, Trip, TripId } from '../../db/schema.ts';
import { defaultSettings } from '../../db/settings.ts';
import { formatDay, formatLoggedClock } from '../../lib/format.ts';
import { AccuracyPill } from '../capture/AccuracyPill.tsx';
import { EntrySheet } from './EntrySheet.tsx';
import { groupByDayAndTrip } from './grouping.ts';

export function EntriesScreen() {
  const db = useDb();
  const entries = useEntries();
  const trips = useTrips();
  const settings = useSettings();
  const photoCounts = usePhotoCounts();
  const [openId, setOpenId] = useState<EntryId | null>(null);
  const [deleted, setDeleted] = useState<DeletedEntry | null>(null);
  const dismissToast = useCallback(() => setDeleted(null), []);

  const tripsById = useMemo(
    () => new Map<TripId, Trip>((trips ?? []).map((trip) => [trip.id, trip])),
    [trips],
  );
  const days = useMemo(() => groupByDayAndTrip(entries ?? [], tripsById), [entries, tripsById]);
  const openEntry = entries?.find((entry) => entry.id === openId) ?? null;

  return (
    <section aria-labelledby="screen-title" className="space-y-6">
      <ScreenHeader title="Entries" />

      {entries !== undefined && entries.length === 0 && (
        <p className="text-muted">
          Nothing logged yet. Entries you log appear here, grouped by day and trip.
        </p>
      )}

      {days.map((day) => (
        <section key={day.day} aria-labelledby={`day-${day.day}`} className="space-y-3">
          <h2 id={`day-${day.day}`} className="font-semibold text-lg">
            {formatDay(day.day)}
          </h2>
          {day.trips.map((group) => (
            <div key={group.trip?.id ?? 'none'} className="space-y-1.5">
              <h3 className="px-1 font-semibold text-muted text-xs uppercase tracking-widest">
                {group.trip?.name ?? 'No trip'}
              </h3>
              <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-raised shadow-sm ring-1 ring-line">
                {group.entries.map((entry) => (
                  <li key={entry.id}>
                    <EntryRow
                      entry={entry}
                      accuracyTargetM={settings?.accuracyTargetM ?? defaultSettings.accuracyTargetM}
                      photos={photoCounts?.get(entry.id) ?? 0}
                      onOpen={() => setOpenId(entry.id)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}

      <EntrySheet
        entry={openEntry}
        trips={trips ?? []}
        coordFormat={settings?.coordFormat ?? 'decimal'}
        onClose={() => setOpenId(null)}
        onDeleted={setDeleted}
      />

      {deleted && (
        <Toast
          message="Entry deleted."
          action={{
            label: 'Undo',
            onClick: () => {
              void restoreEntry(db, deleted);
              setDeleted(null);
            },
          }}
          onDismiss={dismissToast}
        />
      )}
    </section>
  );
}

function EntryRow({
  entry,
  accuracyTargetM,
  photos,
  onOpen,
}: {
  readonly entry: Entry;
  readonly accuracyTargetM: number;
  readonly photos: number;
  readonly onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-surface"
    >
      <span className="w-18 shrink-0 font-mono text-sm tabular-nums">
        {formatLoggedClock(entry.loggedAt, entry)}
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className={`block truncate font-medium ${entry.label === null ? 'text-muted' : ''}`}>
          {entry.label ?? 'Untitled'}
        </span>
        <span className="flex items-center gap-2 text-muted text-sm">
          <AccuracyPill accuracyM={entry.accuracyM} targetM={accuracyTargetM} />
          {entry.frame !== null && <span>Frame {entry.frame}</span>}
        </span>
      </span>
      {photos > 0 && (
        <span className="flex items-center gap-1 text-muted text-sm">
          <CameraIcon className="size-4" />
          {photos}
          <span className="sr-only">{photos === 1 ? 'photo' : 'photos'}</span>
        </span>
      )}
    </button>
  );
}
