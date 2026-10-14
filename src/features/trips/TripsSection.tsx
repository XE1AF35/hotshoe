import { type FormEvent, useId, useState } from 'react';
import { Sheet } from '../../app/Sheet.tsx';
import { useDb } from '../../db/DbProvider.tsx';
import { InvalidInputError } from '../../db/errors.ts';
import { useSettings, useTripEntryCounts, useTrips } from '../../db/hooks.ts';
import { limits, type Trip, type TripId } from '../../db/schema.ts';
import { setSetting } from '../../db/settings.ts';
import { deleteTrip, renameTrip, setTripArchived } from '../../db/trips.ts';
import { NewTripForm } from './NewTripForm.tsx';

export function TripsSection() {
  const trips = useTrips();
  const counts = useTripEntryCounts();
  const settings = useSettings();
  const [openId, setOpenId] = useState<TripId | null>(null);
  const openTrip = trips?.find((trip) => trip.id === openId) ?? null;

  return (
    <section aria-labelledby="trips-heading" className="space-y-3">
      <h2 id="trips-heading" className="font-semibold text-lg">
        Trips
      </h2>
      {trips !== undefined && trips.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-raised ring-1 ring-line">
          {trips.map((trip) => (
            <li key={trip.id}>
              <button
                type="button"
                onClick={() => setOpenId(trip.id)}
                className="flex min-h-14 w-full items-center gap-3 px-4 text-left"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{trip.name}</span>
                <span className="text-muted text-sm">
                  {trip.id === settings?.activeTripId && 'Active · '}
                  {trip.archivedAt !== null && 'Archived · '}
                  {entryCount(counts?.get(trip.id) ?? 0)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <NewTripForm onCreated={() => {}} />

      <Sheet open={openTrip !== null} onClose={() => setOpenId(null)} title="Trip">
        {openTrip && (
          <TripForm
            key={openTrip.id}
            trip={openTrip}
            entries={counts?.get(openTrip.id) ?? 0}
            isActive={openTrip.id === settings?.activeTripId}
            onDone={() => setOpenId(null)}
          />
        )}
      </Sheet>
    </section>
  );
}

function entryCount(count: number): string {
  return count === 1 ? '1 entry' : `${count} entries`;
}

function TripForm({
  trip,
  entries,
  isActive,
  onDone,
}: {
  readonly trip: Trip;
  readonly entries: number;
  readonly isActive: boolean;
  readonly onDone: () => void;
}) {
  const db = useDb();
  const id = useId();
  const [name, setName] = useState(trip.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archived = trip.archivedAt !== null;

  async function attempt(action: () => Promise<unknown>) {
    try {
      await action();
      onDone();
    } catch (caught) {
      setError(
        caught instanceof InvalidInputError ? caught.message : 'Something went wrong. Try again.',
      );
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    void attempt(() => renameTrip(db, trip.id, name));
  }

  return (
    <div className="space-y-4">
      <form onSubmit={save} className="space-y-1">
        <label htmlFor={id} className="block font-medium text-sm">
          Name
        </label>
        <div className="flex gap-2">
          <input
            id={id}
            value={name}
            maxLength={limits.tripNameLength}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-raised px-3 text-base"
          />
          <button
            type="submit"
            className="min-h-12 rounded-xl bg-accent px-4 font-semibold text-on-accent"
          >
            Save
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="text-danger-ink text-sm">
          {error}
        </p>
      )}

      <div className="grid gap-2">
        {!archived && (
          <button
            type="button"
            onClick={() =>
              void attempt(() => setSetting(db, 'activeTripId', isActive ? null : trip.id))
            }
            className="min-h-12 rounded-xl border border-line font-medium"
          >
            {isActive ? 'Stop adding new entries to this trip' : 'Add new entries to this trip'}
          </button>
        )}
        <button
          type="button"
          onClick={() => void attempt(() => setTripArchived(db, trip.id, !archived))}
          className="min-h-12 rounded-xl border border-line font-medium"
        >
          {archived ? 'Unarchive' : 'Archive'}
        </button>
        {confirmingDelete ? (
          <div className="space-y-2 rounded-xl border border-line p-3">
            <p className="text-sm">
              Delete this trip? Its {entryCount(entries)} will be kept, without a trip.
            </p>
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
                onClick={() => void attempt(() => deleteTrip(db, trip.id))}
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
            className="min-h-12 rounded-xl font-medium text-danger-ink"
          >
            Delete trip
          </button>
        )}
      </div>
    </div>
  );
}
