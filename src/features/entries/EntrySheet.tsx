import { type FormEvent, useId, useState } from 'react';
import { Sheet } from '../../app/Sheet.tsx';
import { useDb } from '../../db/DbProvider.tsx';
import { type DeletedEntry, deleteEntry, updateEntry } from '../../db/entries.ts';
import { type Entry, limits, type Trip } from '../../db/schema.ts';
import { type CoordFormat, formatCoords } from '../../lib/coords.ts';
import { formatAccuracy, formatLoggedTime } from '../../lib/format.ts';
import { CopyCoordsButton } from '../capture/CopyCoordsButton.tsx';
import { TripSelect } from '../trips/TripSelect.tsx';

export function EntrySheet({
  entry,
  trips,
  coordFormat,
  onClose,
  onDeleted,
}: {
  readonly entry: Entry | null;
  readonly trips: readonly Trip[];
  readonly coordFormat: CoordFormat;
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
          coordFormat={coordFormat}
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
  coordFormat,
  onClose,
  onDeleted,
}: {
  readonly entry: Entry;
  readonly trips: readonly Trip[];
  readonly coordFormat: CoordFormat;
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
        <p className="font-mono text-lg tabular-nums">{formatCoords(entry, coordFormat)}</p>
        <p className="text-muted text-sm">
          {formatLoggedTime(entry.loggedAt, entry)} · {formatAccuracy(entry.accuracyM)}
          {entry.altitudeM !== null && ` · ${Math.round(entry.altitudeM)} m altitude`}
        </p>
      </div>
      <CopyCoordsButton coords={entry} format={coordFormat} />

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
      <div className="grid grid-cols-[7rem_1fr] gap-3">
        <div className="space-y-1">
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
        <div className="space-y-1">
          <label htmlFor={ids.trip} className="block font-medium text-sm">
            Trip
          </label>
          <TripSelect id={ids.trip} trips={trips} value={tripId} onChange={setTripId} />
        </div>
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
