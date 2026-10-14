import { useId, useMemo, useState } from 'react';
import { ShareIcon } from '../../app/icons.tsx';
import type { EntryId } from '../../db/schema.ts';
import { exportFormats } from '../transfer/ExportSection.tsx';
import type { ExportFormat } from '../transfer/formats.ts';
import { usePreparedExport } from '../transfer/usePreparedExport.ts';

/** Stays at the bottom of the list while picking entries, ready to export just those. */
export function SelectionBar({
  picked,
  total,
  changes,
  onSelectAll,
  onSelectNone,
}: {
  readonly picked: ReadonlySet<EntryId>;
  readonly total: number;
  /** The entries, so the export is remade when one is edited. */
  readonly changes: unknown;
  readonly onSelectAll: () => void;
  readonly onSelectNone: () => void;
}) {
  const formatId = useId();
  const [format, setFormat] = useState<ExportFormat>('gpx');
  const entryIds = useMemo(() => [...picked].sort(), [picked]);
  const { ready, message, error, share } = usePreparedExport(format, { entryIds }, changes);
  const count = picked.size;

  return (
    <div className="sticky bottom-3 z-10 space-y-2 rounded-2xl bg-raised p-3 shadow-lg ring-1 ring-line">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <p role="status" className="font-medium">
          {count} selected
        </p>
        <button
          type="button"
          onClick={count === total ? onSelectNone : onSelectAll}
          className="min-h-11 px-2 font-medium text-accent-ink"
        >
          {count === total ? 'Select none' : 'Select all'}
        </button>
      </div>
      {/* Wraps onto two lines when large text makes the row too wide. */}
      <div className="flex flex-wrap gap-2">
        <label htmlFor={formatId} className="sr-only">
          Export format
        </label>
        <select
          id={formatId}
          value={format}
          onChange={(event) => setFormat(event.target.value as ExportFormat)}
          className="min-h-12 max-w-full rounded-xl border border-line bg-surface px-3 text-base"
        >
          {exportFormats.map(({ value, title }) => (
            <option key={value} value={value}>
              {title}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void share()}
          disabled={count === 0 || ready === null}
          className="flex min-h-12 min-w-0 grow basis-40 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-center font-semibold text-on-accent disabled:opacity-60"
        >
          <ShareIcon className="size-5 shrink-0" />
          <span className="min-w-0">Export selected</span>
        </button>
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-danger-ink text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
