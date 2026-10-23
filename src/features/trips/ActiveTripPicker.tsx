import { useState } from 'react';
import { Sheet } from '../../app/Sheet.tsx';
import { useDb } from '../../db/DbProvider.tsx';
import { useActiveTrip, useTrips } from '../../db/hooks.ts';
import type { TripId } from '../../db/schema.ts';
import { setActiveTrip } from '../../db/trips.ts';
import { NewTripForm } from './NewTripForm.tsx';

/**
 * Shows the trip new entries join, and changes it. Choosing once saves picking a trip for every
 * entry.
 */
export function ActiveTripPicker() {
  const db = useDb();
  const trips = useTrips();
  const active = useActiveTrip();
  const [open, setOpen] = useState(false);
  const choices = trips?.filter((trip) => trip.archivedAt === null) ?? [];

  async function choose(tripId: TripId | null) {
    await setActiveTrip(db, tripId);
    setOpen(false);
  }

  if (active === undefined) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-full border border-line bg-raised px-4 text-sm"
      >
        <span className="text-muted">Trip:</span>
        <span className="truncate font-medium">{active?.name ?? 'None'}</span>
        <span className="sr-only">, change trip</span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Trip for new entries">
        <fieldset className="space-y-1">
          <legend className="sr-only">Trip for new entries</legend>
          {[{ id: null, name: 'No trip' }, ...choices].map((trip) => (
            <label
              key={trip.id ?? 'none'}
              className="flex min-h-12 items-center gap-3 rounded-xl px-3 has-checked:bg-surface"
            >
              <input
                type="radio"
                name="active-trip"
                checked={trip.id === (active?.id ?? null)}
                onChange={() => void choose(trip.id)}
                className="size-5 accent-accent-ink"
              />
              {trip.name}
            </label>
          ))}
        </fieldset>
        <NewTripForm onCreated={(trip) => void choose(trip.id)} />
      </Sheet>
    </>
  );
}
