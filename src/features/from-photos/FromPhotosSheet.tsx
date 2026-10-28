import { useEffect, useId, useState } from 'react';
import { Sheet } from '../../app/Sheet.tsx';
import { useDb } from '../../db/DbProvider.tsx';
import { useActiveTrip, useTrips } from '../../db/hooks.ts';
import { useSettings } from '../../db/SettingsProvider.tsx';
import type { TripId } from '../../db/schema.ts';
import { coordStyleOf } from '../../db/settings.ts';
import { type CoordStyle, formatCoords, type LatLon } from '../../lib/coords.ts';
import { formatCount, formatLoggedTime } from '../../lib/format.ts';
import { parseCoords } from '../../lib/parseCoords.ts';
import { useObjectUrl } from '../../lib/useObjectUrl.ts';
import { describeAccuracy } from '../capture/capture.ts';
import { TripSelect } from '../trips/TripSelect.tsx';
import {
  type DraftLocation,
  isComplete,
  type PhotoDraft,
  placeDraft,
  readPhotoDraft,
  typedTime,
} from './draft.ts';
import { type SaveResult, saveDrafts } from './save.ts';

interface Row {
  /** Its place in the picked files, which stays the same as rows are reordered. */
  readonly key: number;
  readonly draft: PhotoDraft;
  readonly ticked: boolean;
  /** The date and time field's value, for a photo whose time couldn't be found. */
  readonly typed: string;
  /** The coordinates field's value, for a photo whose location couldn't be found. */
  readonly coordsText: string;
  /** A location copied from another row, kept exact while the field still shows it. */
  readonly copied: { readonly text: string; readonly coords: LatLon } | null;
}

/**
 * Shows what each picked photo's metadata says before anything is saved, and saves the ticked
 * ones as Entries on confirm. The batch lives only here, so closing the sheet drops it.
 */
