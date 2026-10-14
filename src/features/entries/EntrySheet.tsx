import { type FormEvent, useId, useState } from 'react';
import { MapIcon } from '../../app/icons.tsx';
import { detailHref } from '../../app/router.ts';
import { Sheet } from '../../app/Sheet.tsx';
import { useDb } from '../../db/DbProvider.tsx';
import { type DeletedEntry, deleteEntry, updateEntry } from '../../db/entries.ts';
import { type Entry, limits, type Trip } from '../../db/schema.ts';
import type { CoordStyle } from '../../lib/coords.ts';
import { formatAccuracy, formatLoggedTime } from '../../lib/format.ts';
import { CoordLines } from '../capture/CoordLines.tsx';
import { CopyCoordsButton } from '../capture/CopyCoordsButton.tsx';
import { PhotoStrip } from '../photos/PhotoStrip.tsx';
import { TripSelect } from '../trips/TripSelect.tsx';

export function EntrySheet({
  entry,
  trips,
  coordStyle,
  onClose,
  onDeleted,
}: {
  readonly entry: Entry | null;
  readonly trips: readonly Trip[];
  readonly coordStyle: CoordStyle;
  readonly onClose: () => void;
  readonly onDeleted: (deleted: DeletedEntry) => void;
}) {
  return (
    <Sheet open={entry !== null} onClose={onClose} title="Entry">
      {entry && (
        <EntryForm
          key={entry.id}
          entry={entry}
          trips={trips}
          coordStyle={coordStyle}
          onClose={onClose}
          onDeleted={onDeleted}
        />
      )}
    </Sheet>
  );
}

function EntryForm({
  entry,
  trips,
  coordStyle,
  onClose,
  onDeleted,
}: {
  readonly entry: Entry;
  readonly trips: readonly Trip[];
  readonly coordStyle: CoordStyle;
  readonly onClose: () => void;
  readonly onDeleted: (deleted: DeletedEntry) => void;
}) {
  const db = useDb();
  const ids = { label: useId(), frame: useId(), trip: useId() };
  const [label, setLabel] = useState(entry.label ?? '');
  const [frame, setFrame] = useState(entry.frame ?? '');
  const [tripId, setTripId] = useState(entry.tripId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      await updateEntry(db, entry.id, { label, frame, tripId });
      onClose();
    } catch {
      setError("Couldn't save your changes. Try again.");
    }
  }

  async function remove() {
    try {
      const deleted = await deleteEntry(db, entry.id);
      onClose();
      if (deleted) onDeleted(deleted);
    } catch {
      setError("Couldn't delete the entry. Try again.");
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="space-y-1">
        <CoordLines coords={entry} style={coordStyle} className="text-lg" />
        <p className="text-muted text-sm">
          {formatLoggedTime(entry.loggedAt, entry)} · {formatAccuracy(entry.accuracyM)}
          {entry.altitudeM !== null && ` · ${Math.round(entry.altitudeM)} m altitude`}
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        {/* Side by side when both labels fit on one line, otherwise stacked full width. */}
        <div className="min-w-0 grow basis-52">
          <CopyCoordsButton coords={entry} style={coordStyle} />
        </div>
        <a
          href={detailHref('map', entry.id)}
          className="flex min-h-12 grow basis-40 items-center justify-center gap-2 rounded-xl border border-line bg-raised px-4 font-medium"
        >
          <MapIcon className="size-5 shrink-0" />
          Show on map
        </a>
      </div>

      <div className="space-y-1">
        <label htmlFor={ids.label} className="block font-medium text-sm">
          Label
        </label>
        <input
          id={ids.label}
          value={label}
          maxLength={limits.labelLength}
          autoComplete="off"
          onChange={(event) => setLabel(event.target.value)}
          className="min-h-12 w-full rounded-xl border border-line bg-raised px-3 text-base"
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-0 basis-28 space-y-1">
          <label htmlFor={ids.frame} className="block font-medium text-sm">
            Frame
          </label>
          <input
            id={ids.frame}
            value={frame}
            maxLength={limits.frameLength}
            autoComplete="off"
            onChange={(event) => setFrame(event.target.value)}
            className="min-h-12 w-full rounded-xl border border-line bg-raised px-3 text-base"
          />
        </div>
        <div className="min-w-0 grow basis-40 space-y-1">
          <label htmlFor={ids.trip} className="block font-medium text-sm">
            Trip
          </label>
          <TripSelect id={ids.trip} trips={trips} value={tripId} onChange={setTripId} />
        </div>
      </div>

      <div className="space-y-1">
        <h3 className="font-medium text-sm">Photos</h3>
        <PhotoStrip entryId={entry.id} />
      </div>

      {error && (
        <p role="alert" className="text-danger-ink text-sm">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="min-h-12 w-full rounded-xl bg-accent font-semibold text-on-accent"
      >
        Save
      </button>

      {confirmingDelete ? (
        <div className="space-y-2 rounded-xl border border-line p-3">
          <p className="text-sm">Delete this entry and its photos?</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="min-h-12 rounded-xl border border-line font-medium"
            >
              Keep
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              className="min-h-12 rounded-xl border border-line font-semibold text-danger-ink"
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="min-h-12 w-full rounded-xl font-medium text-danger-ink"
        >
          Delete entry
        </button>
      )}
    </form>
  );
}
