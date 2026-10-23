import { useEffect, useId, useState } from 'react';
import { ShareIcon } from '../../app/icons.tsx';
import { useEntries, useTripEntryCounts, useTrips } from '../../db/hooks.ts';
import type { TripId } from '../../db/schema.ts';
import { formatUtcOffset } from '../../lib/time.ts';
import { describeCameraClock, utcOffsetChoices } from '../trips/cameraClock.ts';
import { softwareZone as zoneFor } from './exportFile.ts';
import { type ExportFormat, exportFormats } from './formats.ts';
import { usePreparedExport } from './usePreparedExport.ts';

export function ExportSection() {
  const entries = useEntries();
  const trips = useTrips();
  const tripCounts = useTripEntryCounts();
  const scopeId = useId();
  const [scope, setScope] = useState<'all' | TripId>('all');
  const [format, setFormat] = useState<ExportFormat>('gpx');
  const [cameraTime, setCameraTime] = useState(true);
  const [chosenZone, setChosenZone] = useState<number | null>(null);
  const cameraTimeId = useId();
  const zoneId = useId();
  const { ready, cameraClock, message, error, share } = usePreparedExport(
    format,
    scope,
    cameraTime ? { softwareUtcOffsetMin: chosenZone } : null,
  );
  const softwareZone = zoneFor(chosenZone, cameraClock);
  const zoneChoices = [...new Set([...utcOffsetChoices, softwareZone])].sort((a, b) => a - b);

  // A trip that has been deleted can't be exported, so fall back to everything.
  useEffect(() => {
    if (scope !== 'all' && trips !== undefined && !trips.some((trip) => trip.id === scope)) {
      setScope('all');
    }
  }, [scope, trips]);

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
            onChange={(event) => setScope(event.target.value as 'all' | TripId)}
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
          {exportFormats.map(({ value, title, detail }) => (
            <label
              key={value}
              className="flex min-h-12 items-start gap-3 rounded-xl px-3 py-2 has-checked:bg-surface"
            >
              <input
                type="radio"
                name="export-format"
                checked={format === value}
                onChange={() => setFormat(value)}
                className="mt-0.5 size-5 shrink-0 accent-accent-ink"
              />
              <span>
                {title}
                <span className="block text-muted text-sm">{detail}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {cameraClock !== null && (
          <div className="space-y-3">
            <label htmlFor={cameraTimeId} className="flex min-h-11 items-start gap-3 px-3">
              <input
                id={cameraTimeId}
                type="checkbox"
                checked={cameraTime}
                onChange={(event) => setCameraTime(event.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-accent-ink"
              />
              <span>
                Match this trip's camera clock
                <span className="block text-muted text-sm">{describeCameraClock(cameraClock)}</span>
              </span>
            </label>
            {cameraTime && (
              <div className="space-y-1 px-3">
                <label htmlFor={zoneId} className="block font-medium text-sm">
                  Time zone you set in your photo software
                </label>
                <select
                  id={zoneId}
                  value={softwareZone}
                  onChange={(event) => setChosenZone(Number(event.target.value))}
                  className="min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-base"
                >
                  {zoneChoices.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {formatUtcOffset(minutes)}
                      {minutes === cameraClock.phoneUtcOffsetMin ? ' (this iPhone)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-muted text-sm">
                  Use the same zone when geotagging, and your photos will line up.
                </p>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => void share()}
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
