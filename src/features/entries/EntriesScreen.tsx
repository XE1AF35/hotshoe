import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CameraIcon } from '../../app/icons.tsx';
import { ScreenHeader } from '../../app/ScreenHeader.tsx';
import { Toast } from '../../app/Toast.tsx';
import { useDb } from '../../db/DbProvider.tsx';
import { type DeletedEntry, restoreEntry } from '../../db/entries.ts';
import { useEntries, usePhotoCounts, useSettings, useTrips } from '../../db/hooks.ts';
import { firstThumb } from '../../db/photos.ts';
import type { Entry, EntryId, Trip, TripId } from '../../db/schema.ts';
import { defaultSettings } from '../../db/settings.ts';
import { formatDay, formatLoggedClock } from '../../lib/format.ts';
import { useObjectUrl } from '../../lib/useObjectUrl.ts';
import { AccuracyPill } from '../capture/AccuracyPill.tsx';
import { EntrySheet } from './EntrySheet.tsx';
import { groupByDayAndTrip } from './grouping.ts';
import { SelectionBar } from './SelectionBar.tsx';

export function EntriesScreen() {
  const db = useDb();
  const entries = useEntries();
  const trips = useTrips();
  const settings = useSettings();
  const photoCounts = usePhotoCounts();
  const [openId, setOpenId] = useState<EntryId | null>(null);
  const [deleted, setDeleted] = useState<DeletedEntry | null>(null);
  const dismissToast = useCallback(() => setDeleted(null), []);
  // Select mode: tick entries to export just those.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<EntryId>>(new Set());

  function toggle(id: EntryId) {
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  const tripsById = useMemo(
    () => new Map<TripId, Trip>((trips ?? []).map((trip) => [trip.id, trip])),
    [trips],
  );
  const days = useMemo(() => groupByDayAndTrip(entries ?? [], tripsById), [entries, tripsById]);
  const openEntry = entries?.find((entry) => entry.id === openId) ?? null;

  return (
    <section aria-labelledby="screen-title" className="space-y-6">
      <ScreenHeader title="Entries">
        {entries !== undefined && entries.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setSelecting(!selecting);
              setPicked(new Set());
            }}
            className="min-h-11 rounded-full border border-line bg-raised px-4 font-medium text-sm"
          >
            {selecting ? 'Done' : 'Select'}
          </button>
        )}
      </ScreenHeader>

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
                      selection={
                        selecting
                          ? { checked: picked.has(entry.id), onToggle: () => toggle(entry.id) }
                          : null
                      }
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}

      {selecting && entries !== undefined && (
        <SelectionBar
          picked={picked}
          total={entries.length}
          changes={entries}
          onSelectAll={() => setPicked(new Set(entries.map((entry) => entry.id)))}
          onSelectNone={() => setPicked(new Set())}
        />
      )}

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
  selection,
}: {
  readonly entry: Entry;
  readonly accuracyTargetM: number;
  readonly photos: number;
  readonly onOpen: () => void;
  /** In select mode the row ticks a checkbox instead of opening the entry. */
  readonly selection: { readonly checked: boolean; readonly onToggle: () => void } | null;
}) {
  // Wraps at the largest text sizes, so the time sits above the label instead of off-screen.
  const className =
    'flex min-h-16 w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left active:bg-surface';
  if (selection) {
    return (
      <label className={`${className} has-checked:bg-surface`}>
        <input
          type="checkbox"
          checked={selection.checked}
          onChange={selection.onToggle}
          className="size-5 shrink-0 accent-accent-ink"
        />
        <EntryRowContent entry={entry} accuracyTargetM={accuracyTargetM} photos={photos} />
      </label>
    );
  }
  return (
    <button type="button" onClick={onOpen} className={className}>
      <EntryRowContent entry={entry} accuracyTargetM={accuracyTargetM} photos={photos} />
    </button>
  );
}

function EntryRowContent({
  entry,
  accuracyTargetM,
  photos,
}: {
  readonly entry: Entry;
  readonly accuracyTargetM: number;
  readonly photos: number;
}) {
  return (
    <>
      <span className="min-w-18 shrink-0 font-mono text-sm tabular-nums">
        {formatLoggedClock(entry.loggedAt, entry)}
      </span>
      <span className="min-w-0 flex-1 basis-32 space-y-1">
        <span className={`block truncate font-medium ${entry.label === null ? 'text-muted' : ''}`}>
          {entry.label ?? 'Untitled'}
        </span>
        <span className="flex flex-wrap items-center gap-2 text-muted text-sm">
          <AccuracyPill accuracyM={entry.accuracyM} targetM={accuracyTargetM} />
          {entry.frame !== null && <span>Frame {entry.frame}</span>}
        </span>
      </span>
      {photos > 0 && <RowThumbnail entryId={entry.id} photos={photos} />}
    </>
  );
}

/**
 * The first photo's thumbnail, with a count when there are more. Read only once the row scrolls
 * into view, because each stored photo carries its full image too.
 */
function RowThumbnail({ entryId, photos }: { readonly entryId: EntryId; readonly photos: number }) {
  const db = useDb();
  const box = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const thumb = useLiveQuery(
    () => (visible ? firstThumb(db, entryId) : null),
    [db, entryId, visible],
  );
  const url = useObjectUrl(thumb);

  useEffect(() => {
    const element = box.current;
    if (!element || visible) return;
    const observer = new IntersectionObserver(([seen]) => {
      if (seen?.isIntersecting) setVisible(true);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <span
      ref={box}
      className="relative flex size-12 shrink-0 items-center justify-center rounded-lg bg-surface ring-1 ring-line"
    >
      {url ? (
        <img src={url} alt="" className="size-full rounded-lg object-cover" />
      ) : (
        <CameraIcon className="size-5 text-muted" />
      )}
      {photos > 1 && (
        <span
          aria-hidden="true"
          className="-top-1.5 -right-1.5 absolute flex size-5 items-center justify-center rounded-full bg-ink font-semibold text-surface text-xs"
        >
          {photos}
        </span>
      )}
      <span className="sr-only">{photos === 1 ? '1 photo' : `${photos} photos`}</span>
    </span>
  );
}
