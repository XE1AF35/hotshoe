import { useId, useState } from 'react';
import { useDb } from '../../db/DbProvider.tsx';
import { updateEntry } from '../../db/entries.ts';
import { type Entry, limits } from '../../db/schema.ts';

type Field = 'label' | 'frame';

/**
 * Label and frame for the entry just logged. Each saves when the field loses focus or on Return,
 * so the next log is never blocked by typing.
 */
export function QuickFields({ entry }: { readonly entry: Entry }) {
  return (
    <div className="grid grid-cols-[1fr_7rem] gap-3">
      <QuickField
        key={`label-${entry.id}`}
        entry={entry}
        field="label"
        label="Label"
        placeholder="e.g. Wharf at dusk"
        maxLength={limits.labelLength}
      />
      <QuickField
        key={`frame-${entry.id}`}
        entry={entry}
        field="frame"
        label="Frame"
        placeholder="e.g. 12"
        maxLength={limits.frameLength}
      />
    </div>
  );
}

function QuickField({
  entry,
  field,
  label,
  placeholder,
  maxLength,
}: {
  readonly entry: Entry;
  readonly field: Field;
  readonly label: string;
  readonly placeholder: string;
  readonly maxLength: number;
}) {
  const db = useDb();
  const id = useId();
  const saved = entry[field] ?? '';
  const [value, setValue] = useState(saved);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (value.trim() === saved) return;
    try {
      await updateEntry(db, entry.id, field === 'label' ? { label: value } : { frame: value });
      setError(null);
    } catch {
      setError(`Couldn't save the ${label.toLowerCase()}. Try again.`);
    }
  }

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block font-medium text-sm">
        {label}
      </label>
      <input
        id={id}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="done"
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        // 16 px text stops iOS zooming in when the field is focused.
        className="min-h-12 w-full rounded-xl border border-line bg-raised px-3 text-base placeholder:text-muted"
      />
      {error && (
        <p id={`${id}-error`} className="text-danger-ink text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