export function FromPhotosSheet({
  files,
  onDone,
}: {
  readonly files: readonly File[];
  /** Called with what was saved, or null when cancelled. */
  readonly onDone: (result: SaveResult | null) => void;
}) {
  const db = useDb();
  const settings = useSettings();
  const trips = useTrips();
  const activeTrip = useActiveTrip();
  const tripSelectId = useId();
  const [deviceZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  // In picked order; shown in time order, which can change as times are typed.
  const [picked, setPicked] = useState<readonly Row[] | null>(null);
  const [chosenTrip, setChosenTrip] = useState<TripId | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let current = true;
    void Promise.all(files.map((file) => readPhotoDraft(file, deviceZone))).then((drafts) => {
      if (current)
        setPicked(
          drafts.map((draft, key) => ({
            key,
            draft,
            ticked: true,
            typed: '',
            coordsText: '',
            copied: null,
          })),
        );
    });
    return () => {
      current = false;
    };
  }, [files, deviceZone]);

  const rows =
    picked && inShotOrder(picked.map((row) => withPlacement(withTypedTime(row, deviceZone))));

  const coordStyle = coordStyleOf(settings);
  const tripId = chosenTrip === undefined ? (activeTrip?.id ?? null) : chosenTrip;
  const ticked = rows?.filter((row) => row.ticked) ?? [];
  const untimed = ticked.some(({ draft }) => draft.time.source === 'missing');
  const unplaced = ticked.some(({ draft }) => draft.location === null);
  const canConfirm = ticked.length > 0 && ticked.every(({ draft }) => isComplete(draft)) && !saving;

  function change(
    key: number,
    update: Partial<Pick<Row, 'ticked' | 'typed' | 'coordsText' | 'copied'>>,
  ) {
    setPicked(
      (current) => current?.map((row) => (row.key === key ? { ...row, ...update } : row)) ?? null,
    );
  }

  async function confirm() {
    setSaving(true);
    const drafts = ticked.map((row) => row.draft);
    onDone(await saveDrafts(db, drafts, tripId, settings.photoQuality));
  }

  function cancel() {
    if (!saving) onDone(null);
  }

  return (
    <Sheet open onClose={cancel} title="From photos">
      {rows === null || trips === undefined || activeTrip === undefined ? (
        <p role="status">Reading photos…</p>
      ) : (
        <>
          <ul aria-label="Photos" className="space-y-2">
            {rows.map((row, index) => {
              const previous = previousLocation(rows, index);
              return (
                <li key={row.key}>
                  <DraftRow
                    row={row}
                    disabled={saving}
                    coordStyle={coordStyle}
                    onToggle={() => change(row.key, { ticked: !row.ticked })}
                    onType={(typed) => change(row.key, { typed })}
                    onCoordsChange={(coordsText) => change(row.key, { coordsText })}
                    onSameAsPrevious={
                      previous &&
                      (() => {
                        const text = formatCoords(previous, coordStyle);
                        change(row.key, { coordsText: text, copied: { text, coords: previous } });
                      })
                    }
                  />
                </li>
              );
            })}
          </ul>

          <div className="space-y-1">
            <label htmlFor={tripSelectId} className="font-medium text-sm">
              Trip
            </label>
            <TripSelect id={tripSelectId} trips={trips} value={tripId} onChange={setChosenTrip} />
          </div>

          {untimed && (
            <p className="text-accent-ink text-sm">
              Type the date and time for each photo with none, or untick it.
            </p>
          )}
          {unplaced && (
            <p className="text-accent-ink text-sm">
              Place each photo with no location, or untick it.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="min-h-12 rounded-xl border border-line font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={!canConfirm}
              className="min-h-12 rounded-xl bg-accent px-3 font-semibold text-on-accent disabled:opacity-50"
            >
              {saving ? 'Adding…' : `Add ${formatCount(ticked.length, 'entry', 'entries')}`}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

/**
 * One photo. The tick's label holds the photo, time, location, and flags, so VoiceOver reads them
 * together. A photo with no time found gets a date and time field below.
 */
function DraftRow({
  row,
  disabled,
  coordStyle,
  onToggle,
  onType,
  onCoordsChange,
  onSameAsPrevious,
}: {
  readonly row: Row;
  readonly disabled: boolean;
  readonly coordStyle: CoordStyle;
  readonly onToggle: () => void;
  readonly onType: (typed: string) => void;
  readonly onCoordsChange: (coordsText: string) => void;
  /** Null when no earlier row has a location to copy. */
  readonly onSameAsPrevious: (() => void) | null;
}) {
  const thumb = useObjectUrl(row.draft.file);
  const timeFieldId = useId();
  const coordsFieldId = useId();
  const coordsErrorId = useId();
  const { file, time, location } = row.draft;
  const needsTime = time.source === 'missing' || time.source === 'typed';
  const needsPlace = location === null || location.origin === 'placed';
  const parsed = row.coordsText.trim() === '' ? null : parseCoords(row.coordsText);
  const coordsProblem = parsed?.ok === false ? parsed.problem : null;

  return (
    <div className="rounded-xl p-2 has-checked:bg-surface">
      <label className="flex min-h-12 items-start gap-3">
        <input
          type="checkbox"
          checked={row.ticked}
          disabled={disabled}
          onChange={onToggle}
          className="mt-1 size-5 shrink-0 accent-accent-ink"
        />
        <span className="size-16 shrink-0 overflow-hidden rounded-lg bg-surface ring-1 ring-line">
          {thumb && (
            <img
              src={thumb}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5 text-sm">
          <span className="break-all font-medium">{file.name}</span>
          {time.source === 'missing' ? (
            <Flag>No time</Flag>
          ) : (
            <span>{formatLoggedTime(time.at, time.context)}</span>
          )}
          {time.source === 'zone-assumed' && <Flag>Time zone assumed</Flag>}
          {time.source === 'file-date' && <Flag>Time from the file date</Flag>}
          {location === null ? (
            <Flag>No location</Flag>
          ) : (
            <span className="text-muted">
              <span className="font-mono tabular-nums">{formatCoords(location, coordStyle)}</span>{' '}
              {describeAccuracy(location)}
            </span>
          )}
        </span>
      </label>
      {needsTime && (
        <div className="mt-2 space-y-1 pl-8">
          <label htmlFor={timeFieldId} className="block text-muted text-sm">
            Date and time<span className="sr-only"> for {file.name}</span>
          </label>
          <input
            id={timeFieldId}
            type="datetime-local"
            value={row.typed}
            disabled={disabled}
            onChange={(event) => onType(event.target.value)}
            className="min-h-12 w-full min-w-0 rounded-xl border border-line bg-raised px-3 text-base"
          />
        </div>
      )}
      {needsPlace && (
        <div className="mt-2 space-y-1 pl-8">
          <label htmlFor={coordsFieldId} className="block text-muted text-sm">
            Coordinates<span className="sr-only"> for {file.name}</span>
          </label>
          <input
            id={coordsFieldId}
            type="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="-36.848461, 174.763336"
            value={row.coordsText}
            disabled={disabled}
            aria-invalid={coordsProblem !== null}
            aria-describedby={coordsProblem === null ? undefined : coordsErrorId}
            onChange={(event) => onCoordsChange(event.target.value)}
            className="min-h-12 w-full min-w-0 rounded-xl border border-line bg-raised px-3 font-mono text-base"
          />
          {coordsProblem !== null && (
            <p id={coordsErrorId} className="text-accent-ink text-sm">
              {coordsProblem}
            </p>
          )}
          {onSameAsPrevious && (
            <button
              type="button"
              onClick={onSameAsPrevious}
              disabled={disabled}
              className="min-h-12 w-full rounded-xl border border-line px-3 font-medium disabled:opacity-50"
            >
              Same place as the previous photo<span className="sr-only"> for {file.name}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Flag({ children }: { readonly children: string }) {
  return (
    <span className="w-fit rounded-full bg-warning px-2 py-0.5 font-medium text-on-warning">
      {children}
    </span>
  );
}

/** A row whose photo had no time, with the time typed for it, if any. */
function withTypedTime(row: Row, deviceZone: string): Row {
  if (row.draft.time.source !== 'missing') return row;
  return { ...row, draft: { ...row.draft, time: typedTime(row.typed, deviceZone) } };
}

/** A row whose photo had no location, placed at the location copied or pasted for it, if any. */
function withPlacement(row: Row): Row {
  if (row.draft.location !== null) return row;
  if (row.copied?.text === row.coordsText) {
    return { ...row, draft: placeDraft(row.draft, row.copied.coords) };
  }
  const parsed = parseCoords(row.coordsText);
  return parsed.ok ? { ...row, draft: placeDraft(row.draft, parsed.coords) } : row;
}

/** The location of the nearest row above this one that has one, or null. */
function previousLocation(rows: readonly Row[], index: number): DraftLocation | null {
  for (let i = index - 1; i >= 0; i -= 1) {
    const location = rows[i]?.draft.location;
    if (location) return location;
  }
  return null;
}

/** Oldest shot first; photos with no time keep their picked order, after the rest. */
function inShotOrder(rows: readonly Row[]): Row[] {
  const at = ({ draft }: Row) =>
    draft.time.source === 'missing' ? Number.POSITIVE_INFINITY : draft.time.at;
  return [...rows].sort((a, b) => (at(a) === at(b) ? 0 : at(a) < at(b) ? -1 : 1));
}
