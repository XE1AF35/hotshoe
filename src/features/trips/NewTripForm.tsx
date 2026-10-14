import { type FormEvent, useId, useState } from 'react';
import { useDb } from '../../db/DbProvider.tsx';
import { InvalidInputError } from '../../db/errors.ts';
import { limits, type Trip } from '../../db/schema.ts';
import { addTrip } from '../../db/trips.ts';

/** Creates a trip from a name. */
export function NewTripForm({ onCreated }: { readonly onCreated: (trip: Trip) => void }) {
  const db = useDb();
  const id = useId();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const trip = await addTrip(db, name);
      setName('');
      setError(null);
      onCreated(trip);
    } catch (caught) {
      setError(caught instanceof InvalidInputError ? caught.message : "Couldn't add the trip.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-1">
      <label htmlFor={id} className="block font-medium text-sm">
        New trip
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          value={name}
          maxLength={limits.tripNameLength}
          placeholder="e.g. Coromandel, Easter 2027"
          autoComplete="off"
          enterKeyHint="done"
          onChange={(event) => setName(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-raised px-3 text-base placeholder:text-muted"
        />
        <button
          type="submit"
          className="min-h-12 rounded-xl bg-accent px-4 font-semibold text-on-accent"
        >
          Add
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} className="text-danger-ink text-sm">
          {error}
        </p>
      )}
    </form>
  );
}
