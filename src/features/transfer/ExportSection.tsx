import { useEffect, useId, useState } from 'react';
import { ShareIcon } from '../../app/icons.tsx';
import { holdUpdates } from '../../app/updates.ts';
import { useDb } from '../../db/DbProvider.tsx';
import { useEntries, useTripEntryCounts, useTrips } from '../../db/hooks.ts';
import { saveFile } from '../../lib/share.ts';
import type { CreatedExport, ExportScope } from './exportFile.ts';
import type { ExportFormat } from './formats.ts';

const loadExporter = () => import('./exportFile.ts');

const formats: ReadonlyArray<{ value: ExportFormat; title: string; detail: string }> = [
  { value: 'gpx', title: 'GPX', detail: 'For geotagging in Lightroom, darktable, or digiKam.' },
  { value: 'csv', title: 'CSV', detail: 'For spreadsheets.' },
  { value: 'geojson', title: 'GeoJSON', detail: 'For maps and GIS apps.' },
];

export function ExportSection() {
  const db = useDb();
  const entries = useEntries();
  const trips = useTrips();
  const tripCounts = useTripEntryCounts();
  const scopeId = useId();
  const [scope, setScope] = useState<ExportScope>('all');
  const [format, setFormat] = useState<ExportFormat>('gpx');
  const [ready, setReady] = useState<CreatedExport | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The file is made ahead of the tap: iOS only opens the share sheet straight from a tap, so
  // there is no time to read the database in between. It is remade whenever the entries change.
  useEffect(() => {
    if (entries === undefined) return;
    let current = true;
    setReady(null);
    setError(null);
    loadExporter()
      .then(({ createExport }) => createExport(db, { format, scope }))
      .then((created) => {
        if (current) setReady(created);
      })
      .catch(() => {
        if (current) setError("Couldn't prepare the export. Try again.");
      });
    return () => {
      current = false;
    };
  }, [db, entries, format, scope]);

  // A trip that has been deleted can't be exported, so fall back to everything.
  useEffect(() => {
    if (scope !== 'all' && trips !== undefined && !trips.some((trip) => trip.id === scope)) {
      setScope('all');
    }
  }, [scope, trips]);

  async function share(created: CreatedExport) {
    setError(null);
    setMessage(null);
    const release = holdUpdates();
    try {
      const result = await saveFile(created.file);
      if (result !== 'cancelled') setMessage(`Exported ${created.file.name}.`);
    } catch {
      setError("Couldn't share the export. Try again.");
    } finally {
      release();
    }
  }

  return (
    <section aria-labelledby="export-heading" className="space-y-3">
      <h2 id="export-heading" className="font-semibold text-lg">
        Export
      </h2>
      <p className="text-muted text-sm">
        Send your entries to photo software, a map, or a spreadsheet. Exports hold no photos; use a
        backup for those.
      </p>

      <div className="space-y-4 rounded-2xl bg-raised p-4 ring-1 ring-line">
        <div className="space-y-1">
          <label htmlFor={scopeId} className="block font-medium text-sm">
            Entries
          </label>
          <select
            id={scopeId}
            value={scope}
            onChange={(event) => {
              setMessage(null);
              setScope(event.target.value as ExportScope);
            }}
            className="min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-base"
          >
            <option value="all">All entries ({entries?.length ?? 0})</option>
            {(trips ?? []).map((trip) => (
              <option key={trip.id} value={trip.id}>
                {`${trip.name}${trip.archivedAt === null ? '' : ' (archived)'} (${tripCounts?.get(trip.id) ?? 0})`}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="space-y-1">
          <legend className="mb-1 font-medium text-sm">Format</legend>
          {formats.map(({ value, title, detail }) => (
            <label
              key={value}
              className="flex min-h-12 items-start gap-3 rounded-xl px-3 py-2 has-checked:bg-surface"
            >
              <input
                type="radio"
                name="export-format"
                checked={format === value}
                onChange={() => {
                  setMessage(null);
                  setFormat(value);
                }}
                className="mt-0.5 size-5 shrink-0 accent-accent-ink"
              />
              <span>
                {title}
                <span className="block text-muted text-sm">{detail}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <button
          type="button"
          onClick={() => ready && void share(ready)}
          disabled={ready === null || ready.entries === 0}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-60"
        >
          <ShareIcon className="size-5" />
          {ready?.entries === 0 ? 'Nothing to export' : 'Save or share export'}
        </button>
        <p role="status" className="text-sm">
          {message ?? ''}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-danger-ink text-sm">
          {error}
        </p>
      )}
    </section>
  );
}
