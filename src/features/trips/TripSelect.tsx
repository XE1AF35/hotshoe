import type { Trip, TripId } from '../../db/schema.ts';

/**
 * Picks a trip for an entry. Archived trips are hidden unless the entry already belongs to one,
 * so editing an old entry never silently drops its trip.
 */
export function TripSelect({
  id,
  trips,
  value,
  onChange,
}: {
  readonly id: string;
  readonly trips: readonly Trip[];
  readonly value: TripId | null;
  readonly onChange: (tripId: TripId | null) => void;
}) {
  const choices = trips.filter((trip) => trip.archivedAt === null || trip.id === value);
  return (
    <select
      id={id}
      value={value ?? ''}
      onChange={(event) =>
        onChange(event.target.value === '' ? null : (event.target.value as TripId))
      }
      className="min-h-12 w-full rounded-xl border border-line bg-raised px-3 text-base"
    >
      <option value="">No trip</option>
      {choices.map((trip) => (
        <option key={trip.id} value={trip.id}>
          {trip.name}
          {trip.archivedAt !== null ? ' (archived)' : ''}
        </option>
      ))}
    </select>
  );
}
