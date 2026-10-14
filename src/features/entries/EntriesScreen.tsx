import { useCallback, useMemo, useState } from 'react';
import { Toast } from '../../app/Toast.tsx';
import { useDb } from '../../db/DbProvider.tsx';
import { type DeletedEntry, restoreEntry } from '../../db/entries.ts';
import { useEntries, useSettings, useTrips } from '../../db/hooks.ts';
import type { Entry, EntryId, Trip, TripId } from '../../db/schema.ts';
import { formatAccuracy, formatDay, formatLoggedClock } from '../../lib/format.ts';
import { EntrySheet } from './EntrySheet.tsx';
import { groupByDayAndTrip } from './grouping.ts';

export function EntriesScreen() {
  const db = useDb();
  const entries = useEntries();
  const trips = useTrips();
  const settings = useSettings();
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
      <h1 id="screen-title" className="font-semibold text-2xl">
        Entries
      </h1>

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
            <div key={group.trip?.id ?? 'none'} className="space-y-1">
              <h3 className="font-medium text-muted text-sm">{group.trip?.name ?? 'No trip'}</h3>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-raised ring-1 ring-line">
                {group.entries.map((entry) => (
                  <li key={entry.id}>
                    <EntryRow entry={entry} onOpen={() => setOpenId(entry.id)} />
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

function EntryRow({ entry, onOpen }: { readonly entry: Entry; readonly onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left"
    >
      <span className="w-20 shrink-0 text-sm tabular-nums">
        {formatLoggedClock(entry.loggedAt, entry)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{entry.label ?? 'Untitled'}</span>
        <span className="block text-muted text-sm">
          {entry.frame !== null && `Frame ${entry.frame} · `}
          {formatAccuracy(entry.accuracyM)}
        </span>
      </span>
    </button>
  );
}
